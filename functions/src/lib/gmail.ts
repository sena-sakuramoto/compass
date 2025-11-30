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

  // 日本語の件名をMIMEエンコード
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;

  // メールのMIME形式を構築
  const contentType = html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
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

/**
 * 招待メールを送信
 */
export async function sendInvitationEmail(params: {
  to: string;
  inviterName: string;
  organizationName?: string;
  projectName?: string;
  role: string;
  inviteUrl?: string;
  message?: string;
}): Promise<void> {
  const { to, inviterName, organizationName, projectName, role, inviteUrl, message } = params;

  const sender = process.env.NOTIFICATION_SENDER || 'no-reply@archi-prisma.co.jp';
  const appUrl = process.env.APP_URL || 'https://compass-31e9e.web.app';

  const roleNames: Record<string, string> = {
    'admin': '管理者',
    'project_manager': 'プロジェクトマネージャー',
    'viewer': '閲覧者',
    'owner': 'オーナー',
    'manager': 'マネージャー',
    'member': 'メンバー',
  };

  const roleName = roleNames[role] || role;

  let subject = '';
  let body = '';

  if (projectName) {
    // プロジェクト招待
    subject = `[Compass] プロジェクト「${projectName}」への招待`;
    body = `
${to} さま

${inviterName} さんから、プロジェクト「${projectName}」に招待されました。

【招待内容】
プロジェクト: ${projectName}
${organizationName ? `組織: ${organizationName}` : ''}
ロール: ${roleName}

${message ? `メッセージ:\n${message}\n` : ''}
以下のリンクからログインして、プロジェクトにアクセスできます。

${inviteUrl || appUrl}

※このメールは自動送信されています。

---
Compass - プロジェクト管理システム
${appUrl}
`;
  } else {
    // 組織招待
    subject = `[Compass] ${organizationName || '組織'}への招待`;
    body = `
${to} さま

${inviterName} さんから、${organizationName || '組織'}に招待されました。

【招待内容】
${organizationName ? `組織: ${organizationName}` : ''}
ロール: ${roleName}

${message ? `メッセージ:\n${message}\n` : ''}
以下のリンクからログインして、組織にアクセスできます。

${inviteUrl || appUrl}

※このメールは自動送信されています。

---
Compass - プロジェクト管理システム
${appUrl}
`;
  }

  try {
    await sendEmail({
      from: sender,
      to,
      subject,
      body,
    });
    console.log(`[Gmail] Sent invitation email to ${to}`);
  } catch (error) {
    console.error(`[Gmail] Failed to send invitation email to ${to}:`, error);
    // メール送信失敗でもエラーを投げない（招待自体は成功させる）
  }
}

