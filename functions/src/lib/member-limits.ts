/**
 * メンバー数の制限チェック
 */

import { db } from './firestore';
import type { Organization, SubscriptionPlan } from './auth-types';
import { PLAN_LIMITS } from './auth-types';
import { getOrgBilling, getSeatLimit, getSeatInfo, type SeatInfo } from './billing';

const PLAN_OVERRIDES: Record<string, SubscriptionPlan> = {
  'archi-prisma': 'business',
};

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
 * 優先順位：
 * 1. org_billing.seatLimit（Stripeから同期した席数）
 * 2. org.limits.maxMembers（カスタム上限）
 * 3. PLAN_LIMITS[plan].members（プランのデフォルト上限）
 */
export async function getOrganizationLimits(orgId: string): Promise<{
  maxMembers: number;
  seatInfo?: SeatInfo;
}> {
  // まずorg_billingから席数を取得
  const billingDoc = await getOrgBilling(orgId);
  const seatLimit = getSeatLimit(billingDoc);
  const seatInfo = getSeatInfo(billingDoc);

  // seatLimitが設定されている場合はそれを使用
  if (seatLimit !== null) {
    return {
      maxMembers: seatLimit,
      seatInfo,
    };
  }

  const orgDoc = await db.collection('orgs').doc(orgId).get();

  if (!orgDoc.exists) {
    throw new Error('Organization not found');
  }

  const org = orgDoc.data() as Organization;

  // カスタム上限が設定されている場合はそれを使用
  if (org.limits) {
    return {
      maxMembers: org.limits.maxMembers,
      seatInfo,
    };
  }

  // プランに基づいた上限を取得（未設定の場合はstarter扱い）
  const planOverride = PLAN_OVERRIDES[orgDoc.id];
  const plan = planOverride || org.plan || 'starter';
  const planLimits = PLAN_LIMITS[plan];

  return {
    maxMembers: planLimits.members,
    seatInfo,
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
  seatInfo?: SeatInfo;
}> {
  const counts = await getMemberCounts(orgId);
  const limits = await getOrganizationLimits(orgId);

  const canAdd = counts.members < limits.maxMembers;
  return {
    canAdd,
    reason: canAdd ? undefined : `メンバー数が上限（${limits.maxMembers}人）に達しています`,
    current: counts.members,
    max: limits.maxMembers,
    seatInfo: limits.seatInfo,
  };
}

/**
 * 組織の席数利用状況を取得（API用）
 */
export async function getSeatUsage(orgId: string): Promise<{
  current: number;
  max: number;
  remaining: number;
  seatInfo: SeatInfo;
  canAddMore: boolean;
}> {
  const counts = await getMemberCounts(orgId);
  const limits = await getOrganizationLimits(orgId);
  const seatInfo = limits.seatInfo || {
    seatLimit: null,
    isCircleMember: false,
    circleBaseSeats: 3,
    additionalSeats: 0,
    source: 'plan_default' as const,
  };

  return {
    current: counts.members,
    max: limits.maxMembers,
    remaining: Math.max(0, limits.maxMembers - counts.members),
    seatInfo,
    canAddMore: counts.members < limits.maxMembers,
  };
}

/**
 * 招待権限をチェック
 */
export function canInviteMembers(userRole: string): boolean {
  // super_admin, admin, project_manager が招待可能
  return userRole === 'super_admin' || userRole === 'admin' || userRole === 'project_manager';
}
