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

function buildPlainBody(lines: Array<string | null | undefined>): string {
  return lines
    .map((line) => (typeof line === 'string' ? line.trimEnd() : ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getRecipientName(email: string): string {
  const localPart = email.split('@')[0]?.trim();
  return localPart || email;
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
  const destinationUrl = inviteUrl || appUrl;
  const recipientName = getRecipientName(to);
  const normalizedMessage = message?.trim();

  const roleNames: Record<string, string> = {
    admin: '組織管理者',
    project_manager: 'プロジェクトマネージャー',
    sales: '営業',
    designer: '設計',
    site_manager: '施工管理',
    worker: '職人',
    viewer: '閲覧者',
    super_admin: 'スーパー管理者',
    owner: 'オーナー',
    manager: 'マネージャー',
    member: 'メンバー',
  };

  const roleName = roleNames[role] || role;

  const subject = projectName
    ? `[Compass] プロジェクト「${projectName}」への招待`
    : `[Compass] ${organizationName || '組織'}への招待`;

  const body = buildPlainBody([
    `${recipientName} 様`,
    '',
    projectName
      ? `${inviterName} さんから、プロジェクト「${projectName}」への招待が届いています。`
      : `${inviterName} さんから、${organizationName || '組織'}への招待が届いています。`,
    '',
    '【招待内容】',
    projectName ? `プロジェクト: ${projectName}` : null,
    organizationName ? `組織: ${organizationName}` : null,
    `権限: ${roleName}`,
    '',
    normalizedMessage ? '【メッセージ】' : null,
    normalizedMessage || null,
    normalizedMessage ? '' : null,
    '【参加手順】',
    '1. 下記URLを開く',
    '2. 招待を受け取ったメールアドレスでログイン',
    '3. 画面の案内に沿って参加を完了',
    '',
    destinationUrl,
    '',
    '※本メールは自動送信です。心当たりがない場合は破棄してください。',
    `Compass: ${appUrl}`,
  ]);

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

/**
 * パスワード設定メールを送信
 */
export async function sendPasswordSetupEmail(params: {
  to: string;
  displayName?: string;
  organizationName?: string;
  resetLink: string;
}): Promise<void> {
  const { to, displayName, organizationName, resetLink } = params;

  const sender = process.env.NOTIFICATION_SENDER || 'no-reply@archi-prisma.co.jp';
  const appUrl = process.env.APP_URL || 'https://compass-31e9e.web.app';
  const recipientName = displayName?.trim() || getRecipientName(to);

  const subject = '[Compass] パスワード設定のご案内';
  const body = buildPlainBody([
    `${recipientName} 様`,
    '',
    `${organizationName || 'Compass'} で利用するアカウントを作成しました。`,
    '下記URLからパスワード設定を完了してください。',
    '',
    resetLink,
    '',
    '設定完了後は以下からログインできます。',
    appUrl,
    '',
    '※本メールは自動送信です。心当たりがない場合は破棄してください。',
    `Compass: ${appUrl}`,
  ]);

  try {
    await sendEmail({
      from: sender,
      to,
      subject,
      body,
    });
    console.log(`[Gmail] Sent password setup email to ${to}`);
  } catch (error) {
    console.error(`[Gmail] Failed to send password setup email to ${to}:`, error);
    throw error; // パスワード設定メール送信失敗は重要なのでエラーを投げる
  }
}

