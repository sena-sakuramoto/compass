/**
 * メンバー/ゲスト数の制限チェック
 */

import { db } from './firestore';
import type { MemberType, Organization } from './auth-types';

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
    .where('isActive', '==', true)
    .get();

  let members = 0;
  let guests = 0;

  for (const doc of usersSnapshot.docs) {
    const user = doc.data();
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
 * 組織の上限設定を取得
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

  // デフォルト値を設定
  return {
    maxMembers: org.limits?.maxMembers ?? 5,
    maxGuests: org.limits?.maxGuests ?? 10,
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
  // admin と project_manager のみが招待可能
  return userRole === 'admin' || userRole === 'project_manager';
}
