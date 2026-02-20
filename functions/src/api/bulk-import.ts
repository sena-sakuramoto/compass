import { Router, Request, Response } from 'express';
import { authMiddleware } from '../lib/auth';

const router = Router();

router.use(authMiddleware());

// POST /bulk-import/parse — parse uploaded file and return preview data
router.post('/bulk-import/parse', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not Implemented' });
});

// POST /bulk-import/save — save parsed/confirmed bulk-import data
router.post('/bulk-import/save', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not Implemented' });
});

export default router;
