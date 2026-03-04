import { gmail_v1 } from 'googleapis';
import { getGmailClient } from './googleClients';
import { TaskDoc } from './firestore';
import type { DigestTaskSummary } from './jobs';

type NotificationReason = 'manual' | 'creation' | 'due_date';

function buildSubject(task: TaskDoc, reason: NotificationReason) {
  const base = task.タスク名 ?? '(無題タスク)';
  switch (reason) {
    case 'creation':
      return `[Compass] タスクが登録されました: ${base}`;
    case 'due_date':
      return `[Compass] 本日期限のタスク: ${base}`;
    case 'manual':
    default:
      return `[Compass] タスク通知: ${base}`;
  }
}

function formatDateLabel(value?: string | null) {
  if (!value) return '未設定';
  return value;
}

function buildPlainBody(lines: Array<string | null | undefined>) {
  return lines
    .map((line) => (typeof line === 'string' ? line.trimEnd() : ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildBody(task: TaskDoc, reason: NotificationReason, sendDate?: string | null) {
  const appUrl = process.env.APP_URL || 'https://compass-31e9e.web.app';
  const intro =
    reason === 'creation'
      ? '新しいタスクが登録されました。'
      : reason === 'due_date'
        ? `${sendDate ?? '本日'} が期限のタスクです。`
        : 'タスク通知です。';

  return buildPlainBody([
    intro,
    '',
    `タスク: ${task.タスク名 ?? '(無題タスク)'}`,
    `プロジェクトID: ${task.projectId ?? '未設定'}`,
    `ステータス: ${task.ステータス ?? '未設定'}`,
    `開始予定: ${formatDateLabel(task.start ?? task.予定開始日 ?? null)}`,
    `期限: ${formatDateLabel(task.end ?? task.期限 ?? null)}`,
    '',
    `Compass: ${appUrl}`,
    '※ このメールは自動送信です。',
  ]);
}

function encodeMessage(message: string) {
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encodeSubject(subject: string): string {
  // RFC 2047: =?charset?encoding?encoded-text?=
  const encoded = Buffer.from(subject, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

export async function sendTaskNotification(
  task: TaskDoc,
  payload: { reason: NotificationReason; to?: string | null; sendDate?: string | null }
) {
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
  const body = buildBody(task, payload.reason, payload.sendDate ?? null);

  const message = [
    `From: ${sender}`,
    `To: ${recipient}`,
    'Content-Type: text/plain; charset="UTF-8"',
    `Subject: ${encodeSubject(subject)}`,
    '',
    body,
  ].join('\n');

  const raw = encodeMessage(message);
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  } as gmail_v1.Params$Resource$Users$Messages$Send);
}

interface ProjectGroup {
  projectId: string;
  projectName: string;
  tasks: DigestTaskSummary[];
}

function groupTasksByProject(tasks: DigestTaskSummary[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();

  for (const task of tasks) {
    const projectId = task.projectId || '(未設定)';
    const projectName = task.projectName?.trim() || projectId;
    if (!groups.has(projectId)) {
      groups.set(projectId, {
        projectId,
        projectName,
        tasks: []
      });
    }
    groups.get(projectId)!.tasks.push(task);
  }

  return Array.from(groups.values());
}

function buildDigestSection(title: string, tasks: DigestTaskSummary[]): string {
  if (!tasks.length) return '';

  const projectGroups = groupTasksByProject(tasks);
  const lines = [`【${title}】${tasks.length}件`, ''];

  for (const group of projectGroups) {
    lines.push(`■ ${group.projectName} (${group.tasks.length}件)`);
    for (const task of group.tasks) {
      const start = task.startDate ? `開始: ${task.startDate}` : null;
      const due = task.dueDate ? `期限: ${task.dueDate}` : null;
      const info = [start, due].filter(Boolean).join(' / ');
      const status = task.status ? `状態: ${task.status}` : null;
      const meta = [info, status].filter(Boolean).join(' / ');
      lines.push(`- ${task.taskName}`);
      if (meta) {
        lines.push(`  ${meta}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export async function sendTaskDigest(input: {
  recipient: string;
  recipientName?: string | null;
  orgName?: string | null;
  date: string;
  dueToday: DigestTaskSummary[];
  dueTomorrow: DigestTaskSummary[];
  startingToday: DigestTaskSummary[];
  overdue: DigestTaskSummary[];
}) {
  const sender = process.env.NOTIFICATION_SENDER || process.env.GSA_CLIENT_EMAIL;
  if (!sender) {
    throw new Error('通知送信元 NOTIFICATION_SENDER が設定されていません');
  }

  const gmail = await getGmailClient();
  const appUrl = process.env.APP_URL || 'https://compass-31e9e.web.app';

  const subject = `[Compass] 本日のタスク通知 (${input.date})`;

  const sections = [
    buildDigestSection('本日期限', input.dueToday),
    buildDigestSection('明日期限', input.dueTomorrow),
    buildDigestSection('本日開始', input.startingToday),
    buildDigestSection('期限超過（未完了）', input.overdue),
  ].filter(Boolean);

  if (!sections.length) {
    return;
  }

  const displayName = input.recipientName || input.recipient;
  const greeting = input.orgName
    ? `${input.orgName} ${displayName} 様`
    : `${displayName} 様`;
  const total =
    input.dueToday.length + input.dueTomorrow.length + input.startingToday.length + input.overdue.length;

  const bodyLines = [
    greeting,
    '',
    `${input.date} 時点のタスク通知です。`,
    `対象タスク合計: ${total}件`,
    `本日期限: ${input.dueToday.length}件 / 明日期限: ${input.dueTomorrow.length}件 / 本日開始: ${input.startingToday.length}件 / 期限超過: ${input.overdue.length}件`,
    '',
    ...sections,
    `Compass: ${appUrl}`,
    '※ このメールは自動送信です。',
  ];

  const message = [
    `From: ${sender}`,
    `To: ${input.recipient}`,
    'Content-Type: text/plain; charset="UTF-8"',
    `Subject: ${encodeSubject(subject)}`,
    '',
    bodyLines.join('\n'),
  ].join('\n');

  const raw = encodeMessage(message);
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  } as gmail_v1.Params$Resource$Users$Messages$Send);
}
