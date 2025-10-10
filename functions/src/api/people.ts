import { Router } from 'express';
import { authMiddleware } from '../lib/auth';
import { listPeople } from '../lib/firestore';

const router = Router();

router.use(authMiddleware());

router.get('/', async (_req, res) => {
  const people = await listPeople();
  res.json({ people });
});

export default router;
