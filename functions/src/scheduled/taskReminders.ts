import admin from 'firebase-admin';
import { db, ORG_ID } from '../lib/firestore';
import { enqueueDigestNotification, DigestTaskSummary } from '../lib/jobs';
import type { TaskNotificationSettings } from '../lib/types';

type RawTask = FirebaseFirestore.DocumentData & { id: string };

type DigestCategory = 'dueToday' | 'dueTomorrow' | 'startingToday' | 'overdue';

interface DigestBuckets {
  dueToday: DigestTaskSummary[];
  dueTomorrow: DigestTaskSummary[];
  startingToday: DigestTaskSummary[];
  overdue: DigestTaskSummary[];
}

function getTokyoDateString(date = new Date()): string {
  const tzOffsetMinutes = 9 * 60; // JST (UTC+9)
  const utc = date.getTime() + date.getTimezoneOffset() * 60_000;
  const tokyoTime = new Date(utc + tzOffsetMinutes * 60_000);
  return tokyoTime.toISOString().slice(0, 10);
}

function getTomorrowTokyoDateString(): string {
  const tzOffsetMinutes = 9 * 60; // JST (UTC+9)
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const tokyoTime = new Date(utc + tzOffsetMinutes * 60_000);
  tokyoTime.setDate(tokyoTime.getDate() + 1);
  return tokyoTime.toISOString().slice(0, 10);
}

function getTargetOrgIds(): string[] {
  const configured = process.env.TASK_REMINDER_ORG_IDS ?? process.env.TASK_REMINDER_ORG_ID ?? '';
  const candidates = configured
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (candidates.length) {
    return Array.from(new Set(candidates));
  }
  return [ORG_ID];
}

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (trimmed.length >= 10 && trimmed[4] === '-' && trimmed[7] === '-') {
      return trimmed.slice(0, 10);
    }
    return null;
  }
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function getTaskDueDate(task: RawTask): string | null {
  const candidates = [task['期限'], task.end, task['期限日'], task['dueDate']];
  for (const candidate of candidates) {
    const normalized = normalizeDate(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function getTaskStartDate(task: RawTask): string | null {
  const candidates = [task['予定開始日'], task.start, task['開始日'], task['startDate']];
  for (const candidate of candidates) {
    const normalized = normalizeDate(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function getRecipient(task: RawTask): string | null {
  const candidates = [task['担当者メール'], task.assigneeEmail, task.assignee, task.担当者メール, task.担当者];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function shouldNotify(category: DigestCategory, settings?: TaskNotificationSettings | null): boolean {
  if (!settings) return true;
  switch (category) {
    case 'dueToday':
      return settings.期限当日 ?? true;
    case 'dueTomorrow':
      return settings.期限前日 ?? true;
    case 'startingToday':
      return settings.開始日 ?? true;
    case 'overdue':
      return settings.超過 ?? true;
    default:
      return true;
  }
}

function isTaskCompleted(status: unknown): boolean {
  if (!status) return false;
  const normalized = String(status).toLowerCase();
  if (normalized.includes('完了')) return true;
  return normalized === 'done' || normalized === 'completed';
}

function ensureBucket(map: Map<string, DigestBuckets>, recipient: string): DigestBuckets {
  if (!map.has(recipient)) {
    map.set(recipient, { dueToday: [], dueTomorrow: [], startingToday: [], overdue: [] });
  }
  return map.get(recipient)!;
}

function addTaskToDigest(
  bucketsMap: Map<string, DigestBuckets>,
  seen: Record<DigestCategory, Set<string>>,
  recipient: string,
  category: DigestCategory,
  summary: DigestTaskSummary
) {
  const key = `${recipient}::${summary.taskId}`;
  if (seen[category].has(key)) {
    return;
  }
  seen[category].add(key);
  const bucket = ensureBucket(bucketsMap, recipient);
  bucket[category].push(summary);
}

export async function runDailyTaskReminders() {
  const today = getTokyoDateString();
  const tomorrow = getTomorrowTokyoDateString();
  const orgIds = getTargetOrgIds();
  const evaluatedTaskIds = new Set<string>();
  let enqueued = 0;

  for (const orgId of orgIds) {
    const bucketsMap = new Map<string, DigestBuckets>();
    const seen: Record<DigestCategory, Set<string>> = {
      dueToday: new Set(),
      dueTomorrow: new Set(),
      startingToday: new Set(),
      overdue: new Set(),
    };
    const tasksRef = db.collection('orgs').doc(orgId).collection('tasks');
    const projectsRef = db.collection('orgs').doc(orgId).collection('projects');
    const usersRef = db.collection('users');

    // Cache for project names and user info
    const projectNames = new Map<string, string>();
    const userInfoCache = new Map<string, { displayName: string; orgName: string }>();

    const processSnapshot = async (
      snapshot: FirebaseFirestore.QuerySnapshot,
      category: DigestCategory,
      filter?: (task: RawTask) => boolean
    ) => {
      if (snapshot.empty) return;
      for (const doc of snapshot.docs) {
        const data = doc.data() as FirebaseFirestore.DocumentData;
        const task: RawTask = { id: doc.id, ...data };
        evaluatedTaskIds.add(task.id);

        if (filter && !filter(task)) {
          continue;
        }

        if (category !== 'startingToday' && isTaskCompleted(task.ステータス)) {
          continue;
        }

        const recipient = getRecipient(task);
        if (!recipient) {
          continue;
        }

        const settings = (task['通知設定'] ?? null) as TaskNotificationSettings | null;
        if (!shouldNotify(category, settings)) {
          continue;
        }

        const dueDate = getTaskDueDate(task);
        const startDate = getTaskStartDate(task);
        const projectId = String(task.projectId ?? task['ProjectID'] ?? '');

        // Get project name if not cached
        if (projectId && !projectNames.has(projectId)) {
          try {
            const projectDoc = await projectsRef.doc(projectId).get();
            if (projectDoc.exists) {
              const projectData = projectDoc.data();
              projectNames.set(projectId, projectData?.物件名 || projectId);
            } else {
              projectNames.set(projectId, projectId);
            }
          } catch (error) {
            console.error('[TaskReminders] Failed to fetch project name', { projectId, error });
            projectNames.set(projectId, projectId);
          }
        }

        const summary: DigestTaskSummary = {
          taskId: task.id,
          taskName: String(task.タスク名 ?? task.taskName ?? '(無題タスク)'),
          projectId,
          projectName: projectNames.get(projectId) || projectId,
          status: task.ステータス ?? task.status ?? null,
          startDate,
          dueDate,
        };
        addTaskToDigest(bucketsMap, seen, recipient, category, summary);
      }
    };

    try {
      await processSnapshot(await tasksRef.where('期限', '==', today).get(), 'dueToday');
      await processSnapshot(await tasksRef.where('end', '==', today).get(), 'dueToday');
      await processSnapshot(await tasksRef.where('期限', '==', tomorrow).get(), 'dueTomorrow');
      await processSnapshot(await tasksRef.where('end', '==', tomorrow).get(), 'dueTomorrow');
      await processSnapshot(await tasksRef.where('予定開始日', '==', today).get(), 'startingToday');
      await processSnapshot(await tasksRef.where('start', '==', today).get(), 'startingToday');
      await processSnapshot(
        await tasksRef.where('期限', '<', today).get(),
        'overdue',
        (task) => {
          const dueDate = getTaskDueDate(task);
          if (!dueDate) return false;
          return dueDate < today;
        }
      );
      await processSnapshot(
        await tasksRef.where('end', '<', today).get(),
        'overdue',
        (task) => {
          const dueDate = getTaskDueDate(task);
          if (!dueDate) return false;
          return dueDate < today;
        }
      );
    } catch (error) {
      console.error('[TaskReminders] Failed to collect tasks', { orgId, error });
      continue;
    }

    // Get organization name
    let orgName = orgId;
    try {
      const orgDoc = await db.collection('orgs').doc(orgId).get();
      if (orgDoc.exists) {
        orgName = orgDoc.data()?.name || orgId;
      }
    } catch (error) {
      console.error('[TaskReminders] Failed to fetch org name', { orgId, error });
    }

    for (const [recipient, digest] of bucketsMap) {
      // Get user info
      let recipientName = recipient;
      if (!userInfoCache.has(recipient)) {
        try {
          const userSnapshot = await usersRef
            .where('email', '==', recipient)
            .where('orgId', '==', orgId)
            .limit(1)
            .get();
          if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data();
            recipientName = userData.displayName || recipient;
            userInfoCache.set(recipient, { displayName: recipientName, orgName });
          } else {
            userInfoCache.set(recipient, { displayName: recipient, orgName });
          }
        } catch (error) {
          console.error('[TaskReminders] Failed to fetch user info', { recipient, error });
          userInfoCache.set(recipient, { displayName: recipient, orgName });
        }
      }

      const userInfo = userInfoCache.get(recipient)!;

      await enqueueDigestNotification({
        recipient,
        recipientName: userInfo.displayName,
        orgName: userInfo.orgName,
        date: today,
        dueToday: digest.dueToday,
        dueTomorrow: digest.dueTomorrow,
        startingToday: digest.startingToday,
        overdue: digest.overdue,
      });
      enqueued += 1;
    }

    if (!bucketsMap.size) {
      console.log(`[TaskReminders] No tasks matched for org ${orgId} (${today})`);
    }
  }

  console.log('[TaskReminders] Summary', {
    today,
    orgIds,
    evaluated: evaluatedTaskIds.size,
    enqueued,
  });
}
