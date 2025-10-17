// Google Calendar API統合

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import type { Task } from './types';

const GSA_CLIENT_EMAIL = process.env.GSA_CLIENT_EMAIL;
const GSA_PRIVATE_KEY = process.env.GSA_PRIVATE_KEY?.replace(/\\n/g, '\n');
const ORG_ID = process.env.ORG_ID || 'archi-prisma';

/**
 * Calendar APIクライアントを取得（ドメインワイド委任）
 */
function getCalendarClient(userEmail: string) {
  if (!GSA_CLIENT_EMAIL || !GSA_PRIVATE_KEY) {
    throw new Error('Calendar API credentials not configured');
  }

  const auth = new JWT({
    email: GSA_CLIENT_EMAIL,
    key: GSA_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: userEmail, // ドメインワイド委任: このユーザーのカレンダーにアクセス
  });

  return google.calendar({ version: 'v3', auth });
}

/**
 * タスクからカレンダーイベントを作成
 */
export async function createCalendarEvent(task: Task): Promise<string> {
  const userEmail = task.担当者メール;
  if (!userEmail) {
    throw new Error('担当者メールが設定されていません');
  }

  const calendar = getCalendarClient(userEmail);

  const start = task.予定開始日 || task.start;
  const end = task.期限 || task.end;

  if (!start && !end) {
    throw new Error('開始日または期限が設定されていません');
  }

  // 終日イベントかどうかを判定（時刻情報がない場合）
  const isAllDay = !start?.includes('T') && !end?.includes('T');

  const eventStart = isAllDay
    ? { date: start || end }
    : { dateTime: start || end, timeZone: 'Asia/Tokyo' };

  const eventEnd = isAllDay
    ? { date: end || start }
    : { dateTime: end || start, timeZone: 'Asia/Tokyo' };

  const event = {
    summary: task.タスク名,
    description: `プロジェクト: ${task.projectId}\nステータス: ${task.ステータス}\n担当者: ${task.担当者 || '未設定'}`,
    start: eventStart,
    end: eventEnd,
    extendedProperties: {
      private: {
        app: 'apdw',
        orgId: ORG_ID,
        taskId: task.id,
      },
    },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
  });

  const eventId = response.data.id;
  if (!eventId) {
    throw new Error('カレンダーイベントIDの取得に失敗しました');
  }

  console.log(`[Calendar] Created event ${eventId} for task ${task.id}`);

  return eventId;
}

/**
 * カレンダーイベントを更新
 */
export async function updateCalendarEvent(
  task: Task,
  eventId: string
): Promise<void> {
  const userEmail = task.担当者メール;
  if (!userEmail) {
    throw new Error('担当者メールが設定されていません');
  }

  const calendar = getCalendarClient(userEmail);

  const start = task.予定開始日 || task.start;
  const end = task.期限 || task.end;

  if (!start && !end) {
    throw new Error('開始日または期限が設定されていません');
  }

  const isAllDay = !start?.includes('T') && !end?.includes('T');

  const eventStart = isAllDay
    ? { date: start || end }
    : { dateTime: start || end, timeZone: 'Asia/Tokyo' };

  const eventEnd = isAllDay
    ? { date: end || start }
    : { dateTime: end || start, timeZone: 'Asia/Tokyo' };

  const event = {
    summary: task.タスク名,
    description: `プロジェクト: ${task.projectId}\nステータス: ${task.ステータス}\n担当者: ${task.担当者 || '未設定'}`,
    start: eventStart,
    end: eventEnd,
    extendedProperties: {
      private: {
        app: 'apdw',
        orgId: ORG_ID,
        taskId: task.id,
      },
    },
  };

  await calendar.events.update({
    calendarId: 'primary',
    eventId: eventId,
    requestBody: event,
  });

  console.log(`[Calendar] Updated event ${eventId} for task ${task.id}`);
}

/**
 * カレンダーイベントを削除
 */
export async function deleteCalendarEvent(
  userEmail: string,
  eventId: string
): Promise<void> {
  if (!userEmail) {
    throw new Error('担当者メールが設定されていません');
  }

  const calendar = getCalendarClient(userEmail);

  await calendar.events.delete({
    calendarId: 'primary',
    eventId: eventId,
  });

  console.log(`[Calendar] Deleted event ${eventId}`);
}

/**
 * タスクのカレンダー同期
 */
export async function syncTaskToCalendar(task: Task): Promise<string> {
  const existingEventId = task['カレンダーイベントID'];

  if (existingEventId) {
    // 既存のイベントを更新
    await updateCalendarEvent(task, existingEventId);
    return existingEventId;
  } else {
    // 新しいイベントを作成
    return await createCalendarEvent(task);
  }
}

