import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { listSchedule } from '../lib/firestore';

const router = Router();

router.use(authMiddleware());

const querySchema = z.object({
  view: z.enum(['people', 'projects']).optional().default('projects'),
  from: z.string().optional(),
  to: z.string().optional(),
});

router.get('/', async (req, res) => {
  const params = querySchema.parse(req.query);
  const items = await listSchedule(params);
  res.json({ items });
});

export default router;
