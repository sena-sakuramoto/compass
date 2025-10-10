import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { createProject, listProjects, ProjectInput } from '../lib/firestore';

const router = Router();

router.use(authMiddleware());

router.get('/', async (_req, res) => {
  const projects = await listProjects();
  res.json({ projects });
});

const projectSchema = z.object({
  物件名: z.string().min(1),
  クライアント: z.string().optional(),
  LS担当者: z.string().optional(),
  自社PM: z.string().optional(),
  ステータス: z.string().min(1),
  優先度: z.string().min(1),
  開始日: z.string().optional().nullable(),
  予定完了日: z.string().optional().nullable(),
  '所在地/現地': z.string().optional().nullable(),
  'フォルダURL': z.string().optional().nullable(),
  '備考': z.string().optional().nullable(),
});

router.post('/', async (req, res) => {
  const payload = projectSchema.parse(req.body) as ProjectInput;
  const id = await createProject(payload);
  res.status(201).json({ id });
});

export default router;
