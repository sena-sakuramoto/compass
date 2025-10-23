import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { listPeople, createPerson, PersonInput } from '../lib/firestore';
import { getUser } from '../lib/users';

const router = Router();

router.use(authMiddleware());

router.get('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const people = await listPeople(user.orgId);
    res.json({ people });
  } catch (error) {
    next(error);
  }
});

const personSchema = z.object({
  氏名: z.string().min(1),
  役割: z.string().optional(),
  メール: z.string().email().optional(),
  電話: z.string().optional(),
  '稼働時間/日(h)': z.number().optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const payload = personSchema.parse(req.body) as PersonInput;
    const id = await createPerson(payload);
    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

export default router;
