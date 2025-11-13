import { db, ORG_ID, TaskDoc } from './firestore';
import {
  fetchPendingJobs,
  markJobCompleted,
  markJobFailed,
  markJobInProgress,
  JobDoc,
  DigestJobPayload,
} from './jobs';
import { sendTaskNotification, sendTaskDigest } from './notifications';
import { syncTaskToCalendar } from './calendarSync';

const MAX_JOBS_PER_RUN = parseInt(process.env.JOB_RUNNER_BATCH ?? '10', 10);
const tasksCollection = () => db.collection('orgs').doc(ORG_ID).collection('tasks');

interface NotificationSeedPayload extends Record<string, unknown> {
  taskId: string;
  reason: 'manual' | 'creation' | 'due_date';
  userId?: string | null;
  sendDate?: string | null;
}

interface CalendarSyncPayload extends Record<string, unknown> {
  taskId: string;
  mode: 'push' | 'sync';
  userId?: string | null;
}

async function handleNotificationSeed(job: JobDoc<NotificationSeedPayload>) {
  const snapshot = await tasksCollection().doc(job.payload.taskId).get();
  if (!snapshot.exists) {
    throw new Error(`タスク ${job.payload.taskId} が見つかりません`);
  }
  const task = snapshot.data() as TaskDoc;
  task.id = snapshot.id;
  await sendTaskNotification(task, {
    reason: job.payload.reason,
    to: task.担当者メール ?? null,
    sendDate: job.payload.sendDate ?? null,
  });
  console.info('[job] seed notifications completed', {
    taskId: task.id,
    reason: job.payload.reason,
    sendDate: job.payload.sendDate ?? null,
  });
}

async function handleCalendarSync(job: JobDoc<CalendarSyncPayload>) {
  const snapshot = await tasksCollection().doc(job.payload.taskId).get();
  if (!snapshot.exists) {
    throw new Error(`タスク ${job.payload.taskId} が見つかりません`);
  }
  const task = snapshot.data() as TaskDoc;
  task.id = snapshot.id;
  await syncTaskToCalendar(task, job.payload.mode);
  console.info('[job] calendar sync completed', { taskId: task.id, mode: job.payload.mode });
}

async function handleDigest(job: JobDoc<DigestJobPayload>) {
  await sendTaskDigest({
    recipient: job.payload.recipient,
    recipientName: job.payload.recipientName,
    orgName: job.payload.orgName,
    date: job.payload.date,
    dueToday: job.payload.dueToday,
    dueTomorrow: job.payload.dueTomorrow,
    startingToday: job.payload.startingToday,
    overdue: job.payload.overdue,
  });
  console.info('[job] digest notification sent', {
    recipient: job.payload.recipient,
    date: job.payload.date,
    dueToday: job.payload.dueToday.length,
    dueTomorrow: job.payload.dueTomorrow.length,
    startingToday: job.payload.startingToday.length,
    overdue: job.payload.overdue.length,
  });
}

function isNotificationJob(job: JobDoc): job is JobDoc<NotificationSeedPayload> {
  return job.type === 'task.notification.seed';
}

function isCalendarJob(job: JobDoc): job is JobDoc<CalendarSyncPayload> {
  return job.type === 'task.calendar.sync';
}

function isDigestJob(job: JobDoc): job is JobDoc<DigestJobPayload> {
  return job.type === 'task.notification.digest';
}

async function runJob(job: JobDoc) {
  await markJobInProgress(job.id);
  try {
    if (isNotificationJob(job)) {
      await handleNotificationSeed(job);
    } else if (isCalendarJob(job)) {
      await handleCalendarSync(job);
    } else if (isDigestJob(job)) {
      await handleDigest(job);
    } else {
      console.warn('[job] 未対応のジョブタイプ', job.type);
    }
    await markJobCompleted(job.id);
  } catch (error) {
    await markJobFailed(job.id, error as Error);
    throw error;
  }
}

export async function processPendingJobs(batchSize = MAX_JOBS_PER_RUN) {
  const jobs = await fetchPendingJobs(batchSize);
  if (!jobs.length) {
    console.info('[job] pending jobs not found');
    return { processed: 0 };
  }

  let success = 0;
  for (const job of jobs) {
    try {
      await runJob(job);
      success += 1;
    } catch (error) {
      console.error('[job] failed to process', job.id, error);
    }
  }
  return { processed: success, total: jobs.length };
}
