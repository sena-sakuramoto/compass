import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { createProject, listProjects, updateProject, ProjectInput, getProject } from '../lib/firestore';
import { listUserProjects } from '../lib/project-members';
import { getUser } from '../lib/users';

const router = Router();

router.use(authMiddleware());

router.get('/', async (req: any, res, next) => {
  try {
    console.log('[GET /api/projects] req.uid:', req.uid);
    const user = await getUser(req.uid);
    if (!user) {
      console.error('[GET /api/projects] User not found for uid:', req.uid);
      return res.status(401).json({ error: 'User not found' });
    }

    // 管理者は全プロジェクトを取得
    if (user.role === 'admin') {
      const projects = await listProjects();
      res.json({ projects });
      return;
    }

    // 一般ユーザーは参加しているプロジェクトのみ取得
    const userProjectMemberships = await listUserProjects(user.orgId, user.id);
    const projectIds = userProjectMemberships.map(m => m.projectId);

    // プロジェクト詳細を取得
    const projects = await Promise.all(
      projectIds.map(projectId => getProject(user.orgId, projectId))
    );

    // null を除外
    const validProjects = projects.filter(p => p !== null);

    res.json({ projects: validProjects });
  } catch (error) {
    next(error);
  }
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
  現地調査日: z.string().optional().nullable(),
  着工日: z.string().optional().nullable(),
  竣工予定日: z.string().optional().nullable(),
  '所在地/現地': z.string().optional().nullable(),
  'フォルダURL': z.string().optional().nullable(),
  '備考': z.string().optional().nullable(),
});

router.post('/', async (req, res, next) => {
  try {
    const payload = projectSchema.parse(req.body) as ProjectInput;
    const id = await createProject(payload);
    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const payload = projectSchema.partial().parse(req.body) as Partial<ProjectInput>;
    await updateProject(req.params.id, payload);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
