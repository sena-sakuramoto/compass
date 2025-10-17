// Gmail API統合

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

const GSA_CLIENT_EMAIL = process.env.GSA_CLIENT_EMAIL;
const GSA_PRIVATE_KEY = process.env.GSA_PRIVATE_KEY?.replace(/\\n/g, '\n');

/**
 * Gmail APIクライアントを取得（ドメインワイド委任）
 */
function getGmailClient(userEmail: string) {
  if (!GSA_CLIENT_EMAIL || !GSA_PRIVATE_KEY) {
    throw new Error('Gmail API credentials not configured');
  }

  const auth = new JWT({
    email: GSA_CLIENT_EMAIL,
    key: GSA_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: userEmail, // ドメインワイド委任: このユーザーとして送信
  });

  return google.gmail({ version: 'v1', auth });
}

/**
 * メールを送信
 */
export async function sendEmail(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  html?: boolean;
}): Promise<void> {
  const { from, to, subject, body, html = false } = params;

  const gmail = getGmailClient(from);

  // メールのMIME形式を構築
  const contentType = html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: ${contentType}`,
    '',
    body,
  ].join('\n');

  // Base64エンコード
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });

  console.log(`[Gmail] Sent email to ${to}: ${subject}`);
}

/**
 * タスク通知メールを送信
 */
export async function sendTaskNotification(params: {
  to: string;
  taskName: string;
  projectName?: string;
  type: 'start' | 'due_before' | 'due_today' | 'overdue';
  startDate?: string;
  dueDate?: string;
  taskUrl?: string;
}): Promise<void> {
  const { to, taskName, projectName, type, startDate, dueDate, taskUrl } = params;

  const sender = process.env.NOTIFICATION_SENDER || 'no-reply@archi-prisma.co.jp';

  let subject = '';
  let body = '';

  switch (type) {
    case 'start':
      subject = `[APDW] タスク開始: ${taskName}`;
      body = `
担当者さま

本日から以下のタスクが開始されます。

タスク: ${taskName}
${projectName ? `プロジェクト: ${projectName}` : ''}
予定開始日: ${startDate || '未設定'}
期限: ${dueDate || '未設定'}

${taskUrl ? `詳細: ${taskUrl}` : ''}

よろしくお願いいたします。
`;
      break;

    case 'due_before':
      subject = `[APDW] タスク期限前日: ${taskName}`;
      body = `
担当者さま

以下のタスクの期限が明日です。

タスク: ${taskName}
${projectName ? `プロジェクト: ${projectName}` : ''}
期限: ${dueDate || '未設定'}

${taskUrl ? `詳細: ${taskUrl}` : ''}

よろしくお願いいたします。
`;
      break;

    case 'due_today':
      subject = `[APDW] タスク期限当日: ${taskName}`;
      body = `
担当者さま

以下のタスクの期限が本日です。

タスク: ${taskName}
${projectName ? `プロジェクト: ${projectName}` : ''}
期限: ${dueDate || '未設定'}

${taskUrl ? `詳細: ${taskUrl}` : ''}

よろしくお願いいたします。
`;
      break;

    case 'overdue':
      subject = `[APDW] タスク期限超過: ${taskName}`;
      body = `
担当者さま

以下のタスクの期限が過ぎています。

タスク: ${taskName}
${projectName ? `プロジェクト: ${projectName}` : ''}
期限: ${dueDate || '未設定'}

${taskUrl ? `詳細: ${taskUrl}` : ''}

よろしくお願いいたします。
`;
      break;
  }

  await sendEmail({
    from: sender,
    to,
    subject,
    body,
  });
}

