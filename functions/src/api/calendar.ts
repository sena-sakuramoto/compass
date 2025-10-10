import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { enqueueCalendarSync } from '../lib/jobs';

const router = Router();

router.use(authMiddleware());

const syncSchema = z.object({
  taskId: z.string().min(1),
  mode: z.enum(['push', 'sync']).optional().default('push'),
});

router.post('/sync', async (req, res) => {
  const { taskId, mode } = syncSchema.parse(req.body ?? {});
  await enqueueCalendarSync({ taskId, mode });
  res.json({ ok: true });
});

export default router;
