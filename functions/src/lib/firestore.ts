import admin from 'firebase-admin';
import { deriveTaskFields, STATUS_PROGRESS } from './progress';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const ORG_ID = process.env.ORG_ID ?? 'demo';

type FirestoreTimestamp = admin.firestore.Timestamp;

export interface TaskNotificationSettings {
  開始日: boolean;
  期限前日: boolean;
  期限当日: boolean;
  超過: boolean;
}

type WithTimestamps<T> = T & {
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};

const DEFAULT_NOTIFICATION_SETTINGS: TaskNotificationSettings = {
  開始日: true,
  期限前日: true,
  期限当日: true,
  超過: true,
};

function orgCollection(name: string) {
  return db.collection('orgs').doc(ORG_ID).collection(name);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize<T extends Record<string, any>>(doc: admin.firestore.QueryDocumentSnapshot): T {
  const data = doc.data();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = { ...data, id: doc.id };
  if (data.createdAt instanceof admin.firestore.Timestamp) {
    result.createdAt = data.createdAt.toDate().toISOString();
  }
  if (data.updatedAt instanceof admin.firestore.Timestamp) {
    result.updatedAt = data.updatedAt.toDate().toISOString();
  }
  return result as T;
}

function normalizeNotificationSettings(
  value?: TaskNotificationSettings | Partial<TaskNotificationSettings> | null
): TaskNotificationSettings {
  return {
    開始日: value?.開始日 ?? DEFAULT_NOTIFICATION_SETTINGS.開始日,
    期限前日: value?.期限前日 ?? DEFAULT_NOTIFICATION_SETTINGS.期限前日,
    期限当日: value?.期限当日 ?? DEFAULT_NOTIFICATION_SETTINGS.期限当日,
    超過: value?.超過 ?? DEFAULT_NOTIFICATION_SETTINGS.超過,
  };
}

function normalizeDependencies(value?: string[] | null): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  return items.length ? items : null;
}

function normalizeAssigneeEmail(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function listProjects() {
  const snap = await orgCollection('projects').orderBy('updatedAt', 'desc').get();
  return snap.docs.map((doc) => serialize<ProjectDoc>(doc));
}

export async function getProject(orgId: string, projectId: string) {
  const doc = await db.collection('orgs').doc(orgId).collection('projects').doc(projectId).get();
  if (!doc.exists) return null;
  return serialize<ProjectDoc>(doc as admin.firestore.QueryDocumentSnapshot);
}

export async function listPeople() {
  const snap = await orgCollection('people').get();
  return snap.docs.map((doc) => serialize<PersonDoc>(doc));
}

export interface TaskListFilters {
  projectId?: string;
  assignee?: string;
  assigneeEmail?: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
}

export async function listTasks(filters: TaskListFilters) {
  let ref: FirebaseFirestore.Query = orgCollection('tasks');
  if (filters.projectId) ref = ref.where('projectId', '==', filters.projectId);
  if (filters.assignee) ref = ref.where('assignee', '==', filters.assignee);
  if (filters.status) ref = ref.where('ステータス', '==', filters.status);
  const normalizedEmail = normalizeAssigneeEmail(filters.assigneeEmail);
  if (normalizedEmail) ref = ref.where('担当者メール', '==', normalizedEmail);
  ref = ref.orderBy('updatedAt', 'desc');
  const snap = await ref.get();
  let results = snap.docs.map((doc) => serialize<TaskDoc>(doc));

  const normalizeDateString = (value?: string | null): string | null => {
    if (!value) return null;
    return value;
  };

  const getTaskStart = (task: TaskDoc): string | null => {
    return (
      normalizeDateString(task.start) ??
      normalizeDateString(task.予定開始日) ??
      normalizeDateString(task.実績開始日) ??
      null
    );
  };

  const getTaskEnd = (task: TaskDoc): string | null => {
    return (
      normalizeDateString(task.end) ??
      normalizeDateString(task.期限) ??
      normalizeDateString(task.実績完了日) ??
      getTaskStart(task)
    );
  };

  if (filters.from) {
    results = results.filter((task) => {
      const end = getTaskEnd(task);
      return !end || end >= filters.from!;
    });
  }

  if (filters.to) {
    results = results.filter((task) => {
      const start = getTaskStart(task);
      return !start || start <= filters.to!;
    });
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    results = results.filter((task) => {
      const haystack = [
        task.id,
        task.TaskID,
        task.タスク名,
        task.タスク種別,
        task.assignee,
        task.担当者,
        task.担当者メール,
        task.ステータス,
        task.projectId,
        task['依頼元'],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  return results;
}

async function generateProjectId() {
  const snapshot = await orgCollection('projects')
    .orderBy(admin.firestore.FieldPath.documentId(), 'desc')
    .limit(1)
    .get();
  let next = 1;
  if (!snapshot.empty) {
    const doc = snapshot.docs[0].id.replace(/^P-?/, '');
    const parsed = parseInt(doc, 10);
    if (!Number.isNaN(parsed)) next = parsed + 1;
  }
  return `P-${String(next).padStart(4, '0')}`;
}

async function generateTaskId() {
  const snapshot = await orgCollection('tasks')
    .orderBy(admin.firestore.FieldPath.documentId(), 'desc')
    .limit(1)
    .get();
  let next = 1;
  if (!snapshot.empty) {
    const doc = snapshot.docs[0].id.replace(/^T/, '');
    const parsed = parseInt(doc, 10);
    if (!Number.isNaN(parsed)) next = parsed + 1;
  }
  return `T${String(next).padStart(3, '0')}`;
}

// Sanitize field names: remove special characters that Firestore doesn't allow
function sanitizeFieldNames(payload: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    // Replace '/' with '_' in field names
    const sanitizedKey = key.replace(/\//g, '_');
    sanitized[sanitizedKey] = value;
  }
  return sanitized;
}

export async function createProject(payload: ProjectInput) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const projectId = payload.id ?? payload.ProjectID ?? (await generateProjectId());
  const docRef = orgCollection('projects').doc(projectId);
  const sanitizedPayload = sanitizeFieldNames(payload);
  await docRef.set({
    ...sanitizedPayload,
    id: projectId,
    ProjectID: projectId,
    createdAt: now,
    updatedAt: now,
  });
  return projectId;
}

export async function updateProject(projectId: string, payload: Partial<ProjectInput>) {
  const ref = orgCollection('projects').doc(projectId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Project not found');
  
  const sanitizedPayload = sanitizeFieldNames(payload);
  
  await ref.update({
    ...sanitizedPayload,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function createPerson(payload: PersonInput) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const personId = payload.氏名;
  const docRef = orgCollection('people').doc(personId);
  await docRef.set({
    ...payload,
    id: personId,
    createdAt: now,
    updatedAt: now,
  });
  return personId;
}

export async function createTask(payload: TaskInput) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const taskId = payload.id ?? payload.TaskID ?? (await generateTaskId());
  const docRef = orgCollection('tasks').doc(taskId);
  const notifications = normalizeNotificationSettings(payload['通知設定']);
  const dependencies = normalizeDependencies(payload['依存タスク']);
  const assigneeEmail = normalizeAssigneeEmail(payload.担当者メール);
  const derived = deriveTaskFields(payload);
  await docRef.set({
    ...payload,
    '通知設定': notifications,
    '依存タスク': dependencies,
    担当者メール: assigneeEmail,
    ...derived,
    id: taskId,
    TaskID: taskId,
    projectId: payload.projectId,
    createdAt: now,
    updatedAt: now,
  });
  return taskId;
}

export async function updateTask(taskId: string, payload: Partial<TaskInput>) {
  const ref = orgCollection('tasks').doc(taskId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Task not found');
  const normalizedPayload: Partial<TaskInput> = { ...payload };
  if (Object.prototype.hasOwnProperty.call(payload, '通知設定')) {
    normalizedPayload['通知設定'] = normalizeNotificationSettings(
      payload['通知設定'] as TaskNotificationSettings | Partial<TaskNotificationSettings> | null
    );
  }
  if (Object.prototype.hasOwnProperty.call(payload, '依存タスク')) {
    normalizedPayload['依存タスク'] = normalizeDependencies(payload['依存タスク'] as string[] | null);
  }
  if (Object.prototype.hasOwnProperty.call(payload, '担当者メール')) {
    normalizedPayload.担当者メール = normalizeAssigneeEmail(payload.担当者メール ?? null);
  }

  const merged = { ...(snapshot.data() as TaskInput), ...normalizedPayload };
  const derived = deriveTaskFields(merged);
  await ref.update({
    ...normalizedPayload,
    ...derived,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function moveTaskDates(taskId: string, payload: { 予定開始日?: string | null; 期限?: string | null }) {
  const ref = orgCollection('tasks').doc(taskId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Task not found');
  const base = snapshot.data() as TaskInput;
  const updates: Partial<TaskInput> = {};
  if (Object.prototype.hasOwnProperty.call(payload, '予定開始日')) {
    updates.予定開始日 = payload.予定開始日 ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, '期限')) {
    updates.期限 = payload.期限 ?? null;
  }
  const merged = { ...base, ...updates };
  const derived = deriveTaskFields(merged);
  await ref.update({
    ...updates,
    ...derived,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function completeTask(taskId: string, done: boolean) {
  const ref = orgCollection('tasks').doc(taskId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Task not found');
  const data = snapshot.data() as TaskInput;
  const newStatus = done ? '完了' : data.ステータス || '進行中';
  const payload: Partial<TaskInput> = {
    ステータス: newStatus,
  };
  if (done) {
    payload.実績完了日 = new Date().toISOString().slice(0, 10);
    payload.progress = 1;
  } else {
    payload.progress = STATUS_PROGRESS[newStatus] ?? 0;
  }
  await updateTask(taskId, payload);
}

export async function importSnapshot(payload: SnapshotPayload) {
  const batch = db.batch();
  const projectsRef = orgCollection('projects');
  const tasksRef = orgCollection('tasks');
  const peopleRef = orgCollection('people');

  const now = admin.firestore.FieldValue.serverTimestamp();

  payload.projects?.forEach((project) => {
    const id = project.id ?? project.ProjectID ?? projectsRef.doc().id;
    const ref = projectsRef.doc(id);
    batch.set(
      ref,
      {
        ...project,
        id,
        ProjectID: id,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  payload.tasks?.forEach((task) => {
    const id = task.id ?? task.TaskID ?? tasksRef.doc().id;
    const ref = tasksRef.doc(id);
    const projectId = String(task.projectId ?? task.ProjectID ?? '').trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestor = (task as any)['依頼元/連絡先'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (requestor && !(task as any)['依頼元']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (task as any)['依頼元'] = requestor;
    }
    const notifications = normalizeNotificationSettings(
      (task as TaskInput)['通知設定'] as TaskNotificationSettings | Partial<TaskNotificationSettings> | null
    );
    const dependencies = normalizeDependencies((task as TaskInput)['依存タスク']);
    const assigneeEmail = normalizeAssigneeEmail((task as TaskInput).担当者メール ?? null);
    const derived = deriveTaskFields({ ...task, projectId } as TaskInput);
    batch.set(
      ref,
      {
        ...task,
        projectId,
        id,
        TaskID: id,
        担当者メール: assigneeEmail,
        '通知設定': notifications,
        '依存タスク': dependencies,
        ...derived,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  payload.people?.forEach((person) => {
    const id = person.氏名 ?? peopleRef.doc().id;
    const ref = peopleRef.doc(id);
    batch.set(
      ref,
      {
        ...person,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  await batch.commit();
}

export async function exportSnapshot(): Promise<SnapshotPayload> {
  const [projects, tasks, people] = await Promise.all([listProjects(), listTasks({}), listPeople()]);
  return {
    generated_at: new Date().toISOString(),
    projects,
    tasks,
    people,
  };
}

export async function listSchedule(params: { view?: 'people' | 'projects'; from?: string; to?: string }) {
  const { from, to } = params;
  const items = await listTasks({ from, to });
  const toComparableString = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
    return String(value);
  };
  return items.sort((a, b) => {
    const aStart = a.start ?? a.予定開始日 ?? '';
    const bStart = b.start ?? b.予定開始日 ?? '';
    if (aStart && bStart) return aStart.localeCompare(bStart);
    if (aStart) return -1;
    if (bStart) return 1;
    return toComparableString(b.updatedAt).localeCompare(toComparableString(a.updatedAt));
  });
}

export interface ProjectInput {
  id?: string;
  ProjectID?: string;
  物件名: string;
  クライアント?: string;
  LS担当者?: string;
  自社PM?: string;
  ステータス: string;
  優先度: string;
  開始日?: string | null;
  予定完了日?: string | null;
  '所在地/現地'?: string | null;  // Will be sanitized to 所在地_現地
  所在地_現地?: string | null;  // Sanitized field name
  'フォルダURL'?: string | null;
  '備考'?: string | null;
}

export interface TaskInput {
  id?: string;
  TaskID?: string;
  ProjectID?: string;
  projectId: string;
  タスク名: string;
  タスク種別?: string | null;
  担当者?: string | null;
  assignee?: string | null;
  担当者メール?: string | null;
  優先度?: string | null;
  ステータス: string;
  予定開始日?: string | null;
  期限?: string | null;
  実績開始日?: string | null;
  実績完了日?: string | null;
  start?: string | null;
  end?: string | null;
  duration_days?: number | null;
  progress?: number | null;
  ['工数見積(h)']?: number | null;
  ['工数実績(h)']?: number | null;
  '依頼元'?: string | null;
  '依存タスク'?: string[] | null;
  'カレンダーイベントID'?: string | null;
  '通知設定'?: TaskNotificationSettings | null;
}

export interface PersonInput {
  氏名: string;
  役割?: string;
  メール?: string;
  電話?: string;
  '稼働時間/日(h)'?: number | null;
}

export interface PersonDoc {
  id?: string;
  氏名: string;
  役割?: string;
  メール?: string;
  電話?: string;
  '稼働時間/日(h)'?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export type ProjectDoc = WithTimestamps<ProjectInput> & { id: string };
export type TaskDoc = WithTimestamps<TaskInput> & { id: string };

export interface SnapshotPayload {
  generated_at?: string;
  projects?: ProjectInput[];
  tasks?: TaskInput[];
  people?: PersonDoc[];
}
