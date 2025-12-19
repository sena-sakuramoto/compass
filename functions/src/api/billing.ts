import { Router } from 'express';
import { z } from 'zod';
import type { Timestamp } from 'firebase-admin/firestore';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';
import type { BillingPlanType } from '../lib/billing';
import {
  DEFAULT_PLAN,
  type OrgBillingRecord,
  evaluateBillingAccess,
  getOrgBilling,
  listOrgBilling,
  upsertOrgBilling,
  findStripeCustomer,
  findOrgBillingByCustomerId,
  listStripeSubscribers,
  type StripeCustomerRecord,
  serializeStripeCustomer,
} from '../lib/billing';
import { db } from '../lib/firestore';
import { sendEmail } from '../lib/gmail';

const router = Router();

router.use(authMiddleware({ skipBillingCheck: true }));

router.get('/billing/access', async (req: any, res) => {
  const user = await getUser(req.uid);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  const billingDoc = await getOrgBilling(user.orgId);
  const result = evaluateBillingAccess(user, billingDoc);
  res.json({
    allowed: result.allowed,
    reason: result.reason,
    planType: result.planType,
    subscriptionStatus: billingDoc?.subscriptionStatus ?? null,
    stripeCustomerId: billingDoc?.stripeCustomerId ?? null,
    notes: billingDoc?.notes ?? null,
    entitled: billingDoc?.entitled ?? null,
    lastStripeSyncAt: billingDoc?.lastStripeSyncAt ?? null,
    details: result.details ?? null,
  });
});

router.get('/billing', async (req: any, res) => {
  const user = await getUser(req.uid);
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  type OrgBillingAdminRecord = OrgBillingRecord & {
    orgName?: string | null;
    hasBillingRecord?: boolean;
  };
  type StripeCustomerAdminRecord = StripeCustomerRecord & {
    linkedOrgId?: string | null;
    linkedOrgName?: string | null;
    billingRecord?: OrgBillingRecord | null;
  };

  const [orgSnapshot, billingRecords, stripeSubscribers] = await Promise.all([
    db.collection('orgs').get(),
    listOrgBilling(),
    listStripeSubscribers(),
  ]);
  const billingMap = new Map<string, OrgBillingRecord>(billingRecords.map((record) => [record.orgId, record]));
  const orgNameMap = new Map<string, string | null>(
    orgSnapshot.docs.map((orgDoc) => {
      const data = (orgDoc.data() ?? {}) as Record<string, unknown>;
      return [orgDoc.id, (data.name as string | undefined) ?? null];
    })
  );

  const records: OrgBillingAdminRecord[] = orgSnapshot.docs.map((orgDoc) => {
    const data = (orgDoc.data() ?? {}) as Record<string, unknown>;
    const billing = billingMap.get(orgDoc.id);
    const base: OrgBillingRecord =
      billing ??
      ({
        orgId: orgDoc.id,
        planType: DEFAULT_PLAN,
      } as OrgBillingRecord);
    const planType = billing?.planType ?? DEFAULT_PLAN;

    return {
      ...base,
      orgId: orgDoc.id,
      planType,
      orgName: (data.name as string | undefined) ?? null,
      hasBillingRecord: Boolean(billing),
    };
  });

  const orgIdSet = new Set(orgSnapshot.docs.map((doc) => doc.id));
  billingRecords.forEach((record) => {
    if (!orgIdSet.has(record.orgId)) {
      records.push({
        ...record,
        orgName: null,
        hasBillingRecord: true,
      });
    }
  });

  records.sort((a, b) => {
    const labelA = (a.orgName || a.orgId).toLowerCase();
    const labelB = (b.orgName || b.orgId).toLowerCase();
    return labelA.localeCompare(labelB, 'ja');
  });

  const billingByCustomerId = new Map<string, OrgBillingRecord>();
  billingRecords.forEach((record) => {
    if (record.stripeCustomerId) {
      billingByCustomerId.set(record.stripeCustomerId, record);
    }
  });

  const stripeCustomers: StripeCustomerAdminRecord[] = stripeSubscribers.map((customer) => {
    const billingRecord = billingByCustomerId.get(customer.id) ?? null;
    const linkedOrgId = billingRecord?.orgId ?? null;
    const linkedOrgName = linkedOrgId ? orgNameMap.get(linkedOrgId) ?? linkedOrgId : null;
    return {
      ...customer,
      linkedOrgId,
      linkedOrgName,
      billingRecord,
    };
  });

  stripeCustomers.sort((a, b) => {
    const labelA = (a.email || a.emails[0] || a.id).toLowerCase();
    const labelB = (b.email || b.emails[0] || b.id).toLowerCase();
    return labelA.localeCompare(labelB, 'ja');
  });

  res.json({ records, stripeCustomers });
});

router.get('/billing/stripe-live/subscriptions', async (req: any, res) => {
  const user = await getUser(req.uid);
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured' });
  }

  const fetchStripeSubscriptions = async (status: 'active' | 'trialing') => {
    const params = new URLSearchParams();
    params.set('status', status);
    params.set('limit', '100');
    params.append('expand[]', 'data.customer');

    const response = await fetch(`https://api.stripe.com/v1/subscriptions?${params.toString()}`, {
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
  };

  try {
    const [activeSubs, trialSubs] = await Promise.all([
      fetchStripeSubscriptions('active'),
      fetchStripeSubscriptions('trialing'),
    ]);

    type StripeLiveSubscription = {
      id: string;
      status: string;
      currentPeriodEnd: number | null;
      cancelAtPeriodEnd: boolean | null;
      customer: {
        id: string;
        email?: string | null;
        name?: string | null;
        description?: string | null;
      };
      productNames: string[];
      priceIds: string[];
    };

    const mapSub = (sub: any): StripeLiveSubscription => {
      const customer = (sub.customer || {}) as Record<string, unknown>;
      const items = Array.isArray(sub.items?.data) ? sub.items.data : [];
      const productNames: string[] = [];
      const priceIds: string[] = [];
      items.forEach((item: any) => {
        const price = item.price || {};
        if (price.id) priceIds.push(String(price.id));
        const productValue = price.product as { name?: string; id?: string } | string | undefined;
        const productName =
          typeof productValue === 'string'
            ? productValue
            : productValue?.name ?? productValue?.id ?? (price.nickname as string | undefined) ?? null;
        if (productName) productNames.push(productName);
      });

      return {
        id: String(sub.id),
        status: String(sub.status || 'unknown'),
        currentPeriodEnd: typeof sub.current_period_end === 'number' ? sub.current_period_end * 1000 : null,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end ?? sub.cancel_at ?? false),
        customer: {
          id: String(customer.id || ''),
          email: (customer.email as string | undefined) ?? null,
          name: (customer.name as string | undefined) ?? null,
          description: (customer.description as string | undefined) ?? null,
        },
        productNames,
        priceIds,
      };
    };

    const mergedMap = new Map<string, StripeLiveSubscription>();
    [...activeSubs, ...trialSubs].forEach((entry) => {
      const mapped = mapSub(entry);
      mergedMap.set(mapped.id, mapped);
    });

    const subscriptions = Array.from(mergedMap.values()).sort((a, b) => {
      const emailA = a.customer.email || '';
      const emailB = b.customer.email || '';
      return emailA.localeCompare(emailB);
    });
    res.json({ subscriptions });
  } catch (error: any) {
    console.error('[billing] Failed to fetch live subscriptions', error);
    res.status(502).json({ error: error?.message || 'Failed to fetch Stripe subscriptions' });
  }
});

router.get('/billing/orgs/:orgId', async (req: any, res) => {
  const user = await getUser(req.uid);
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const billingDoc = await getOrgBilling(req.params.orgId);
  if (!billingDoc) {
    return res.status(404).json({ error: 'Billing info not found' });
  }
  res.json(billingDoc);
});

const updateSchema = z.object({
  planType: z.enum(['stripe', 'enterprise_manual', 'special_admin', 'inactive']).optional(),
  stripeCustomerId: z.string().min(3).max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const sendWelcomeSchema = z.object({
  resend: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const selfLookupSchema = z.object({
  customerId: z.string().min(3).max(200),
  discordId: z.string().min(3).max(200).optional(),
  email: z.string().email().optional(),
});

router.patch('/billing/orgs/:orgId', async (req: any, res) => {
  const user = await getUser(req.uid);
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const payload = updateSchema.parse(req.body);
  const planType: BillingPlanType | undefined = payload.planType;

  if (planType === 'stripe' && !payload.stripeCustomerId) {
    return res.status(400).json({ error: 'stripeCustomerId is required when planType is stripe' });
  }

  await upsertOrgBilling(req.params.orgId, {
    planType: planType,
    stripeCustomerId: payload.stripeCustomerId ?? null,
    notes: payload.notes ?? null,
    updatedBy: user.id,
  });

  const updated = await getOrgBilling(req.params.orgId);
  res.json(updated);
});

router.post('/billing/stripe-customers/send-welcome', async (req: any, res) => {
  const user = await getUser(req.uid);
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { resend = false, limit = 50 } = sendWelcomeSchema.parse(req.body ?? {});
  const appUrl = process.env.ORG_SETUP_URL || process.env.APP_URL || 'https://compass-31e9e.web.app';
  const sender = process.env.NOTIFICATION_SENDER || 'no-reply@archi-prisma.co.jp';
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured' });
  }

  const fetchStripeSubscriptions = async (status: 'active' | 'trialing') => {
    const params = new URLSearchParams();
    params.set('status', status);
    params.set('limit', '100');
    params.append('expand[]', 'data.customer');

    const response = await fetch(`https://api.stripe.com/v1/subscriptions?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
      },
    });

    const payload = (await response.json()) as { data?: any[]; error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Stripe API request failed');
    }
    return payload.data ?? [];
  };

  const collectEmailsFromSubscription = (sub: any): string[] => {
    const emails = new Set<string>();
    const add = (value?: unknown) => {
      if (typeof value === 'string' && value.includes('@')) {
        emails.add(value.trim());
      }
    };

    // subscription-level
    add(sub.customer_email);
    add(sub.billing_email);

    // customer object (expanded)
    const customer = (sub.customer || {}) as Record<string, unknown>;
    add(customer.email);
    add(customer.customerEmail);
    add(customer.billingEmail);

    // invoice settings
    const invoiceSettings = customer.invoice_settings as Record<string, unknown> | undefined;
    add(invoiceSettings?.email);
    const recipientEmails = invoiceSettings?.recipient_emails;
    if (Array.isArray(recipientEmails)) {
      recipientEmails.filter((v) => typeof v === 'string').forEach((v) => emails.add(v.trim()));
    }

    // metadata fallbacks
    const metadata = (customer.metadata as Record<string, unknown> | undefined) ?? {};
    Object.values(metadata).forEach((v) => add(v));

    return Array.from(emails).slice(0, 3);
  };

  const [activeSubs, trialSubs] = await Promise.all([
    fetchStripeSubscriptions('active'),
    fetchStripeSubscriptions('trialing'),
  ]);

  type StripeSubCandidate = {
    customerId: string;
    status: string;
    entitled: boolean;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean | null;
    recipients: string[];
  };

  const candidateMap = new Map<string, StripeSubCandidate>();
  const pushCandidate = (sub: any) => {
    const customer = sub.customer as any;
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    if (!customerId) return;
    if (candidateMap.has(customerId)) return; // 既に追加済み

    const recipients = collectEmailsFromSubscription(sub);
    const status = String(sub.status ?? '').toLowerCase();
    const entitled = sub.entitled === true || sub.metadata?.entitled === true;
    const candidate: StripeSubCandidate = {
      customerId,
      status,
      entitled,
      currentPeriodEnd: sub.current_period_end ?? null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? null,
      recipients,
    };
    candidateMap.set(customerId, candidate);
  };

  activeSubs.forEach(pushCandidate);
  trialSubs.forEach(pushCandidate);

  const candidates = Array.from(candidateMap.values()).filter(
    (entry) => entry.entitled || entry.status === 'active' || entry.status === 'trialing'
  );

  // 既送信チェックのために Firestore の welcomeEmailSentAt をまとめて取得
  const docRefs = candidates.map((c) => db.collection('stripe_customers').doc(c.customerId));
  const docs = docRefs.length > 0 ? await db.getAll(...docRefs) : [];
  const docMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  docs.forEach((doc) => docMap.set(doc.id, doc));

  const results = {
    totalCandidates: candidates.length,
    attempted: 0,
    sent: 0,
    skippedNoEmail: 0,
    skippedAlreadySent: 0,
    failures: [] as { customerId: string; reason: string }[],
  };

  for (const customer of candidates.slice(0, limit)) {
    const doc = docMap.get(customer.customerId);
    const alreadySent = Boolean((doc?.data() as Record<string, unknown> | undefined)?.welcomeEmailSentAt);
    if (alreadySent && !resend) {
      results.skippedAlreadySent += 1;
      continue;
    }

    const recipients = Array.from(new Set(customer.recipients)).slice(0, 3);

    if (recipients.length === 0) {
      results.skippedNoEmail += 1;
      continue;
    }

    const subject = '[Compass] ご招待 - 初期設定のご案内';
    const body = `
ご担当者様

平素よりお世話になっております。AI×建築サークル 代表の櫻本聖成です。
このたびはCompassにご入会いただき、誠にありがとうございます。本メールはご入会後の初期設定のご案内としてお送りしています。

コンパスの組織を作成し、利用を開始するには、以下のURLからサインインし管理者画面（管理ツール）で組織を作成してください。
${appUrl}

サインインは本メールの宛先アドレスでお願いします。Stripe Customer ID は下記です。
 Stripe Customer ID: ${customer.customerId}

すでに組織がある場合は、管理者ツール > 課金で上記Customer IDを登録してください。
ご不明点は compass@archi-prisma.co.jp までご連絡ください。

※このメールは自動送信されています。`;

    try {
      results.attempted += 1;
      for (const to of recipients) {
        await sendEmail({ from: sender, to, subject, body });
      }
      await db.collection('stripe_customers').doc(customer.customerId).set(
        {
          email: recipients[0] ?? null,
          status: customer.status,
          currentPeriodEnd: customer.currentPeriodEnd,
          cancelAtPeriodEnd: customer.cancelAtPeriodEnd,
          subscription: {
            status: customer.status,
            currentPeriodEnd: customer.currentPeriodEnd,
            cancelAtPeriodEnd: customer.cancelAtPeriodEnd,
          },
          welcomeEmailSentAt: Date.now(),
        },
        { merge: true }
      );
      results.sent += 1;
    } catch (error: any) {
      console.error('[billing] Failed to send bulk welcome email', { customerId: customer.customerId, error });
      results.failures.push({ customerId: customer.customerId, reason: error?.message || 'unknown error' });
    }
  }

  res.json(results);
});

router.get('/billing/stripe-customers/search', async (req: any, res) => {
  const user = await getUser(req.uid);
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { customerId, discordId, email } = req.query as {
    customerId?: string;
    discordId?: string;
    email?: string;
  };

  if (!customerId && !discordId && !email) {
    return res.status(400).json({ error: 'At least one identifier (customerId, discordId, email) is required' });
  }

  const stripeCustomer = await findStripeCustomer({
    customerId,
    discordId,
    email,
  });

  if (!stripeCustomer) {
    return res.status(404).json({ error: 'Stripe customer not found' });
  }

  const billingRecord = await findOrgBillingByCustomerId(stripeCustomer.id);
  let organization: Record<string, unknown> | null = null;
  if (billingRecord) {
    const orgDoc = await db.collection('orgs').doc(billingRecord.orgId).get();
    if (orgDoc.exists) {
      organization = { id: orgDoc.id, ...(orgDoc.data() as Record<string, unknown>) };
    }
  }

  interface UserSummary {
    id: string;
    email: string;
    orgId: string;
    role?: string;
    displayName?: string;
    isActive?: boolean;
    memberType?: string;
    lastLoginAt?: Timestamp | null;
  }

  const matchingUsers: UserSummary[] = [];
  const emailCandidates = stripeCustomer.emails.length
    ? stripeCustomer.emails
    : stripeCustomer.email
      ? [stripeCustomer.email]
      : [];

  if (emailCandidates.length) {
    const chunkSize = 10;
    for (let i = 0; i < emailCandidates.length; i += chunkSize) {
      const chunk = emailCandidates.slice(i, i + chunkSize);
      const snapshot = await db.collection('users').where('email', 'in', chunk).get();
      snapshot.docs.forEach((doc) => {
        const data = doc.data() as Record<string, unknown>;
        matchingUsers.push({
          id: doc.id,
          email: (data.email as string) ?? '',
          orgId: (data.orgId as string) ?? '',
          role: data.role as string | undefined,
          displayName: data.displayName as string | undefined,
          isActive: data.isActive as boolean | undefined,
          memberType: data.memberType as string | undefined,
          lastLoginAt: (data.lastLoginAt as FirebaseFirestore.Timestamp | undefined) ?? null,
        });
      });
    }
  }

  res.json({
    stripeCustomer,
    billingRecord,
    organization,
    matchingUsers,
  });
});

router.post('/billing/self-lookup', async (req: any, res) => {
  const user = await getUser(req.uid);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const payload = selfLookupSchema.parse(req.body ?? {});

  const stripeCustomer = await findStripeCustomer({
    customerId: payload.customerId,
    discordId: payload.discordId,
    email: payload.email,
  });

  if (!stripeCustomer) {
    return res.status(404).json({ error: 'Stripe customer not found' });
  }

  const billingRecord = await findOrgBillingByCustomerId(stripeCustomer.id);
  if (billingRecord && billingRecord.orgId !== user.orgId) {
    return res.status(403).json({ error: 'この Customer ID は別の組織に紐付いています。管理者へお問い合わせください。' });
  }

  res.json({
    stripeCustomer,
    billingRecord: billingRecord
      ? {
          orgId: billingRecord.orgId,
          planType: billingRecord.planType,
          subscriptionStatus: billingRecord.subscriptionStatus ?? null,
        }
      : null,
  });
});

router.post('/billing/portal-session', async (req: any, res) => {
  const user = await getUser(req.uid);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const billingDoc = await getOrgBilling(user.orgId);
  if (!billingDoc || billingDoc.planType !== 'stripe' || !billingDoc.stripeCustomerId) {
    return res.status(400).json({ error: 'Stripeサブスクの顧客情報が見つかりません。管理者にお問い合わせください。' });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error('[billing] STRIPE_SECRET_KEY is not configured');
    return res.status(500).json({ error: 'Stripe設定が未完了です。' });
  }

  const returnUrl =
    (req.body?.returnUrl as string | undefined) ??
    process.env.BILLING_PORTAL_RETURN_URL ??
    process.env.APP_URL ??
    'https://compass-31e9e.web.app';
  const configurationId = process.env.STRIPE_PORTAL_CONFIGURATION_ID;

  const params = new URLSearchParams();
  params.set('customer', billingDoc.stripeCustomerId);
  if (returnUrl) {
    params.set('return_url', returnUrl);
  }
  if (configurationId) {
    params.set('configuration', configurationId);
  }

  try {
    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    const payload = (await response.json()) as { url?: string; error?: { message?: string } };
    if (!response.ok || !payload.url) {
      console.error('[billing] Failed to create portal session', payload);
      return res.status(502).json({ error: payload?.error?.message ?? 'Stripeポータルの作成に失敗しました。' });
    }
    res.json({ url: payload.url });
  } catch (error) {
    console.error('[billing] Stripe portal request failed', error);
    res.status(502).json({ error: 'Stripeポータルへの接続に失敗しました。' });
  }
});

export default router;
