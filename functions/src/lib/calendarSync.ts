import admin from 'firebase-admin';
import { calendar_v3 } from 'googleapis';
import { getCalendarClient } from './googleClients';
import { db, ORG_ID, TaskDoc } from './firestore';

const tasksCollection = () => db.collection('orgs').doc(ORG_ID).collection('tasks');

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
    '',
    'Project Compass から同期された予定です。',
  ];
  const description = descriptionLines.join('\n');

  const startDate = task.start ?? task.予定開始日 ?? task.実績開始日;
  const endDate = task.end ?? task.期限 ?? task.実績完了日 ?? task.start ?? task.予定開始日;
  if (!startDate) {
    throw new Error('タスクに開始日が設定されていません');
  }
  const { start, end } = toAllDayEventDates(startDate, endDate);

  return {
    summary,
    description,
    start: { date: start, timeZone: process.env.CALENDAR_TIMEZONE ?? 'Asia/Tokyo' },
    end: { date: end, timeZone: process.env.CALENDAR_TIMEZONE ?? 'Asia/Tokyo' },
  } as calendar_v3.Schema$Event;
}

export async function syncTaskToCalendar(task: TaskDoc, _mode: 'push' | 'sync') {
  const calendarId = process.env.CALENDAR_ID || 'primary';
  const calendar = await getCalendarClient();
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
      console.warn('[calendar] 既存イベント更新に失敗したため、新規作成を試みます', error);
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
    await tasksCollection()
      .doc(task.id)
      .update({
        'カレンダーイベントID': savedEventId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }
}
