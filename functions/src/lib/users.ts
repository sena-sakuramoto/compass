import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { User, UserInput, Organization } from './auth-types';
import { Role, getRolePermissions } from './roles';

const db = getFirestore();

/**
 * ユーザーを作成
 */
export async function createUser(uid: string, input: UserInput): Promise<User> {
  const now = Timestamp.now();
  
  const user: User = {
    id: uid,
    email: input.email,
    displayName: input.displayName,
    orgId: input.orgId,
    role: input.role,
    職種: input.職種,
    部署: input.部署,
    電話番号: input.電話番号,
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
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  return doc.data() as User;
}

/**
 * ユーザーを更新
 */
export async function updateUser(
  uid: string,
  updates: Partial<Omit<User, 'id' | 'email' | 'orgId' | 'createdAt'>>
): Promise<void> {
  const now = Timestamp.now();
  await db.collection('users').doc(uid).update({
    ...updates,
    updatedAt: now,
  });
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
  return snapshot.docs.map(doc => doc.data() as User);
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
  return snapshot.docs[0].data() as User;
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
  return doc.data() as Organization;
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
  return snapshot.docs.map(doc => doc.data() as Organization);
}

/**
 * ユーザーの権限を取得
 */
export function getUserPermissions(user: User) {
  return getRolePermissions(user.role);
}

