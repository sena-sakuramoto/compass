import admin from 'firebase-admin';
import { db, ORG_ID } from '../lib/firestore';
import { enqueueDigestNotification, DigestTaskSummary } from '../lib/jobs';
import type { TaskNotificationSettings } from '../lib/types';

type RawTask = FirebaseFirestore.DocumentData & { id: string };

type DigestCategory = 'dueToday' | 'startingToday' | 'overdue';

interface DigestBuckets {
  dueToday: DigestTaskSummary[];
  startingToday: DigestTaskSummary[];
  overdue: DigestTaskSummary[];
}

function getTokyoDateString(date = new Date()): string {
  const tzOffsetMinutes = 9 * 60; // JST (UTC+9)
  const utc = date.getTime() + date.getTimezoneOffset() * 60_000;
  const tokyoTime = new Date(utc + tzOffsetMinutes * 60_000);
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
    map.set(recipient, { dueToday: [], startingToday: [], overdue: [] });
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
  const orgIds = getTargetOrgIds();
  const evaluatedTaskIds = new Set<string>();
  let enqueued = 0;

  for (const orgId of orgIds) {
    const bucketsMap = new Map<string, DigestBuckets>();
    const seen: Record<DigestCategory, Set<string>> = {
      dueToday: new Set(),
      startingToday: new Set(),
      overdue: new Set(),
    };
    const tasksRef = db.collection('orgs').doc(orgId).collection('tasks');

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
        const summary: DigestTaskSummary = {
          taskId: task.id,
          taskName: String(task.タスク名 ?? task.taskName ?? '(無題タスク)'),
          projectId: String(task.projectId ?? task['ProjectID'] ?? ''),
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

    for (const [recipient, digest] of bucketsMap) {
      await enqueueDigestNotification({
        recipient,
        date: today,
        dueToday: digest.dueToday,
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
