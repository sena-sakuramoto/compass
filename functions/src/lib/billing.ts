import { db } from './firestore';
import type { User } from './auth-types';

export type BillingPlanType = 'stripe' | 'enterprise_manual' | 'special_admin' | 'inactive';

export interface OrgBillingDoc {
  planType: BillingPlanType;
  stripeCustomerId?: string | null;
  subscriptionStatus?: string | null;
  subscriptionCurrentPeriodEnd?: number | null;
  subscriptionCancelAtPeriodEnd?: boolean;
  entitled?: boolean;
  notes?: string | null;
  updatedAt?: number;
  updatedBy?: string;
  lastStripeSyncAt?: number | null;
  stripeSnapshot?: {
    productNames?: string[];
    priceIds?: string[];
  };
}

export interface OrgBillingRecord extends OrgBillingDoc {
  orgId: string;
}

const COLLECTION = 'org_billing';
const DEFAULT_PLAN: BillingPlanType = 'stripe';

export async function getOrgBilling(orgId: string): Promise<OrgBillingDoc | null> {
  const snap = await db.collection(COLLECTION).doc(orgId).get();
  if (!snap.exists) return null;
  return snap.data() as OrgBillingDoc;
}

export async function listOrgBilling(): Promise<OrgBillingRecord[]> {
  const snap = await db.collection(COLLECTION).get();
  return snap.docs.map((doc) => ({ orgId: doc.id, ...(doc.data() as OrgBillingDoc) }));
}

export async function upsertOrgBilling(
  orgId: string,
  updates: Partial<OrgBillingDoc> & { updatedBy?: string }
): Promise<void> {
  const ref = db.collection(COLLECTION).doc(orgId);
  const existing = await ref.get();
  const currentPlan: BillingPlanType = updates.planType
    ? updates.planType
    : (existing.exists ? ((existing.data()?.planType as BillingPlanType) || DEFAULT_PLAN) : DEFAULT_PLAN);

  const data: Partial<OrgBillingDoc> = {
    ...updates,
    planType: currentPlan,
    updatedAt: Date.now(),
  };

  await ref.set(data, { merge: true });
}

export interface BillingAccessResult {
  allowed: boolean;
  reason: string;
  planType: BillingPlanType;
  details?: Record<string, unknown>;
}

export function evaluateBillingAccess(user: User, billingDoc: OrgBillingDoc | null): BillingAccessResult {
  if (user.role === 'super_admin') {
    return {
      allowed: true,
      reason: 'super_admin_override',
      planType: billingDoc?.planType ?? DEFAULT_PLAN,
    };
  }

  const planType = billingDoc?.planType ?? DEFAULT_PLAN;

  if (planType === 'special_admin' || planType === 'enterprise_manual') {
    return {
      allowed: true,
      reason: planType,
      planType,
    };
  }

  if (planType === 'inactive') {
    return {
      allowed: false,
      reason: 'plan_inactive',
      planType,
    };
  }

  // Default stripe plan
  if (!billingDoc?.stripeCustomerId) {
    return {
      allowed: false,
      reason: 'stripe_not_linked',
      planType,
    };
  }

  const status = billingDoc.subscriptionStatus ?? 'unknown';
  const entitled = billingDoc.entitled ?? false;
  if (entitled || status === 'active' || status === 'trialing') {
    return {
      allowed: true,
      reason: 'stripe_active',
      planType,
    };
  }

  return {
    allowed: false,
    reason: 'stripe_inactive',
    planType,
    details: {
      subscriptionStatus: status,
      currentPeriodEnd: billingDoc.subscriptionCurrentPeriodEnd ?? null,
      cancelAtPeriodEnd: billingDoc.subscriptionCancelAtPeriodEnd ?? null,
    },
  };
}
