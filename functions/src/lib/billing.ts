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
  // 席数管理
  seatLimit?: number | null;           // 契約席数（Stripeのquantityから同期、またはサークル特典）
  isCircleMember?: boolean | null;     // サークル会員かどうか
  circleBaseSeats?: number | null;     // サークル特典の基本席数（デフォルト3）
  additionalSeats?: number | null;     // 追加購入席数（Stripeのquantity）
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

async function findStripeCustomerByField(
  field: 'discordId' | 'discordUserId' | 'email' | 'customerEmail' | 'billingEmail',
  value: string
) {
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

async function findStripeCustomerByArrayField(field: 'emails', value: string) {
  const snapshot = await db
    .collection(STRIPE_CUSTOMERS_COLLECTION)
    .where(field, 'array-contains', value)
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
    const byBillingEmail = await findStripeCustomerByField('billingEmail', email);
    if (byBillingEmail) return byBillingEmail;
    const byEmails = await findStripeCustomerByArrayField('emails', email);
    if (byEmails) return byEmails;
  }

  return null;
}

export async function listStripeSubscribers(): Promise<StripeCustomerRecord[]> {
  // 既存サブスク利用者が漏れないよう、全件取得してから active/trial/entitled を抽出する
  const all: StripeCustomerRecord[] = [];
  const pageSize = 1000;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    let query = db.collection(STRIPE_CUSTOMERS_COLLECTION).limit(pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snapshot = await query.get();
    if (snapshot.empty) break;
    all.push(...snapshot.docs.map((doc) => serializeStripeCustomer(doc)));
    if (snapshot.size < pageSize) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }
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

  const all: any[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const params = new URLSearchParams();
    params.set('status', status);
    params.set('limit', '100');
    params.append('expand[]', 'data.customer');
    if (startingAfter) {
      params.set('starting_after', startingAfter);
    }

    const response = await fetch(`${STRIPE_API_BASE}/subscriptions?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    });

    const payload = (await response.json()) as { data?: any[]; has_more?: boolean; error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Stripe API request failed');
    }

    const data = payload.data ?? [];
    all.push(...data);
    if (!payload.has_more || data.length === 0) {
      hasMore = false;
      break;
    }
    const lastId = data[data.length - 1]?.id;
    if (!lastId) {
      hasMore = false;
      break;
    }
    startingAfter = String(lastId);
  }

  return all;
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
  // トライアル終了・閲覧のみモード用
  trialExpired?: boolean;
  readOnlyMode?: boolean;
  canEdit?: boolean;
}

// サークル会員の基本席数
export const CIRCLE_BASE_SEATS = 3;

// サークル商品名のパターン（部分一致）
const CIRCLE_PRODUCT_PATTERNS = [
  'サークル',
  'circle',
  'Circle',
  'AI×建築',
];

/**
 * サークル会員かどうかを判定
 */
export function isCircleMember(billingDoc: OrgBillingDoc | null): boolean {
  if (!billingDoc) return false;

  // 明示的にisCircleMemberが設定されている場合はそれを使用
  if (billingDoc.isCircleMember !== null && billingDoc.isCircleMember !== undefined) {
    return billingDoc.isCircleMember;
  }

  // productNamesからサークル商品を検出
  const productNames = billingDoc.stripeSnapshot?.productNames || [];
  return productNames.some(name =>
    CIRCLE_PRODUCT_PATTERNS.some(pattern => name.includes(pattern))
  );
}

/**
 * 組織の席数上限を取得
 * 優先順位：
 * 1. 明示的に設定されたseatLimit
 * 2. サークル会員の場合: circleBaseSeats + additionalSeats
 * 3. Stripe課金の場合: additionalSeats（quantity）
 * 4. デフォルト: null（member-limits.tsのプラン上限を使用）
 */
export function getSeatLimit(billingDoc: OrgBillingDoc | null): number | null {
  if (!billingDoc) return null;

  // 明示的にseatLimitが設定されている場合
  if (billingDoc.seatLimit !== null && billingDoc.seatLimit !== undefined) {
    return billingDoc.seatLimit;
  }

  // サークル会員の場合
  if (isCircleMember(billingDoc)) {
    const baseSeats = billingDoc.circleBaseSeats ?? CIRCLE_BASE_SEATS;
    const additionalSeats = billingDoc.additionalSeats ?? 0;
    return baseSeats + additionalSeats;
  }

  // Stripe課金でquantityがある場合
  if (billingDoc.additionalSeats !== null && billingDoc.additionalSeats !== undefined) {
    return billingDoc.additionalSeats;
  }

  return null;
}

/**
 * 席数情報を取得（APIレスポンス用）
 */
export interface SeatInfo {
  seatLimit: number | null;
  isCircleMember: boolean;
  circleBaseSeats: number;
  additionalSeats: number;
  source: 'explicit' | 'circle' | 'stripe' | 'plan_default';
}

export function getSeatInfo(billingDoc: OrgBillingDoc | null): SeatInfo {
  if (!billingDoc) {
    return {
      seatLimit: null,
      isCircleMember: false,
      circleBaseSeats: CIRCLE_BASE_SEATS,
      additionalSeats: 0,
      source: 'plan_default',
    };
  }

  const isCircle = isCircleMember(billingDoc);
  const baseSeats = billingDoc.circleBaseSeats ?? CIRCLE_BASE_SEATS;
  const additional = billingDoc.additionalSeats ?? 0;

  // 明示的にseatLimitが設定されている場合
  if (billingDoc.seatLimit !== null && billingDoc.seatLimit !== undefined) {
    return {
      seatLimit: billingDoc.seatLimit,
      isCircleMember: isCircle,
      circleBaseSeats: baseSeats,
      additionalSeats: additional,
      source: 'explicit',
    };
  }

  // サークル会員の場合
  if (isCircle) {
    return {
      seatLimit: baseSeats + additional,
      isCircleMember: true,
      circleBaseSeats: baseSeats,
      additionalSeats: additional,
      source: 'circle',
    };
  }

  // Stripe課金でquantityがある場合
  if (additional > 0) {
    return {
      seatLimit: additional,
      isCircleMember: false,
      circleBaseSeats: baseSeats,
      additionalSeats: additional,
      source: 'stripe',
    };
  }

  return {
    seatLimit: null,
    isCircleMember: false,
    circleBaseSeats: baseSeats,
    additionalSeats: 0,
    source: 'plan_default',
  };
}

export function evaluateBillingAccess(user: User, billingDoc: OrgBillingDoc | null): BillingAccessResult {
  console.log('[Billing] Evaluating access for user:', {
    userId: user.id,
    email: user.email,
    orgId: user.orgId,
    role: user.role,
  });

  if (user.role === 'super_admin') {
    console.log('[Billing] Allowed: super_admin override');
    return {
      allowed: true,
      reason: 'super_admin_override',
      planType: billingDoc?.planType ?? DEFAULT_PLAN,
    };
  }

  // 特別枠組織: archi-prisma（既存ユーザーと招待されたユーザー）
  const SPECIAL_ORGS = ['archi-prisma'];
  if (SPECIAL_ORGS.includes(user.orgId)) {
    console.log('[Billing] Allowed: legacy organization -', user.orgId);
    return {
      allowed: true,
      reason: 'legacy_organization',
      planType: billingDoc?.planType ?? 'special_admin',
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

  // キャンセル済み・未払い・延滞の場合は明示的に拒否
  if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
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

  // entitled が明示的に true、または active/trialing の場合のみ許可
  if (entitled === true || status === 'active' || status === 'trialing') {
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
