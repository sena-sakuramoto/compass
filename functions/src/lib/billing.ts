import { db } from './firestore';
import type { User } from './auth-types';

export type BillingPlanType = 'stripe' | 'enterprise_manual' | 'special_admin' | 'inactive';

export interface OrgBillingDoc {
  planType: BillingPlanType;
  stripeCustomerId?: string | null;
  subscriptionStatus?: string | null;
  subscriptionCurrentPeriodEnd?: number | null;
  subscriptionCancelAtPeriodEnd?: boolean;
  entitled?: boolean | null;
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
const STRIPE_CUSTOMERS_COLLECTION = 'stripe_customers';
const STRIPE_API_BASE = 'https://api.stripe.com/v1';
export const DEFAULT_PLAN: BillingPlanType = 'stripe';

export interface StripeCustomerRecord {
  id: string;
  email?: string | null;
  emails: string[];
  discordId?: string | null;
  discordUserId?: string | null;
  discordAccounts: string[];
  status?: string | null;
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean | null;
  entitled?: boolean | null;
  productNames?: string[];
  priceIds?: string[];
  raw: Record<string, unknown>;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectStrings(item));
  }
  return [];
}

function extractEmails(data: Record<string, unknown>): string[] {
  const candidates: string[] = [];
  const addEmail = (value?: unknown) => {
    if (typeof value === 'string' && value.includes('@')) {
      candidates.push(value.trim());
    }
  };

  addEmail(data.email);
  addEmail(data.customerEmail);
  addEmail(data.billingEmail);
  addEmail((data.billingContact as Record<string, unknown> | undefined)?.email);
  addEmail((data.owner as Record<string, unknown> | undefined)?.email);
  addEmail((data.subscription as Record<string, unknown> | undefined)?.customerEmail);

  const invoiceSettings = data.invoiceSettings as Record<string, unknown> | undefined;
  if (invoiceSettings) {
    addEmail(invoiceSettings.email);
    const recipientEmails = invoiceSettings.recipientEmails;
    if (Array.isArray(recipientEmails)) {
      recipientEmails.filter((entry) => typeof entry === 'string').forEach((entry) => candidates.push(entry.trim()));
    }
  }

  const metadata = data.metadata as Record<string, unknown> | undefined;
  if (metadata) {
    Object.values(metadata).forEach((value) => addEmail(value));
  }

  const alternativeEmails = data.emails;
  if (Array.isArray(alternativeEmails)) {
    alternativeEmails.filter((entry) => typeof entry === 'string').forEach((entry) => candidates.push(entry.trim()));
  }

  const ownerEmails = collectStrings(data.ownerEmails);
  candidates.push(...ownerEmails);

  return Array.from(new Set(candidates.filter((entry) => entry.length > 3)));
}

function extractDiscordAccounts(data: Record<string, unknown>): string[] {
  const candidates = new Set<string>();
  const add = (value?: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      candidates.add(value.trim());
    }
  };
  add(data.discordId);
  add(data.discordUserId);

  const discord = data.discord as Record<string, unknown> | undefined;
  if (discord) {
    add(discord.id);
    add(discord.userId);
    add(discord.username);
  }

  const metadata = data.metadata as Record<string, unknown> | undefined;
  if (metadata) {
    add(metadata.discordId);
    add(metadata.discord);
  }

  const list = data.discordAccounts;
  if (Array.isArray(list)) {
    list.filter((entry) => typeof entry === 'string').forEach((entry) => add(entry));
  }

  return Array.from(candidates);
}

export function serializeStripeCustomer(doc: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot): StripeCustomerRecord {
  const data = (doc.data() ?? {}) as Record<string, unknown>;
  const subscription = (data.subscription as Record<string, unknown> | undefined) ?? {};
  const email = (data.email ?? data.customerEmail ?? data.billingEmail ?? null) as string | null;
  const emails = extractEmails(data);
  const discordId = (data.discordId ?? data.discordUserId ?? (data.discord as Record<string, unknown> | undefined)?.id ?? null) as
    | string
    | null;
  const discordUserId = (data.discordUserId ?? data.discordId ?? (data.discord as Record<string, unknown> | undefined)?.id ?? null) as
    | string
    | null;
  const status = (data.status ?? data.subscriptionStatus ?? subscription?.status ?? null) as string | null;
  const currentPeriodEnd = (data.currentPeriodEnd ?? data.subscriptionCurrentPeriodEnd ?? subscription?.currentPeriodEnd ?? null) as
    | number
    | null;
  const cancelAtPeriodEnd = (data.cancelAtPeriodEnd ??
    data.subscriptionCancelAtPeriodEnd ??
    subscription?.cancelAtPeriodEnd ??
    subscription?.cancel_at_period_end ??
    null) as boolean | null;
  const entitled = (data.entitled ?? subscription?.entitled ?? null) as boolean | null;
  const productNames = (data.productNames ?? subscription?.productNames ?? []) as string[];
  const priceIds = (data.priceIds ?? subscription?.priceIds ?? []) as string[];

  return {
    id: doc.id,
    email,
    emails,
    discordId,
    discordUserId,
    discordAccounts: extractDiscordAccounts(data),
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    entitled,
    productNames,
    priceIds,
    raw: data,
  };
}

async function findStripeCustomerByField(field: 'discordId' | 'discordUserId' | 'email' | 'customerEmail', value: string) {
  const snapshot = await db
    .collection(STRIPE_CUSTOMERS_COLLECTION)
    .where(field, '==', value)
    .limit(1)
    .get();
  if (snapshot.empty) {
    return null;
  }
  return serializeStripeCustomer(snapshot.docs[0]);
}

export async function findStripeCustomer(params: {
  customerId?: string;
  discordId?: string;
  email?: string;
}): Promise<StripeCustomerRecord | null> {
  if (params.customerId) {
    const doc = await db.collection(STRIPE_CUSTOMERS_COLLECTION).doc(params.customerId).get();
    if (!doc.exists) {
      return null;
    }
    return serializeStripeCustomer(doc);
  }

  const discordId = params.discordId?.trim();
  if (discordId) {
    const byDiscordId = await findStripeCustomerByField('discordId', discordId);
    if (byDiscordId) return byDiscordId;
    const byDiscordUserId = await findStripeCustomerByField('discordUserId', discordId);
    if (byDiscordUserId) return byDiscordUserId;
  }

  const email = params.email?.trim();
  if (email) {
    const byEmail = await findStripeCustomerByField('email', email);
    if (byEmail) return byEmail;
    const byCustomerEmail = await findStripeCustomerByField('customerEmail', email);
    if (byCustomerEmail) return byCustomerEmail;
  }

  return null;
}

export async function listStripeSubscribers(): Promise<StripeCustomerRecord[]> {
  // 既存サブスク利用者が漏れないよう、全件取得してから active/trial/entitled を抽出する
  const snapshot = await db.collection(STRIPE_CUSTOMERS_COLLECTION).limit(1000).get();
  const all = snapshot.docs.map((doc) => serializeStripeCustomer(doc));
  return all.filter((customer) => {
    const status = customer.status ?? '';
    return customer.entitled === true || status === 'active' || status === 'trialing';
  });
}

async function fetchStripeSubscriptionsByStatus(status: 'active' | 'trialing') {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.warn('[billing] STRIPE_SECRET_KEY not set; live subscription lookup skipped');
    return [];
  }

  const params = new URLSearchParams();
  params.set('status', status);
  params.set('limit', '100');
  params.append('expand[]', 'data.customer');

  const response = await fetch(`${STRIPE_API_BASE}/subscriptions?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });

  const payload = (await response.json()) as { data?: any[]; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Stripe API request failed');
  }
  return payload.data ?? [];
}

export async function findActiveStripeSubscriptionByEmail(email: string): Promise<{ subscriptionId: string | null; customerId: string | null; status: string | null }> {
  if (!email) return { subscriptionId: null, customerId: null, status: null };
  const emailLower = email.toLowerCase();

  const matchByEmail = (subs: any[]) => {
    for (const sub of subs) {
      const customer = (sub.customer || {}) as Record<string, unknown>;
      const candidateEmails = [
        (customer.email as string | undefined)?.toLowerCase(),
        (customer.customerEmail as string | undefined)?.toLowerCase(),
        (customer.billingEmail as string | undefined)?.toLowerCase(),
        (sub.customer_email as string | undefined)?.toLowerCase(),
        (sub.billing_email as string | undefined)?.toLowerCase(),
      ].filter(Boolean) as string[];

      if (candidateEmails.includes(emailLower)) {
        const status = String(sub.status ?? '').toLowerCase();
        return {
          subscriptionId: (sub.id as string | undefined) ?? null,
          customerId: (customer.id as string | undefined) ?? null,
          status,
        };
      }
    }
    return null;
  };

  try {
    const [activeSubs, trialSubs] = await Promise.all([
      fetchStripeSubscriptionsByStatus('active'),
      fetchStripeSubscriptionsByStatus('trialing'),
    ]);
    const hit = matchByEmail([...activeSubs, ...trialSubs]);
    if (hit) {
      return hit;
    }
  } catch (error) {
    console.error('[billing] findActiveStripeSubscriptionByEmail failed:', error);
  }

  return { subscriptionId: null, customerId: null, status: null };
}

export async function findOrgBillingByCustomerId(customerId: string): Promise<OrgBillingRecord | null> {
  const snapshot = await db
    .collection(COLLECTION)
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();
  if (snapshot.empty) {
    return null;
  }
  const doc = snapshot.docs[0];
  return {
    orgId: doc.id,
    ...(doc.data() as OrgBillingDoc),
  };
}

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
