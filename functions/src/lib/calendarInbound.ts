import admin from 'firebase-admin';
import { calendar_v3 } from 'googleapis';
import { getUserCalendarClient } from './perUserGoogleClient';
import { createProject, db } from './firestore';

const importedEventsCollection = (orgId: string) =>
  db.collection('orgs').doc(orgId).collection('importedEvents');

const FALLBACK_PROJECT_SYSTEM_TYPE = 'calendarInboundInbox';
const FALLBACK_PROJECT_NAME = '未分類（カレンダー取込）';
const FALLBACK_PROJECT_NOTE =
  'Google Calendar Inbound同期で、プロジェクト未設定イベントの取り込み先として自動作成されました。';

export interface InboundSyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

/**
 * Google Calendar -> Compass のインバウンド同期を実行
 */
export async function syncInboundCalendar(userId: string, orgId: string): Promise<InboundSyncResult> {
  const result: InboundSyncResult = { created: 0, updated: 0, deleted: 0, errors: [] };

  const settingsRef = db
    .collection('users')
    .doc(userId)
    .collection('private')
    .doc('calendarSyncSettings');
  const settingsDoc = await settingsRef.get();
  const settings = settingsDoc.data();

  if (!settings?.inbound?.enabled || !settings?.inbound?.calendarId) {
    return result;
  }

  const inbound = settings.inbound;
  const calendarId = String(inbound.calendarId);
  const syncToken = (inbound.syncToken as string | null | undefined) ?? null;
  const importAsType: 'task' | 'meeting' = inbound.importAsType === 'meeting' ? 'meeting' : 'task';
  const configuredDefaultProjectId = (inbound.defaultProjectId as string | null | undefined) ?? null;
  let defaultProjectId: string;

  let calendar: calendar_v3.Calendar;
  try {
    calendar = await getUserCalendarClient(userId);
  } catch (error) {
    result.errors.push(
      `Google Calendar クライアントの取得に失敗: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return result;
  }

  try {
    const resolvedProjectId = await resolveInboundProjectId({
      orgId,
      userId,
      preferredProjectId: configuredDefaultProjectId,
    });
    if (!resolvedProjectId) {
      result.errors.push('取り込み先プロジェクトを解決できませんでした');
      return result;
    }
    defaultProjectId = resolvedProjectId;
  } catch (error) {
    result.errors.push(
      `取り込み先プロジェクトの解決に失敗: ${error instanceof Error ? error.message : String(error)}`
    );
    return result;
  }

  let events: calendar_v3.Schema$Event[] = [];
  let nextSyncToken: string | null = null;
  let shouldResetSyncToken = false;

  try {
    if (syncToken) {
      const listRes = await calendar.events.list({
        calendarId,
        syncToken,
        singleEvents: true,
        showDeleted: true,
      });
      events = listRes.data.items ?? [];
      nextSyncToken = listRes.data.nextSyncToken ?? null;
    } else {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const listRes = await calendar.events.list({
        calendarId,
        timeMin: now.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        showDeleted: false,
      });
      events = listRes.data.items ?? [];
      nextSyncToken = listRes.data.nextSyncToken ?? null;
    }
  } catch (error: any) {
    if (error?.code === 410 || error?.status === 410) {
      shouldResetSyncToken = true;
      console.warn('[calendarInbound] syncToken expired, falling back to full sync');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      try {
        const listRes = await calendar.events.list({
          calendarId,
          timeMin: now.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
          showDeleted: false,
        });
        events = listRes.data.items ?? [];
        nextSyncToken = listRes.data.nextSyncToken ?? null;
      } catch (retryError: any) {
        result.errors.push(`Google Calendar API エラー（リトライ）: ${retryError?.message ?? String(retryError)}`);
        return result;
      }
    } else {
      result.errors.push(`Google Calendar API エラー: ${error?.message ?? String(error)}`);
      return result;
    }
  }

  const tasksCollection = db.collection('orgs').doc(orgId).collection('tasks');

  for (const event of events) {
    if (!event.id) continue;

    try {
      if (event.status === 'cancelled') {
        const deletedCount = await handleDeletedEvent(event.id, calendarId, orgId, tasksCollection);
        result.deleted += deletedCount;
        continue;
      }

      if (inbound.syncMode === 'accepted') {
        const selfAttendee = event.attendees?.find((attendee) => attendee.self === true);
        if (selfAttendee && selfAttendee.responseStatus !== 'accepted') {
          continue;
        }
      }

      const mappingQuery = await importedEventsCollection(orgId)
        .where('googleEventId', '==', event.id)
        .where('googleCalendarId', '==', calendarId)
        .limit(1)
        .get();

      if (!mappingQuery.empty) {
        const mapping = mappingQuery.docs[0];
        const taskId = mapping.data().taskId as string;
        const updates = eventToTaskUpdate(event);

        const taskRef = tasksCollection.doc(taskId);
        const taskDoc = await taskRef.get();
        if (!taskDoc.exists) {
          await mapping.ref.delete();
          const taskData = eventToNewTask(event, defaultProjectId, importAsType, orgId);
          const createdRef = await tasksCollection.add({
            ...taskData,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await importedEventsCollection(orgId).add({
            googleEventId: event.id,
            googleCalendarId: calendarId,
            taskId: createdRef.id,
            projectId: defaultProjectId,
            userId,
            eventUpdatedAt: event.updated ?? new Date().toISOString(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          result.created += 1;
          continue;
        }

        await taskRef.update({
          ...updates,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await mapping.ref.update({
          eventUpdatedAt: event.updated ?? new Date().toISOString(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        result.updated += 1;
      } else {
        const taskData = eventToNewTask(event, defaultProjectId, importAsType, orgId);
        const taskRef = await tasksCollection.add({
          ...taskData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await importedEventsCollection(orgId).add({
          googleEventId: event.id,
          googleCalendarId: calendarId,
          taskId: taskRef.id,
          projectId: defaultProjectId,
          userId,
          eventUpdatedAt: event.updated ?? new Date().toISOString(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        result.created += 1;
      }
    } catch (error: any) {
      result.errors.push(`イベント ${event.id}: ${error?.message ?? String(error)}`);
    }
  }

  const updatePayload: Record<string, unknown> = {
    'inbound.lastSyncAt': admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (configuredDefaultProjectId !== defaultProjectId) {
    updatePayload['inbound.defaultProjectId'] = defaultProjectId;
  }
  if (nextSyncToken !== null) {
    updatePayload['inbound.syncToken'] = nextSyncToken;
  } else if (shouldResetSyncToken) {
    updatePayload['inbound.syncToken'] = null;
  }
  await settingsRef.set(updatePayload, { merge: true });

  return result;
}

async function resolveInboundProjectId(params: {
  orgId: string;
  userId: string;
  preferredProjectId: string | null;
}): Promise<string | null> {
  const { orgId, userId, preferredProjectId } = params;

  if (preferredProjectId) {
    const preferredProject = await db
      .collection('orgs')
      .doc(orgId)
      .collection('projects')
      .doc(preferredProjectId)
      .get();
    if (preferredProject.exists && !preferredProject.data()?.deletedAt) {
      return preferredProjectId;
    }
    console.warn('[calendarInbound] configured default project is missing or deleted', {
      orgId,
      userId,
      projectId: preferredProjectId,
    });
  }

  const fallbackQuery = await db
    .collection('orgs')
    .doc(orgId)
    .collection('projects')
    .where('calendarInboundInboxUserId', '==', userId)
    .limit(10)
    .get();

  const existingFallback = fallbackQuery.docs.find((doc) => {
    const data = doc.data();
    if (data?.deletedAt) return false;
    return data?.systemType === FALLBACK_PROJECT_SYSTEM_TYPE;
  });
  if (existingFallback) {
    return existingFallback.id;
  }

  const createdProjectId = await createProject(
    {
      物件名: FALLBACK_PROJECT_NAME,
      ステータス: '進行中',
      優先度: '中',
      備考: FALLBACK_PROJECT_NOTE,
    },
    orgId,
    userId
  );

  await db
    .collection('orgs')
    .doc(orgId)
    .collection('projects')
    .doc(createdProjectId)
    .set(
      {
        systemType: FALLBACK_PROJECT_SYSTEM_TYPE,
        calendarInboundInboxUserId: userId,
        isSystemGenerated: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return createdProjectId;
}

function eventToTaskUpdate(event: calendar_v3.Schema$Event): Record<string, any> {
  const updates: Record<string, any> = {};

  if (event.summary) {
    updates['タスク名'] = event.summary;
  }

  const { startDate, endDate, startTime, endTime } = extractEventDates(event);
  updates['予定開始日'] = startDate;
  updates['期限'] = endDate;
  updates.start = startDate;
  updates.end = endDate;
  updates.startTime = startTime;
  updates.endTime = endTime;

  return updates;
}

function eventToNewTask(
  event: calendar_v3.Schema$Event,
  projectId: string,
  type: 'task' | 'meeting',
  orgId: string
): Record<string, any> {
  const { startDate, endDate, startTime, endTime } = extractEventDates(event);

  return {
    projectId,
    orgId,
    type,
    タスク名: event.summary ?? '(Google Calendar イベント)',
    タスク種別: type === 'meeting' ? '打合せ' : 'タスク',
    ステータス: '未着手',
    予定開始日: startDate,
    期限: endDate,
    start: startDate,
    end: endDate,
    startTime,
    endTime,
    担当者: null,
    assignee: null,
    優先度: '中',
    calendarSync: false,
    parentId: null,
    orderIndex: null,
    マイルストーン: false,
    milestone: false,
  };
}

function extractEventDates(event: calendar_v3.Schema$Event): {
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
} {
  let startDate: string | null = null;
  let endDate: string | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;

  if (event.start?.date) {
    startDate = event.start.date;
    if (event.end?.date) {
      const endExclusive = new Date(`${event.end.date}T00:00:00Z`);
      endExclusive.setUTCDate(endExclusive.getUTCDate() - 1);
      endDate = endExclusive.toISOString().slice(0, 10);
    } else {
      endDate = startDate;
    }
  } else if (event.start?.dateTime) {
    const startParts = parseDateTimeParts(event.start.dateTime);
    startDate = startParts.date;
    startTime = startParts.time;

    if (event.end?.dateTime) {
      const endParts = parseDateTimeParts(event.end.dateTime);
      endDate = endParts.date;
      endTime = endParts.time;
    } else {
      endDate = startDate;
    }
  }

  return { startDate, endDate, startTime, endTime };
}

function parseDateTimeParts(dateTime: string): { date: string | null; time: string | null } {
  const matched = dateTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (matched) {
    return { date: matched[1], time: matched[2] };
  }
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) {
    return { date: null, time: null };
  }
  return {
    date: parsed.toISOString().slice(0, 10),
    time: parsed.toISOString().slice(11, 16),
  };
}

async function handleDeletedEvent(
  googleEventId: string,
  calendarId: string,
  orgId: string,
  tasksCollection: FirebaseFirestore.CollectionReference
): Promise<number> {
  const mappingQuery = await importedEventsCollection(orgId)
    .where('googleEventId', '==', googleEventId)
    .where('googleCalendarId', '==', calendarId)
    .limit(1)
    .get();

  if (mappingQuery.empty) return 0;

  const mapping = mappingQuery.docs[0];
  const taskId = mapping.data().taskId as string;

  const taskDoc = await tasksCollection.doc(taskId).get();
  if (taskDoc.exists) {
    await tasksCollection.doc(taskId).update({
      ステータス: '完了',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await mapping.ref.delete();
  return 1;
}
