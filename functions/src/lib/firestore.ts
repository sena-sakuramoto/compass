import admin from 'firebase-admin';
import { deriveTaskFields, STATUS_PROGRESS } from './progress';
import { getNextTaskId, getNextProjectId } from './counters';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
export const ORG_ID = process.env.ORG_ID ?? 'demo';
export const FieldValue = admin.firestore.FieldValue;

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
export function serialize<T extends Record<string, any>>(doc: admin.firestore.QueryDocumentSnapshot): T {
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

export async function listProjects(orgId?: string, includeDeleted = false) {
  const targetOrgId = orgId ?? ORG_ID;
  const snap = await db.collection('orgs').doc(targetOrgId).collection('projects').orderBy('updatedAt', 'desc').get();
  const projects = snap.docs.map((doc) => serialize<ProjectDoc>(doc));

  // 削除済みプロジェクトを除外（includeDeletedがfalseの場合）
  if (!includeDeleted) {
    return projects.filter((p) => !p.deletedAt);
  }
  return projects;
}

/**
 * 削除済みプロジェクトのみを取得
 */
export async function listDeletedProjects(orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const snap = await db.collection('orgs').doc(targetOrgId).collection('projects').orderBy('deletedAt', 'desc').get();
  return snap.docs
    .map((doc) => serialize<ProjectDoc>(doc))
    .filter((p) => p.deletedAt); // deletedAtがあるもののみ
}

export async function getProject(orgId: string, projectId: string, includeDeleted = false) {
  const doc = await db.collection('orgs').doc(orgId).collection('projects').doc(projectId).get();
  if (!doc.exists) return null;

  const project = serialize<ProjectDoc>(doc as admin.firestore.QueryDocumentSnapshot);

  // 削除済みプロジェクトを除外（includeDeletedがfalseの場合）
  if (!includeDeleted && project.deletedAt) {
    return null;
  }

  return project;
}

export async function listPeople(orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const snap = await db.collection('orgs').doc(targetOrgId).collection('people').get();
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

export async function listTasks(filters: TaskListFilters & { orgId?: string; includeDeleted?: boolean }) {
  const targetOrgId = filters.orgId ?? ORG_ID;
  let ref: FirebaseFirestore.Query = db.collection('orgs').doc(targetOrgId).collection('tasks');
  if (filters.projectId) ref = ref.where('projectId', '==', filters.projectId);
  if (filters.assignee) ref = ref.where('assignee', '==', filters.assignee);
  if (filters.status) ref = ref.where('ステータス', '==', filters.status);
  const normalizedEmail = normalizeAssigneeEmail(filters.assigneeEmail);
  if (normalizedEmail) ref = ref.where('担当者メール', '==', normalizedEmail);
  ref = ref.orderBy('updatedAt', 'desc');
  const snap = await ref.get();
  let results = snap.docs.map((doc) => serialize<TaskDoc>(doc));

  // 削除済みタスクを除外（includeDeletedがfalseの場合）
  if (!filters.includeDeleted) {
    results = results.filter((t) => !t.deletedAt);
  }

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

  // デバッグ: マイルストーンフィールドを含むタスクをログ出力
  const tasksWithMilestone = results.filter(t => t['マイルストーン'] !== undefined);
  if (tasksWithMilestone.length > 0) {
    console.log('[listTasks] Tasks with milestone field:', tasksWithMilestone.map(t => ({
      id: t.id,
      name: t.タスク名,
      milestone: t['マイルストーン']
    })));
  }

  return results;
}

/**
 * 削除済みタスクのみを取得
 */
export async function listDeletedTasks(orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const snap = await db.collection('orgs').doc(targetOrgId).collection('tasks').orderBy('deletedAt', 'desc').get();
  return snap.docs
    .map((doc) => serialize<TaskDoc>(doc))
    .filter((t) => t.deletedAt); // deletedAtがあるもののみ
}

// Note: generateProjectId() and generateTaskId() have been replaced with
// counter-based functions in counters.ts to avoid full collection scans.
// See getNextProjectId() and getNextTaskId() in ./counters.ts

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

export async function createProject(payload: ProjectInput, orgId?: string, createdBy?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const sanitizedPayload = sanitizeFieldNames(payload);
  let didSyncCounter = false;

  const syncProjectCounterToLatest = async () => {
    if (didSyncCounter) return;
    didSyncCounter = true;

    const latestSnapshot = await db
      .collection('orgs')
      .doc(targetOrgId)
      .collection('projects')
      .orderBy(admin.firestore.FieldPath.documentId(), 'desc')
      .limit(1)
      .get();

    if (latestSnapshot.empty) return;

    const latestId = latestSnapshot.docs[0].id;
    const match = /^P-(\d+)$/.exec(latestId);
    if (!match) return;

    const latestNumber = Number(match[1]);
    if (!Number.isFinite(latestNumber)) return;

    await db
      .doc(`orgs/${targetOrgId}/counters/projects`)
      .set({ value: latestNumber }, { merge: true });
  };

  // プロジェクト作成者のユーザー情報を事前に取得（バッチ外で実行）
  let userData: any = null;
  let creatorOrgId = targetOrgId;
  if (createdBy) {
    const userDoc = await db.collection('users').doc(createdBy).get();
    if (userDoc.exists) {
      userData = userDoc.data();
      creatorOrgId = userData?.orgId || targetOrgId;
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Always generate new ID to prevent accidental overwrites
    // 組織ごとに独立したIDカウンターを使用
    const projectId = await getNextProjectId(targetOrgId);

    // プロジェクトドキュメントを追加
    const docRef = db.collection('orgs').doc(targetOrgId).collection('projects').doc(projectId);

    // 既存のプロジェクトが存在しないかチェック（上書き防止）
    const existingProject = await docRef.get();
    if (existingProject.exists) {
      console.warn(`[createProject] Project ${projectId} already exists, retrying...`);
      await syncProjectCounterToLatest();
      continue;
    }

    // バッチ書き込みを使用して複数の操作を一度に実行
    const batch = db.batch();

    const isExternalCreator = creatorOrgId !== targetOrgId;
    const creatorName = userData?.displayName || userData?.email || '';
    const memberNames = creatorName ? [creatorName] : [];
    batch.set(docRef, {
      ...sanitizedPayload,
      id: projectId,
      ProjectID: projectId,
      ownerOrgId: targetOrgId,
      memberCount: 1,  // 作成者が最初のメンバー
      externalMemberCount: isExternalCreator ? 1 : 0,  // 作成者が外部メンバーの場合
      memberNames,
      memberNamesUpdatedAt: memberNames.length ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // プロジェクト作成者を自動的にメンバーとして追加
    if (createdBy && userData) {
      try {
        const memberId = `${projectId}_${createdBy}`;

        const memberData = {
          id: memberId,
          projectId: projectId,
          projectOrgId: targetOrgId,
          userId: createdBy,
          email: userData?.email || '',
          displayName: userData?.displayName || userData?.email || '',
          orgId: userData?.orgId || targetOrgId,
          orgName: userData?.orgName || targetOrgId,
          role: 'owner',
          職種: userData?.職種 || null,
          permissions: {
            canEditProject: true,
            canDeleteProject: true,
            canManageMembers: true,
            canViewTasks: true,
            canCreateTasks: true,
            canEditTasks: true,
            canDeleteTasks: true,
            canViewFiles: true,
            canUploadFiles: true,
          },
          invitedBy: createdBy,
          invitedAt: now,
          joinedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };

        // バッチにメンバーデータを追加
        // トップレベルの project_members コレクションに保存
        const memberDocRef = db.collection('project_members').doc(memberId);
        batch.set(memberDocRef, memberData);

        // プロジェクトのサブコレクションにも保存
        const subMemberDocRef = db
          .collection('orgs')
          .doc(targetOrgId)
          .collection('projects')
          .doc(projectId)
          .collection('members')
          .doc(createdBy);
        batch.set(subMemberDocRef, memberData);

        console.log(`[createProject] Prepared creator ${createdBy} as owner of project ${projectId}`);
      } catch (error) {
        console.error('[createProject] Failed to prepare creator as member:', error);
        // エラーが発生してもプロジェクト作成は成功させる
      }
    }

    // バッチをコミット（1回の操作で全ての書き込みを実行）
    await batch.commit();

    return projectId;
  }

  throw new Error('Failed to allocate a unique project ID. Please try again.');
}

export async function updateProject(projectId: string, payload: Partial<ProjectInput>, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('projects').doc(projectId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Project not found');

  const sanitizedPayload = sanitizeFieldNames(payload);

  await ref.update({
    ...sanitizedPayload,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function deleteProject(projectId: string, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('projects').doc(projectId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Project not found');

  // ソフトデリート: deletedAtタイムスタンプを設定
  await ref.update({
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * プロジェクトを復元（ソフトデリートを取り消し）
 */
export async function restoreProject(projectId: string, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('projects').doc(projectId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Project not found');

  await ref.update({
    deletedAt: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * プロジェクトを完全削除（物理削除）
 */
export async function permanentlyDeleteProject(projectId: string, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('projects').doc(projectId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Project not found');
  await ref.delete();
}

export async function createPerson(payload: PersonInput, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const personId = payload.氏名;
  const docRef = db.collection('orgs').doc(targetOrgId).collection('people').doc(personId);
  await docRef.set({
    ...payload,
    id: personId,
    createdAt: now,
    updatedAt: now,
  });
  return personId;
}

export async function createTask(payload: TaskInput, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const now = admin.firestore.FieldValue.serverTimestamp();
  // 常に新しいタスクIDを生成（payloadのidは無視）
  const taskId = await getNextTaskId();
  const docRef = db.collection('orgs').doc(targetOrgId).collection('tasks').doc(taskId);
  const notifications = normalizeNotificationSettings(payload['通知設定']);
  const dependencies = normalizeDependencies(payload['依存タスク']);
  const assigneeEmail = normalizeAssigneeEmail(payload.担当者メール);
  const derived = deriveTaskFields(payload);

  // payloadからidとTaskIDを除外してから保存
  const { id: _id, TaskID: _TaskID, ...cleanPayload } = payload as any;

  await docRef.set({
    ...cleanPayload,
    '通知設定': notifications,
    '依存タスク': dependencies,
    担当者メール: assigneeEmail,
    ...derived,
    id: taskId,
    TaskID: taskId,
    projectId: payload.projectId,
    orgId: targetOrgId,
    createdAt: now,
    updatedAt: now,
  });
  return taskId;
}

export async function updateTask(taskId: string, payload: Partial<TaskInput>, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('tasks').doc(taskId);
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

  const updateData = {
    ...normalizedPayload,
    ...derived,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  console.log('[updateTask] About to update with data:', {
    taskId,
    parentId_in_payload: payload.parentId,
    parentId_in_normalized: normalizedPayload.parentId,
    parentId_in_updateData: updateData.parentId,
    milestone_in_payload: payload['マイルストーン'],
    milestone_in_normalized: normalizedPayload['マイルストーン'],
    milestone_in_merged: merged['マイルストーン'],
    milestone_in_updateData: updateData['マイルストーン']
  });

  await ref.update(updateData);
}

export async function deleteTask(taskId: string, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('tasks').doc(taskId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Task not found');

  // ソフトデリート: deletedAtタイムスタンプを設定
  await ref.update({
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * タスクを復元（ソフトデリートを取り消し）
 */
export async function restoreTask(taskId: string, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('tasks').doc(taskId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Task not found');

  await ref.update({
    deletedAt: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * タスクを完全削除（物理削除）
 */
export async function permanentlyDeleteTask(taskId: string, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('tasks').doc(taskId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Task not found');
  await ref.delete();
}

export async function moveTaskDates(taskId: string, payload: { 予定開始日?: string | null; 期限?: string | null }, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('tasks').doc(taskId);
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

export async function completeTask(taskId: string, done: boolean, orgId?: string) {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('tasks').doc(taskId);
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
  await updateTask(taskId, payload, orgId);
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
  施工費?: number | null;
}

export interface TaskInput {
  id?: string;
  TaskID?: string;
  ProjectID?: string;
  projectId: string;
  orgId?: string;

  // WorkItem 統合のための追加フィールド
  type?: 'stage' | 'task';
  parentId?: string | null;
  orderIndex?: number | null;

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
  マイルストーン?: boolean | null;
  スプリント?: string | null;
  フェーズ?: string | null;
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

export type ProjectDoc = WithTimestamps<ProjectInput> & { id: string; deletedAt?: string };
export type TaskDoc = WithTimestamps<TaskInput> & { id: string; deletedAt?: string };

export interface SnapshotPayload {
  generated_at?: string;
  projects?: ProjectInput[];
  tasks?: TaskInput[];
  people?: PersonDoc[];
}

// ==================== Invitation Functions ====================

import type { User, ProjectInvitation, ProjectInvitationInput, TaskCreator, UserOrgAccess } from './types';

/**
 * ユーザー情報を取得
 */
export async function getUser(uid: string): Promise<User | null> {
  // uid が空の場合は null を返す
  if (!uid || uid.trim() === '') {
    console.error('getUser called with empty uid');
    return null;
  }
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data) return null;
  return data as User;
}

/**
 * ユーザー情報を作成または更新
 */
export async function upsertUser(uid: string, data: Partial<User>): Promise<void> {
  const ref = db.collection('users').doc(uid);
  const doc = await ref.get();

  if (doc.exists) {
    await ref.update({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await ref.set({
      email: data.email || '',
      orgId: data.orgId || ORG_ID,
      organizations: data.organizations || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...data,
    });
  }
}

/**
 * プロジェクト招待を作成
 */
export async function createInvitation(
  input: ProjectInvitationInput,
  orgId?: string
): Promise<string> {
  const targetOrgId = orgId ?? ORG_ID;
  const ref = db.collection('orgs').doc(targetOrgId).collection('invitations').doc();

  await ref.set({
    ...input,
    invitedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    status: 'pending',
  });

  return ref.id;
}

/**
 * 招待一覧を取得
 */
export async function listInvitations(orgId?: string): Promise<ProjectInvitation[]> {
  const targetOrgId = orgId ?? ORG_ID;
  const snap = await db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('invitations')
    .orderBy('invitedAt', 'desc')
    .get();

  return snap.docs.map((doc) => serialize<ProjectInvitation>(doc));
}

/**
 * 招待を取得
 */
export async function getInvitation(invitationId: string, orgId?: string): Promise<ProjectInvitation | null> {
  const targetOrgId = orgId ?? ORG_ID;
  const doc = await db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('invitations')
    .doc(invitationId)
    .get();

  if (!doc.exists) return null;
  const data = doc.data();
  if (!data) return null;

  // Manually serialize with type conversion
  return {
    ...data,
    id: doc.id,
    invitedAt: data.invitedAt instanceof admin.firestore.Timestamp ? data.invitedAt.toDate().toISOString() : data.invitedAt,
    expiresAt: data.expiresAt instanceof admin.firestore.Timestamp ? data.expiresAt.toDate().toISOString() : data.expiresAt,
    acceptedAt: data.acceptedAt instanceof admin.firestore.Timestamp ? data.acceptedAt?.toDate().toISOString() : data.acceptedAt,
  } as ProjectInvitation;
}

/**
 * 招待を承認
 */
export async function acceptInvitation(
  invitationId: string,
  userId: string,
  orgId?: string
): Promise<void> {
  const targetOrgId = orgId ?? ORG_ID;
  const invitationRef = db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('invitations')
    .doc(invitationId);

  const invitation = await invitationRef.get();
  if (!invitation.exists) {
    throw new Error('Invitation not found');
  }

  const invData = invitation.data() as ProjectInvitation;

  // Check if expired
  if (invData.expiresAt.toMillis() < Date.now()) {
    await invitationRef.update({ status: 'expired' });
    throw new Error('Invitation has expired');
  }

  // Update invitation status
  await invitationRef.update({
    status: 'accepted',
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    acceptedBy: userId,
  });

  // Update user's organizations
  const userRef = db.collection('users').doc(userId);
  const orgAccess: UserOrgAccess = {
    role: invData.role === 'guest' ? 'guest' : 'member',
    joinedAt: admin.firestore.Timestamp.now(),
    invitedBy: invData.invitedBy,
    accessLevel: 'project-specific',
    projects: [invData.projectId],
  };

  await userRef.update({
    [`organizations.${targetOrgId}`]: orgAccess,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * 招待を拒否
 */
export async function declineInvitation(invitationId: string, orgId?: string): Promise<void> {
  const targetOrgId = orgId ?? ORG_ID;
  await db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('invitations')
    .doc(invitationId)
    .update({ status: 'declined' });
}

/**
 * 招待を削除（キャンセル）
 */
export async function deleteInvitation(invitationId: string, orgId?: string): Promise<void> {
  const targetOrgId = orgId ?? ORG_ID;
  await db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('invitations')
    .doc(invitationId)
    .delete();
}

/**
 * タスク作成者を記録
 */
export async function recordTaskCreator(
  taskId: string,
  creatorId: string,
  orgId?: string
): Promise<void> {
  const targetOrgId = orgId ?? ORG_ID;
  await db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('taskCreators')
    .doc(taskId)
    .set({
      taskId,
      createdBy: creatorId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

/**
 * タスク作成者を取得
 */
export async function getTaskCreator(taskId: string, orgId?: string): Promise<TaskCreator | null> {
  const targetOrgId = orgId ?? ORG_ID;
  const doc = await db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('taskCreators')
    .doc(taskId)
    .get();

  if (!doc.exists) return null;
  return doc.data() as TaskCreator;
}

/**
 * ユーザーがタスクを編集可能かチェック
 */
export async function canEditTask(
  taskId: string,
  userEmail: string,
  orgId?: string
): Promise<boolean> {
  const creator = await getTaskCreator(taskId, orgId);
  if (!creator) return true; // 作成者が記録されていない場合は編集可能（後方互換性）
  return creator.createdByEmail === userEmail;
}

// =========================
// Stage CRUD Functions
// =========================

/**
 * 工程(stage)一覧を取得
 */
export async function listStages(projectId: string, orgId?: string): Promise<TaskDoc[]> {
  const targetOrgId = orgId ?? ORG_ID;
  const snapshot = await db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('tasks')
    .where('projectId', '==', projectId)
    .where('type', '==', 'stage')
    .orderBy('orderIndex', 'asc')
    .orderBy('createdAt', 'asc')
    .get();

  return snapshot.docs.map((doc) => serialize<TaskDoc>(doc));
}

/**
 * 工程(stage)を作成
 */
export async function createStage(input: {
  projectId: string;
  orgId: string;
  タスク名: string;
  予定開始日?: string | null;
  期限?: string | null;
  orderIndex?: number | null;
}): Promise<string> {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const stageId = await getNextTaskId();

  const stageData: Partial<TaskDoc> = {
    projectId: input.projectId,
    orgId: input.orgId,
    type: 'stage',
    parentId: null,
    タスク名: input.タスク名,
    ステータス: '未着手', // デフォルト
    予定開始日: input.予定開始日 ?? null,
    期限: input.期限 ?? null,
    orderIndex: input.orderIndex ?? null,
    createdAt: now as any,
    updatedAt: now as any,
  };

  await db
    .collection('orgs')
    .doc(input.orgId)
    .collection('tasks')
    .doc(stageId)
    .set(stageData);

  return stageId;
}

/**
 * 工程(stage)を更新
 */
export async function updateStage(
  stageId: string,
  updates: {
    タスク名?: string;
    予定開始日?: string | null;
    期限?: string | null;
    orderIndex?: number | null;
  },
  orgId?: string
): Promise<void> {
  const targetOrgId = orgId ?? ORG_ID;
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('tasks')
    .doc(stageId)
    .update({
      ...updates,
      updatedAt: now,
    });
}

/**
 * 工程(stage)を削除
 * - stage 配下のタスクの parentId を null にする（未割り当てに戻す）
 */
export async function deleteStage(stageId: string, orgId?: string): Promise<void> {
  const targetOrgId = orgId ?? ORG_ID;
  const batch = db.batch();

  // stage を削除
  const stageRef = db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('tasks')
    .doc(stageId);
  batch.delete(stageRef);

  // この stage 配下のタスクを取得
  const tasksSnapshot = await db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('tasks')
    .where('parentId', '==', stageId)
    .get();

  // parentId を null に設定（未割り当てタスクに戻す）
  tasksSnapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      parentId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}

/**
 * 工程(stage)を取得
 */
export async function getStage(stageId: string, orgId?: string): Promise<TaskDoc | null> {
  const targetOrgId = orgId ?? ORG_ID;
  const doc = await db
    .collection('orgs')
    .doc(targetOrgId)
    .collection('tasks')
    .doc(stageId)
    .get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    ...data,
  } as TaskDoc;
}
