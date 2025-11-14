import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * アクティビティログのタイプ
 */
export type ActivityType =
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.completed'
  | 'member.added'
  | 'member.updated'
  | 'member.removed'
  | 'member.accepted';

/**
 * アクティビティログ
 */
export interface ActivityLog {
  id: string;                    // ログID
  orgId: string;                 // 組織ID
  projectId?: string;            // プロジェクトID（プロジェクト関連のみ）
  taskId?: string;               // タスクID（タスク関連のみ）
  type: ActivityType;            // アクティビティタイプ
  userId: string;                // 実行ユーザーID
  userName: string;              // 実行ユーザー名
  userEmail: string;             // 実行ユーザーメール
  targetType: 'project' | 'task' | 'member' | 'person'; // 対象タイプ
  targetId: string;              // 対象ID
  targetName: string;            // 対象名
  action: string;                // アクション（例: "作成", "更新", "削除"）
  changes?: Record<string, { before: any; after: any }>; // 変更内容
  metadata?: Record<string, any>; // その他のメタデータ
  createdAt: Timestamp;          // 作成日時
}

/**
 * アクティビティログを記録
 */
export async function logActivity(params: {
  orgId: string;
  projectId?: string;
  taskId?: string;
  type: ActivityType;
  userId: string;
  userName: string;
  userEmail: string;
  targetType: 'project' | 'task' | 'member' | 'person';
  targetId: string;
  targetName: string;
  action: string;
  changes?: Record<string, { before: any; after: any }>;
  metadata?: Record<string, any>;
}): Promise<string> {
  const logRef = db.collection('activity_logs').doc();

  const log: ActivityLog = {
    id: logRef.id,
    orgId: params.orgId,
    projectId: params.projectId,
    taskId: params.taskId,
    type: params.type,
    userId: params.userId,
    userName: params.userName,
    userEmail: params.userEmail,
    targetType: params.targetType,
    targetId: params.targetId,
    targetName: params.targetName,
    action: params.action,
    changes: params.changes,
    metadata: params.metadata,
    createdAt: Timestamp.now(),
  };

  await logRef.set(log);
  return logRef.id;
}

/**
 * アクティビティログを取得
 */
export async function listActivityLogs(params: {
  orgId: string;
  projectId?: string;
  taskId?: string;
  userId?: string;
  limit?: number;
  startAfter?: Timestamp;
}): Promise<ActivityLog[]> {
  let query = db
    .collection('activity_logs')
    .where('orgId', '==', params.orgId) as FirebaseFirestore.Query;

  if (params.projectId) {
    query = query.where('projectId', '==', params.projectId);
  }

  if (params.taskId) {
    query = query.where('taskId', '==', params.taskId);
  }

  if (params.userId) {
    query = query.where('userId', '==', params.userId);
  }

  query = query.orderBy('createdAt', 'desc');

  if (params.limit) {
    query = query.limit(params.limit);
  }

  if (params.startAfter) {
    query = query.startAfter(params.startAfter);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data() as ActivityLog);
}

/**
 * 変更内容を計算
 */
export function calculateChanges(
  before: Record<string, any>,
  after: Record<string, any>,
  fields?: string[]
): Record<string, { before: any; after: any }> {
  const changes: Record<string, { before: any; after: any }> = {};

  const keysToCheck = fields || Object.keys({ ...before, ...after });

  for (const key of keysToCheck) {
    const beforeValue = before[key];
    const afterValue = after[key];

    // 値が変更された場合のみ記録
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[key] = {
        before: beforeValue,
        after: afterValue,
      };
    }
  }

  return changes;
}
