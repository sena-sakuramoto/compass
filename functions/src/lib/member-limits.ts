/**
 * メンバー/ゲスト数の制限チェック
 */

import { db } from './firestore';
import type { MemberType, Organization } from './auth-types';
import { PLAN_LIMITS } from './auth-types';

/**
 * 組織のメンバー/ゲスト数を取得
 */
export async function getMemberCounts(orgId: string): Promise<{
  members: number;
  guests: number;
  total: number;
}> {
  const usersSnapshot = await db
    .collection('orgs')
    .doc(orgId)
    .collection('users')
    .get();

  let members = 0;
  let guests = 0;

  for (const doc of usersSnapshot.docs) {
    const user = doc.data();
    // isActiveがtrueまたは未定義の場合のみカウント（falseは除外）
    if (user.isActive === false) {
      continue;
    }
    if (user.memberType === 'member') {
      members++;
    } else if (user.memberType === 'guest') {
      guests++;
    }
  }

  return {
    members,
    guests,
    total: members + guests,
  };
}

/**
 * 組織の上限設定を取得（プラン対応）
 */
export async function getOrganizationLimits(orgId: string): Promise<{
  maxMembers: number;
  maxGuests: number;
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
      maxGuests: org.limits.maxGuests,
    };
  }

  // プランに基づいた上限を取得（未設定の場合はstarter扱い）
  const plan = org.plan || 'starter';
  const planLimits = PLAN_LIMITS[plan];

  return {
    maxMembers: planLimits.members,
    maxGuests: planLimits.guests,
  };
}

/**
 * 新しいメンバー/ゲストを追加できるかチェック
 */
export async function canAddMember(
  orgId: string,
  memberType: MemberType
): Promise<{
  canAdd: boolean;
  reason?: string;
  current: number;
  max: number;
}> {
  const counts = await getMemberCounts(orgId);
  const limits = await getOrganizationLimits(orgId);

  if (memberType === 'member') {
    const canAdd = counts.members < limits.maxMembers;
    return {
      canAdd,
      reason: canAdd ? undefined : `メンバー数が上限（${limits.maxMembers}人）に達しています`,
      current: counts.members,
      max: limits.maxMembers,
    };
  } else {
    const canAdd = counts.guests < limits.maxGuests;
    return {
      canAdd,
      reason: canAdd ? undefined : `ゲスト数が上限（${limits.maxGuests}人）に達しています`,
      current: counts.guests,
      max: limits.maxGuests,
    };
  }
}

/**
 * 招待権限をチェック
 */
export function canInviteMembers(userRole: string): boolean {
  // super_admin, admin, project_manager が招待可能
  return userRole === 'super_admin' || userRole === 'admin' || userRole === 'project_manager';
}

/**
 * ユーザーのゲスト権限を取得
 */
export function getUserGuestPermissions(user: any) {
  const { DEFAULT_GUEST_PERMISSIONS } = require('./auth-types');

  // memberTypeがguestでない場合はnullを返す
  if (user.memberType !== 'guest') {
    return null;
  }

  // カスタム権限が設定されている場合はそれを使用、なければデフォルト
  return user.guestPermissions || DEFAULT_GUEST_PERMISSIONS;
}

/**
 * ゲストが特定の操作を実行できるかチェック
 */
export function canGuestPerform(
  user: any,
  action: 'viewProject' | 'createOwnTasks' | 'editOwnTasks' | 'deleteOwnTasks' |
    'assignTasksToOthers' | 'editOtherTasks' | 'createProjects'
): boolean {
  const permissions = getUserGuestPermissions(user);

  // ゲストでない場合は通常の権限チェックに委ねる
  if (!permissions) {
    return true;
  }

  return permissions[action] || false;
}
