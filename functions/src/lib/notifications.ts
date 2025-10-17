import { gmail_v1 } from 'googleapis';
import { getGmailClient } from './googleClients';
import { TaskDoc } from './firestore';

function buildSubject(task: TaskDoc, reason: string) {
  const base = task.タスク名 ?? '(無題タスク)';
  switch (reason) {
    case 'creation':
      return `[Project Compass] タスク登録: ${base}`;
    case 'manual':
    default:
      return `[Project Compass] タスク通知: ${base}`;
  }
}

function formatDateLabel(value?: string | null) {
  if (!value) return '未設定';
  return value;
}

function buildBody(task: TaskDoc, reason: string) {
  const lines = [
    `タスク名: ${task.タスク名 ?? '(無題タスク)'}`,
    `プロジェクト: ${task.projectId ?? ''}`,
    `ステータス: ${task.ステータス ?? ''}`,
    `予定: ${formatDateLabel(task.start)} → ${formatDateLabel(task.end ?? task.期限 ?? null)}`,
    '',
    'Project Compass からの自動通知です。',
  ];
  if (reason === 'creation') {
    lines.push('※このタスクは新しく登録されました。');
  }
  return lines.join('\n');
}

function encodeMessage(message: string) {
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendTaskNotification(task: TaskDoc, payload: { reason: 'manual' | 'creation'; to?: string | null }) {
  const recipient = payload.to ?? task.担当者メール ?? task.assignee ?? task.担当者 ?? null;
  if (!recipient) {
    throw new Error('通知先メールアドレスが指定されていません');
  }
  const sender = process.env.NOTIFICATION_SENDER || process.env.GSA_CLIENT_EMAIL;
  if (!sender) {
    throw new Error('通知送信元 NOTIFICATION_SENDER が設定されていません');
  }

  const gmail = await getGmailClient();
  const subject = buildSubject(task, payload.reason);
  const body = buildBody(task, payload.reason);

  const message = [
    `From: ${sender}`,
    `To: ${recipient}`,
    'Content-Type: text/plain; charset="UTF-8"',
    `Subject: ${subject}`,
    '',
    body,
  ].join('\n');

  const raw = encodeMessage(message);
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  } as gmail_v1.Params$Resource$Users$Messages$Send);
}
