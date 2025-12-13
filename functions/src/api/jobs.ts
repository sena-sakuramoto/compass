import { Router } from 'express';
import { authMiddleware } from '../lib/auth';
import { processPendingJobs } from '../lib/jobProcessor';

const router = Router();

router.use(authMiddleware());

router.post('/run', async (_req, res) => {
  const result = await processPendingJobs();
  res.json({ ok: true, ...result });
});

export default router;
