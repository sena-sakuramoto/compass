import { Router } from 'express';
import { z } from 'zod';
import { resolveAuthHeader, verifyToken, getStripeEligibilityByEmail } from '../lib/auth';
import {
  findStripeCustomer,
  findActiveStripeSubscriptionByEmail,
  upsertOrgBilling,
  findOrgBillingByCustomerId,
} from '../lib/billing';
import { db } from '../lib/firestore';
import { createUser, getUser } from '../lib/users';

const router = Router();

const createSchema = z.object({
  orgId: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, '小文字英数字とハイフンのみ使用できます'),
  orgName: z.string().min(1).max(200),
});

const orgIdCheckSchema = z.object({
  orgId: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, '小文字英数字とハイフンのみ使用できます'),
});

router.get('/org-setup/org-id-check', async (req, res) => {
  try {
    const { header } = resolveAuthHeader(req as any);
    const token = header?.startsWith('Bearer ') ? header.slice(7) : header;

    console.log('[OrgSetup] Org ID check request received for orgId:', req.query.orgId);
    console.log('[OrgSetup] Has auth header:', !!header);

    const decoded = await verifyToken(token);
    if (!decoded) {
      console.warn('[OrgSetup] Token verification failed for org ID check');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[OrgSetup] Token verified for user:', decoded.email);

    const payload = orgIdCheckSchema.parse({
      orgId: req.query.orgId,
    });

    const existingOrg = await db.collection('orgs').doc(payload.orgId).get();
    console.log('[OrgSetup] Org ID check result for', payload.orgId, '- available:', !existingOrg.exists);
    res.json({ orgId: payload.orgId, available: !existingOrg.exists });
  } catch (error: any) {
    console.error('[OrgSetup] Org ID check failed:', error);
    console.error('[OrgSetup] Error details:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: '入力内容を確認してください（組織IDは小文字英数字とハイフンのみ）',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      });
    }
    res.status(500).json({ error: 'Failed to check organization id' });
  }
});

function isStripeEligible(customer: any): { eligible: boolean; status: string } {
  const subscription = (customer?.raw?.subscription as Record<string, unknown> | undefined) ?? {};
  const status = String(
    subscription.status ??
      subscription.subscriptionStatus ??
      customer?.status ??
      ''
  ).toLowerCase();
  const entitled = subscription.entitled === true || customer?.entitled === true;
  const eligible = entitled || status === 'active' || status === 'trialing';
  return { eligible, status };
}

router.post('/org-setup', async (req, res) => {
  try {
    const { header } = resolveAuthHeader(req as any);
    const token = header?.startsWith('Bearer ') ? header.slice(7) : header;
    const decoded = await verifyToken(token);
    if (!decoded || !decoded.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Stripe契約者か判定（サブスクリプションを優先して確認）
    const liveSubscription = await findActiveStripeSubscriptionByEmail(decoded.email);
    const liveEligible = liveSubscription.status === 'active' || liveSubscription.status === 'trialing';

    const eligibility = await getStripeEligibilityByEmail(decoded.email);
    const eligible = liveEligible || eligibility.eligible;

    if (!eligible) {
      const status = liveSubscription.status ?? eligibility.status ?? null;
      return res.status(403).json({
        error: `Subscription required${status ? ` (${status})` : ''}`,
        code: 'SUBSCRIPTION_REQUIRED',
        status,
      });
    }

    // Firestore側のスナップショットがあれば拾う（任意）
    const customer = await findStripeCustomer({ email: decoded.email });
    const stripeCustomerId = liveSubscription.customerId ?? eligibility.customerId ?? customer?.id ?? null;

    const payload = createSchema.parse(req.body ?? {});

    // 既存チェック
    const existingOrg = await db.collection('orgs').doc(payload.orgId).get();
    if (existingOrg.exists) {
      return res.status(400).json({ error: 'Organization ID already exists', code: 'ORG_ID_EXISTS' });
    }

    // 既に Stripe 顧客が別組織に紐付いていないか確認
    if (stripeCustomerId) {
      const existingBilling = await findOrgBillingByCustomerId(stripeCustomerId);
      if (existingBilling && existingBilling.orgId !== payload.orgId) {
        return res.status(409).json({
          error: 'Stripe customer is already linked to another organization',
          code: 'STRIPE_CUSTOMER_ALREADY_LINKED',
          orgId: existingBilling.orgId,
        });
      }
    } else {
      return res.status(400).json({
        error: 'Stripe customer ID not found. Please contact support.',
        code: 'STRIPE_CUSTOMER_ID_NOT_FOUND',
      });
    }

    // 既存ユーザーを上書きしない（別組織所属ならエラー）
    const existingUser = await getUser(decoded.uid);
    if (existingUser && existingUser.orgId && existingUser.orgId !== payload.orgId) {
      return res.status(409).json({
        error: 'User already belongs to another organization',
        code: 'USER_ALREADY_HAS_ORG',
        orgId: existingUser.orgId,
      });
    }

    // 組織作成
    const orgData = {
      name: payload.orgName,
      ownerId: decoded.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.collection('orgs').doc(payload.orgId).set(orgData);

    // ユーザー作成（admin として所属）
    if (!existingUser) {
      const displayName = decoded.name || decoded.email.split('@')[0] || 'admin';
      await createUser(decoded.uid, {
        email: decoded.email,
        displayName,
        orgId: payload.orgId,
        role: 'admin',
        memberType: 'internal',
        jobTitle: undefined,
        department: undefined,
        phoneNumber: undefined,
        photoURL: undefined,
      });
    }

    // org_billing にStripe紐付けを保存（課金ゲートを即解除するため）
    await upsertOrgBilling(payload.orgId, {
      planType: 'stripe',
      stripeCustomerId,
      subscriptionStatus: liveSubscription.status ?? eligibility.status ?? null,
      subscriptionCancelAtPeriodEnd: undefined,
      subscriptionCurrentPeriodEnd: null,
      entitled: liveEligible || eligibility.eligible || false,
      updatedBy: decoded.uid,
    });

    res.status(201).json({
      orgId: payload.orgId,
      orgName: payload.orgName,
      stripeCustomerId,
    });
  } catch (error: any) {
    console.error('[OrgSetup] Failed to create org from Stripe subscriber:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: '入力内容を確認してください（組織IDは小文字英数字とハイフンのみ）',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      });
      return;
    }
    if (error?.code === 'ORG_ID_EXISTS') {
      res.status(400).json({ error: 'Organization ID already exists', code: 'ORG_ID_EXISTS' });
      return;
    }
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// Stripe契約者かどうかだけ判定する（ユーザー作成はしない）
router.get('/org-setup/eligibility', async (req, res) => {
  try {
    const { header } = resolveAuthHeader(req as any);
    const token = header?.startsWith('Bearer ') ? header.slice(7) : header;
    const decoded = await verifyToken(token);
    if (!decoded || !decoded.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = await getStripeEligibilityByEmail(decoded.email);
    res.json({
      eligible: result.eligible,
      stripeCustomerId: result.customerId ?? null,
      status: result.status ?? null,
    });
  } catch (error: any) {
    console.error('[OrgSetup] Eligibility check failed:', error);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

export default router;
