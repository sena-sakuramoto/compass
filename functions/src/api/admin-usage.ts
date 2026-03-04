import { Router } from 'express';
import { z } from 'zod';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';

const router = Router();
const db = getFirestore();

router.use(authMiddleware({ skipBillingCheck: true }));

const usageEventTypeSchema = z.enum([
  'admin_page_view',
  'billing_update',
  'org_invitation_create',
  'organization_create',
  'member_role_update',
  'stripe_sync',
]);

const usageEventPayloadSchema = z.object({
  eventType: usageEventTypeSchema,
});

type UsageEventType = z.infer<typeof usageEventTypeSchema>;

interface AdminUsageSummary {
  computedAt: string;
  organizationsTotal: number;
  usersTotal: number;
  activeUsers: number;
  usersLoggedIn7d: number;
  usersLoggedIn30d: number;
  tasksUpdated7d: number;
  tasksUpdated30d: number;
  adminEventsToday: number;
  adminEvents7d: number;
  adminEventBreakdownToday: Record<string, number>;
}

const SUMMARY_DOC_PATH = 'adminUsageSummary/current';
const DAILY_COLLECTION = 'adminUsageDaily';

function formatDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayKeysBack(days: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(formatDayKey(d));
  }
  return keys;
}

function asRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'number') result[k] = v;
  }
  return result;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

async function computeUsageSummary(): Promise<AdminUsageSummary> {
  const now = new Date();
  const sevenDaysAgo = Timestamp.fromDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const thirtyDaysAgo = Timestamp.fromDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

  const [
    orgsAgg,
    usersAgg,
    activeUsersAgg,
    login7Agg,
    login30Agg,
    tasksUpdated7Agg,
    tasksUpdated30Agg,
  ] = await Promise.all([
    db.collection('orgs').count().get(),
    db.collection('users').count().get(),
    db.collection('users').where('isActive', '==', true).count().get(),
    db.collection('users').where('lastLoginAt', '>=', sevenDaysAgo).count().get(),
    db.collection('users').where('lastLoginAt', '>=', thirtyDaysAgo).count().get(),
    db.collectionGroup('tasks').where('updatedAt', '>=', sevenDaysAgo).count().get(),
    db.collectionGroup('tasks').where('updatedAt', '>=', thirtyDaysAgo).count().get(),
  ]);

  const todayKey = formatDayKey(now);
  const keys7d = dayKeysBack(7);
  const dailyDocs = await db.getAll(
    ...keys7d.map((key) => db.collection(DAILY_COLLECTION).doc(key))
  );

  let adminEvents7d = 0;
  let adminEventsToday = 0;
  let adminEventBreakdownToday: Record<string, number> = {};

  for (const doc of dailyDocs) {
    if (!doc.exists) continue;
    const data = doc.data() ?? {};
    const events = asRecord((data as Record<string, unknown>).events);
    const total = toNumber(events.total);
    adminEvents7d += total;

    if (doc.id === todayKey) {
      adminEventsToday = total;
      adminEventBreakdownToday = Object.entries(events).reduce<Record<string, number>>((acc, [key, value]) => {
        if (key === 'total') return acc;
        acc[key] = value;
        return acc;
      }, {});
    }
  }

  return {
    computedAt: now.toISOString(),
    organizationsTotal: orgsAgg.data().count,
    usersTotal: usersAgg.data().count,
    activeUsers: activeUsersAgg.data().count,
    usersLoggedIn7d: login7Agg.data().count,
    usersLoggedIn30d: login30Agg.data().count,
    tasksUpdated7d: tasksUpdated7Agg.data().count,
    tasksUpdated30d: tasksUpdated30Agg.data().count,
    adminEventsToday,
    adminEvents7d,
    adminEventBreakdownToday,
  };
}

function isSummaryFresh(summary: Partial<AdminUsageSummary> | null | undefined): boolean {
  if (!summary?.computedAt || typeof summary.computedAt !== 'string') return false;
  const computedAtMs = Date.parse(summary.computedAt);
  if (!Number.isFinite(computedAtMs)) return false;
  return Date.now() - computedAtMs <= 30 * 60 * 1000;
}

async function requireSuperAdmin(req: any, res: any): Promise<{ ok: true } | { ok: false }> {
  const user = await getUser(req.uid);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return { ok: false };
  }
  if (user.role !== 'super_admin') {
    res.status(403).json({ error: 'Forbidden: super_admin only' });
    return { ok: false };
  }
  return { ok: true };
}

router.get('/usage-summary', async (req: any, res, next) => {
  try {
    const auth = await requireSuperAdmin(req, res);
    if (!auth.ok) return;

    const refresh = String(req.query.refresh ?? '').toLowerCase() === 'true';
    const summaryRef = db.doc(SUMMARY_DOC_PATH);
    const summaryDoc = await summaryRef.get();
    const cached = summaryDoc.exists ? (summaryDoc.data() as Partial<AdminUsageSummary>) : null;

    if (!refresh && isSummaryFresh(cached)) {
      return res.json({ summary: cached, refreshed: false });
    }

    const summary = await computeUsageSummary();
    await summaryRef.set(
      {
        ...summary,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ summary, refreshed: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/usage-events', async (req: any, res, next) => {
  try {
    const auth = await requireSuperAdmin(req, res);
    if (!auth.ok) return;

    const payload = usageEventPayloadSchema.parse(req.body ?? {});
    const eventType: UsageEventType = payload.eventType;
    const dayKey = formatDayKey(new Date());
    const dailyRef = db.collection(DAILY_COLLECTION).doc(dayKey);

    await dailyRef.set(
      {
        date: dayKey,
        [`events.${eventType}`]: FieldValue.increment(1),
        'events.total': FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: error.errors,
      });
    }
    return next(error);
  }
});

export default router;
