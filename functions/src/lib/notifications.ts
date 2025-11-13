import { gmail_v1 } from 'googleapis';
import { getGmailClient } from './googleClients';
import { TaskDoc } from './firestore';
import type { DigestTaskSummary } from './jobs';

type NotificationReason = 'manual' | 'creation' | 'due_date';

function buildSubject(task: TaskDoc, reason: NotificationReason) {
  const base = task.タスク名 ?? '(無題タスク)';
  switch (reason) {
    case 'creation':
      return `[Project Compass] タスク登録: ${base}`;
    case 'due_date':
      return `[Project Compass] タスク期限通知: ${base}`;
    case 'manual':
    default:
      return `[Project Compass] タスク通知: ${base}`;
  }
}

function formatDateLabel(value?: string | null) {
  if (!value) return '未設定';
  return value;
}

function buildBody(task: TaskDoc, reason: NotificationReason, sendDate?: string | null) {
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
  } else if (reason === 'due_date') {
    lines.push(`※本日(${sendDate ?? '本日'})が期限日のタスクです。`);
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
    if (!groups.has(projectId)) {
      groups.set(projectId, {
        projectId,
        projectName: projectId,
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
  const lines = [title];

  for (const group of projectGroups) {
    // Use projectName from task data instead of projectId
    const displayName = group.tasks[0]?.projectName || group.projectId;
    lines.push(`  【${displayName}】`);
    for (const task of group.tasks) {
      const start = task.startDate ? `開始: ${task.startDate}` : null;
      const due = task.dueDate ? `期限: ${task.dueDate}` : null;
      const info = [start, due].filter(Boolean).join(' / ');
      const status = task.status ? `ステータス: ${task.status}` : null;
      const suffix = [info, status].filter(Boolean).join(' | ');
      lines.push(`    - ${task.taskName}${suffix ? ` (${suffix})` : ''}`);
    }
  }

  lines.push('');
  return lines.join('\n');
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

  const subject = `[Project Compass] 本日のタスク (${input.date})`;

  const sections = [
    buildDigestSection('■■■【要対応】本日が期限のタスク■■■', input.dueToday),
    buildDigestSection('◆ 明日が期限のタスク', input.dueTomorrow),
    buildDigestSection('◆ 本日開始のタスク', input.startingToday),
    buildDigestSection('◆ 未完了の期限超過タスク', input.overdue),
  ].filter(Boolean);

  if (!sections.length) {
    return;
  }

  const displayName = input.recipientName || input.recipient;
  const greeting = input.orgName
    ? `${input.orgName} ${displayName} 様`
    : `${displayName} 様`;

  const bodyLines = [
    greeting,
    '',
    '本日のタスク状況をお知らせします。',
    '',
    ...sections,
    '※ このメールは Project Compass から自動送信されています。',
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
