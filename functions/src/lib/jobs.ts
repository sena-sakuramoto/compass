import admin from 'firebase-admin';
import { db, ORG_ID } from './firestore';

const jobsCollection = () => db.collection('orgs').doc(ORG_ID).collection('jobs');

export type JobState = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface JobDoc<TPayload = Record<string, unknown>> {
  id: string;
  type: string;
  payload: TPayload;
  dueAt: admin.firestore.Timestamp;
  priority: number;
  state: JobState;
  attempts: number;
  lastError?: string | null;
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

export interface BaseJobInput<TPayload extends Record<string, unknown>> {
  type: string;
  dueAt?: Date | null;
  payload: TPayload;
  state?: JobState;
  priority?: number;
}

export async function enqueueJob<TPayload extends Record<string, unknown>>(job: BaseJobInput<TPayload>) {
  const ref = jobsCollection().doc();
  const dueAtTimestamp = job.dueAt ? admin.firestore.Timestamp.fromDate(job.dueAt) : admin.firestore.Timestamp.now();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await ref.set({
    type: job.type,
    payload: job.payload,
    dueAt: dueAtTimestamp,
    priority: job.priority ?? 0,
    state: job.state ?? 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });

  return ref.id;
}

export async function enqueueNotificationSeed(input: { taskId: string; reason: 'manual' | 'creation'; userId?: string }) {
  const dueAt = new Date();
  await enqueueJob({
    type: 'task.notification.seed',
    dueAt,
    payload: {
      taskId: input.taskId,
      reason: input.reason,
      userId: input.userId ?? null,
    },
  });
}

export async function enqueueCalendarSync(input: { taskId: string; mode: 'push' | 'sync'; userId?: string }) {
  const dueAt = new Date();
  await enqueueJob({
    type: 'task.calendar.sync',
    dueAt,
    payload: {
      taskId: input.taskId,
      mode: input.mode,
      userId: input.userId ?? null,
    },
  });
}

export async function fetchPendingJobs(limit = 10): Promise<JobDoc[]> {
  const now = admin.firestore.Timestamp.now();
  const snapshot = await jobsCollection()
    .where('state', '==', 'pending')
    .where('dueAt', '<=', now)
    .orderBy('dueAt', 'asc')
    .orderBy('priority', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<JobDoc, 'id'>) }));
}

export async function markJobInProgress(jobId: string) {
  await jobsCollection().doc(jobId).update({
    state: 'in_progress',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function markJobCompleted(jobId: string) {
  await jobsCollection().doc(jobId).update({
    state: 'completed',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastError: admin.firestore.FieldValue.delete(),
  });
}

export async function markJobFailed(jobId: string, error: Error) {
  await jobsCollection().doc(jobId).update({
    state: 'failed',
    lastError: error.message,
    attempts: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
