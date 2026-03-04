import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { enqueueCalendarSync, enqueueInboundCalendarSync } from '../lib/jobs';
import { getUser } from '../lib/users';
import { getEffectiveOrgId } from '../lib/access-helpers';

const router = Router();

router.use(authMiddleware());

const syncSchema = z.object({
  taskId: z.string().min(1),
  mode: z.enum(['push', 'sync']).optional(),
});

router.post('/sync', async (req: any, res, next) => {
  try {
    const { taskId, mode } = syncSchema.parse(req.body ?? {});
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const orgId = getEffectiveOrgId(user);
    await enqueueCalendarSync({ taskId, mode: mode ?? 'sync', userId: req.uid, orgId });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const deleteSchema = z.object({
  taskId: z.string().min(1),
});

router.post('/delete', async (req: any, res, next) => {
  try {
    const { taskId } = deleteSchema.parse(req.body ?? {});
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const orgId = getEffectiveOrgId(user);
    await enqueueCalendarSync({ taskId, mode: 'delete', userId: req.uid, orgId });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/calendar/inbound-sync
 * Google Calendar -> Compass のインバウンド同期を手動トリガー
 */
router.post('/inbound-sync', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const orgId = getEffectiveOrgId(user);
    await enqueueInboundCalendarSync({ userId: req.uid, orgId });
    res.json({ ok: true, queued: true, message: 'Inbound同期ジョブをキューに追加しました（最大1分で反映）' });
  } catch (error) {
    next(error);
  }
});

export default router;
