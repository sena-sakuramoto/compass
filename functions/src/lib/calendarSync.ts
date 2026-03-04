import admin from 'firebase-admin';
import { calendar_v3 } from 'googleapis';
import { getUserCalendarClient } from './perUserGoogleClient';
import { db, TaskDoc } from './firestore';

const tasksCollection = (orgId: string) => db.collection('orgs').doc(orgId).collection('tasks');

function toAllDayEventDates(startIso: string, endIso?: string | null) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid start date: ${startIso}`);
  }
  const end = endIso ? new Date(endIso) : start;
  if (Number.isNaN(end.getTime())) {
    throw new Error(`Invalid end date: ${endIso}`);
  }
  const endExclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const toDateString = (date: Date) => date.toISOString().slice(0, 10);
  return {
    start: toDateString(start),
    end: toDateString(endExclusive),
  };
}

function buildEvent(task: TaskDoc) {
  const summary = `[Compass] ${task.タスク名 ?? '(無題タスク)'}`;
  const descriptionLines = [
    `プロジェクト: ${task.projectId ?? ''}`,
    `担当者: ${task.assignee ?? task.担当者 ?? ''}`,
    `ステータス: ${task.ステータス ?? ''}`,
    task.ballHolder ? `ボール: ${task.ballHolder}` : '',
    task.ballNote ? `メモ: ${task.ballNote}` : '',
    '',
    'Project Compass から同期された予定です。',
  ].filter(Boolean);
  const description = descriptionLines.join('\n');

  const startDate = task.start ?? task.予定開始日 ?? task.実績開始日;
  const endDate = task.end ?? task.期限 ?? task.実績完了日 ?? task.start ?? task.予定開始日;
  if (!startDate) {
    throw new Error('タスクに開始日が設定されていません');
  }
  const timezone = process.env.CALENDAR_TIMEZONE ?? 'Asia/Tokyo';
  const hasTimeRange = Boolean(task.startTime && task.endTime);

  if (hasTimeRange) {
    return {
      summary,
      description,
      start: { dateTime: `${startDate}T${task.startTime}:00`, timeZone: timezone },
      end: { dateTime: `${endDate ?? startDate}T${task.endTime}:00`, timeZone: timezone },
    } as calendar_v3.Schema$Event;
  }

  const { start, end } = toAllDayEventDates(startDate, endDate);

  return {
    summary,
    description,
    start: { date: start, timeZone: timezone },
    end: { date: end, timeZone: timezone },
  } as calendar_v3.Schema$Event;
}

function isNotFoundError(error: any): boolean {
  const status = error?.code ?? error?.status ?? error?.response?.status;
  return status === 404;
}

async function clearTaskEventId(task: TaskDoc, orgId: string) {
  await tasksCollection(orgId).doc(task.id).update({
    'カレンダーイベントID': null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function syncTaskToCalendar(
  task: TaskDoc,
  mode: 'push' | 'sync' | 'delete',
  userId?: string | null,
  orgId?: string
) {
  if (!userId) {
    console.warn('[calendarSync] userId is missing. Skip sync.', { taskId: task.id, mode });
    return;
  }

  const targetOrgId = orgId ?? task.orgId;
  if (!targetOrgId) {
    console.warn('[calendarSync] orgId is missing. Skip sync.', { taskId: task.id, mode });
    return;
  }

  let calendarId = 'primary';
  const syncSettingsDoc = await db
    .collection('users')
    .doc(userId)
    .collection('private')
    .doc('calendarSyncSettings')
    .get();
  const syncSettings = syncSettingsDoc.data();

  if (syncSettings?.outbound?.enabled && syncSettings?.outbound?.calendarId) {
    calendarId = syncSettings.outbound.calendarId;
  } else {
    // Backward compatibility for existing users.
    const tokenDoc = await db.collection('users').doc(userId).collection('private').doc('googleTokens').get();
    calendarId = tokenDoc.data()?.syncCalendarId || 'primary';
  }
  let calendar: calendar_v3.Calendar;
  try {
    calendar = await getUserCalendarClient(userId);
  } catch (error) {
    console.warn('[calendarSync] Failed to get per-user calendar client. Skip sync.', {
      taskId: task.id,
      mode,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (mode === 'delete') {
    const existingEventId = task['カレンダーイベントID'];
    if (!existingEventId) return;

    try {
      await calendar.events.delete({ calendarId, eventId: existingEventId });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    await clearTaskEventId(task, targetOrgId);
    return;
  }

  const event = buildEvent(task);

  const existingId = task['カレンダーイベントID'];
  let savedEventId = existingId ?? null;

  if (existingId) {
    try {
      await calendar.events.patch({
        calendarId,
        eventId: existingId,
        requestBody: event,
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      savedEventId = null;
    }
  }

  if (!savedEventId) {
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });
    savedEventId = response.data.id ?? null;
  }

  if (savedEventId && savedEventId !== existingId) {
    await tasksCollection(targetOrgId)
      .doc(task.id)
      .update({
        'カレンダーイベントID': savedEventId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }
}
