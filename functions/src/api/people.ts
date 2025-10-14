import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { listPeople, createPerson, PersonInput } from '../lib/firestore';

const router = Router();

router.use(authMiddleware());

router.get('/', async (_req, res, next) => {
  try {
    const people = await listPeople();
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
