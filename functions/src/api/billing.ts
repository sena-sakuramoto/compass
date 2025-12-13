import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';
import type { BillingPlanType } from '../lib/billing';
import { evaluateBillingAccess, getOrgBilling, listOrgBilling, upsertOrgBilling } from '../lib/billing';

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
  const records = await listOrgBilling();
  res.json({ records });
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

export default router;
