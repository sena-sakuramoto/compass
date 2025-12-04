import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { User, UserInput, Organization, MemberType } from './auth-types';
import { Role, getRolePermissions } from './roles';

const db = getFirestore();
const auth = getAuth();

/**
 * ロールに基づいてデフォルトのmemberTypeを決定
 * - super_admin, admin: internal（社内管理者）
 * - project_manager: partner（パートナー企業のPM）
 * - その他: internal（デフォルトは社内メンバー）
 */
export function getDefaultMemberType(role: Role): MemberType {
  if (role === 'super_admin' || role === 'admin') {
    return 'internal';
  } else if (role === 'project_manager') {
    return 'partner';
  }
  return 'internal'; // デフォルトは internal
}

/**
 * ユーザーを作成
 */
export async function createUser(uid: string, input: UserInput): Promise<User> {
  const now = Timestamp.now();

  // memberType が指定されていない場合は、ロールから自動設定
  const memberType = input.memberType || getDefaultMemberType(input.role);

  const user: User = {
    id: uid,
    email: input.email,
    displayName: input.displayName,
    orgId: input.orgId,
    role: input.role,
    memberType,
    jobTitle: input.jobTitle,
    department: input.department,
    phoneNumber: input.phoneNumber,
    photoURL: input.photoURL,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('users').doc(uid).set(user);
  return user;
}

/**
 * ユーザーを取得
 */
export async function getUser(uid: string): Promise<User | null> {
  // uid が空の場合は null を返す
  if (!uid || uid.trim() === '') {
    console.error('getUser called with empty uid');
    return null;
  }

  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  const data = doc.data() as User;
  return {
    ...data,
    id: doc.id, // Ensure id is set from document ID
  };
}

/**
 * ユーザーを更新
 */
export async function updateUser(
  uid: string,
  updates: Partial<Omit<User, 'id' | 'orgId' | 'createdAt'>>
): Promise<void> {
  const now = Timestamp.now();

  // メールアドレスが変更される場合はFirebase Authも更新
  if (updates.email) {
    try {
      await auth.updateUser(uid, { email: updates.email });
    } catch (error: any) {
      console.error('[Users] Failed to update Firebase Auth email:', error);
      // Firebase Auth の詳細なエラーメッセージを返す
      const errorCode = error?.code || 'unknown';
      if (errorCode === 'auth/email-already-exists') {
        throw new Error('このメールアドレスは既に使用されています');
      } else if (errorCode === 'auth/invalid-email') {
        throw new Error('無効なメールアドレスです');
      } else if (errorCode === 'auth/user-not-found') {
        throw new Error('ユーザーが見つかりません');
      }
      throw new Error(`メールアドレスの更新に失敗しました: ${errorCode}`);
    }
  }

  // Firestoreを更新
  try {
    await db.collection('users').doc(uid).update({
      ...updates,
      updatedAt: now,
    });
  } catch (error: any) {
    console.error('[Users] Failed to update Firestore:', error);
    throw new Error('ユーザー情報の更新に失敗しました');
  }
}

/**
 * ユーザー一覧を取得
 */
export async function listUsers(filters?: {
  orgId?: string;
  role?: Role;
  isActive?: boolean;
}): Promise<User[]> {
  let query = db.collection('users') as FirebaseFirestore.Query;

  if (filters?.orgId) {
    query = query.where('orgId', '==', filters.orgId);
  }

  if (filters?.role) {
    query = query.where('role', '==', filters.role);
  }

  if (filters?.isActive !== undefined) {
    query = query.where('isActive', '==', filters.isActive);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({
    ...(doc.data() as User),
    id: doc.id, // Ensure id is set from document ID
  }));
}

/**
 * メールアドレスからユーザーを検索
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const snapshot = await db.collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return {
    ...(doc.data() as User),
    id: doc.id, // Ensure id is set from document ID
  };
}

/**
 * ユーザーのログイン時刻を更新
 */
export async function updateLastLogin(uid: string): Promise<void> {
  const now = Timestamp.now();
  await db.collection('users').doc(uid).update({
    lastLoginAt: now,
    updatedAt: now,
  });
}

/**
 * ユーザーを非アクティブ化
 */
export async function deactivateUser(uid: string): Promise<void> {
  await updateUser(uid, { isActive: false });
}

/**
 * ユーザーをアクティブ化
 */
export async function activateUser(uid: string): Promise<void> {
  await updateUser(uid, { isActive: true });
}

/**
 * 組織を作成
 */
export async function createOrganization(input: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>): Promise<Organization> {
  const now = Timestamp.now();
  const docRef = db.collection('organizations').doc();

  const org: Organization = {
    id: docRef.id,
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(org);
  return org;
}

/**
 * 組織を取得
 */
export async function getOrganization(orgId: string): Promise<Organization | null> {
  const doc = await db.collection('organizations').doc(orgId).get();
  if (!doc.exists) return null;
  const data = doc.data() as Organization;
  return {
    ...data,
    id: doc.id, // Ensure id is set from document ID
  };
}

/**
 * 組織一覧を取得
 */
export async function listOrganizations(type?: Organization['type']): Promise<Organization[]> {
  let query = db.collection('organizations') as FirebaseFirestore.Query;

  if (type) {
    query = query.where('type', '==', type);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({
    ...(doc.data() as Organization),
    id: doc.id, // Ensure id is set from document ID
  }));
}

/**
 * ユーザーの権限を取得
 */
export function getUserPermissions(user: User) {
  return getRolePermissions(user.role);
}
