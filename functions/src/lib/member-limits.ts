/**
 * メンバー数の制限チェック
 */

import { db } from './firestore';
import type { Organization } from './auth-types';
import { PLAN_LIMITS } from './auth-types';

/**
 * 組織のメンバー数を取得
 */
export async function getMemberCounts(orgId: string): Promise<{
  members: number;
}> {
  // ユーザーはトップレベルの /users/ コレクションに保存されている
  const usersSnapshot = await db
    .collection('users')
    .where('orgId', '==', orgId)
    .get();

  let members = 0;

  for (const doc of usersSnapshot.docs) {
    const user = doc.data();
    // isActiveがtrueまたは未定義の場合のみカウント（falseは除外）
    if (user.isActive !== false) {
      members++;
    }
  }

  return {
    members,
  };
}

/**
 * 組織の上限設定を取得（プラン対応）
 */
export async function getOrganizationLimits(orgId: string): Promise<{
  maxMembers: number;
}> {
  const orgDoc = await db.collection('orgs').doc(orgId).get();

  if (!orgDoc.exists) {
    throw new Error('Organization not found');
  }

  const org = orgDoc.data() as Organization;

  // カスタム上限が設定されている場合はそれを使用
  if (org.limits) {
    return {
      maxMembers: org.limits.maxMembers,
    };
  }

  // プランに基づいた上限を取得（未設定の場合はstarter扱い）
  const plan = org.plan || 'starter';
  const planLimits = PLAN_LIMITS[plan];

  return {
    maxMembers: planLimits.members,
  };
}

/**
 * 新しいメンバーを追加できるかチェック
 */
export async function canAddMember(
  orgId: string
): Promise<{
  canAdd: boolean;
  reason?: string;
  current: number;
  max: number;
}> {
  const counts = await getMemberCounts(orgId);
  const limits = await getOrganizationLimits(orgId);

  const canAdd = counts.members < limits.maxMembers;
  return {
    canAdd,
    reason: canAdd ? undefined : `メンバー数が上限（${limits.maxMembers}人）に達しています`,
    current: counts.members,
    max: limits.maxMembers,
  };
}

/**
 * 招待権限をチェック
 */
export function canInviteMembers(userRole: string): boolean {
  // super_admin, admin, project_manager が招待可能
  return userRole === 'super_admin' || userRole === 'admin' || userRole === 'project_manager';
}
