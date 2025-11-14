import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { createProject, listProjects, updateProject, ProjectInput, getProject } from '../lib/firestore';
import { getUser } from '../lib/users';
import { logActivity, calculateChanges } from '../lib/activity-log';

const router = Router();

router.use(authMiddleware());

router.get('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // すべてのユーザーが全プロジェクトを取得
    // TODO: 将来的にはproject_membersベースのフィルタリングを実装
    const projects = await listProjects(user.orgId);
    res.json({ projects });
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

router.post('/', async (req: any, res, next) => {
  try {
    const payload = projectSchema.parse(req.body) as ProjectInput;
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const id = await createProject(payload, user.orgId, req.uid);

    // アクティビティログを記録
    await logActivity({
      orgId: user.orgId,
      projectId: id,
      type: 'project.created',
      userId: user.id,
      userName: user.displayName,
      userEmail: user.email,
      targetType: 'project',
      targetId: id,
      targetName: payload.物件名,
      action: '作成',
      metadata: {
        ステータス: payload.ステータス,
        優先度: payload.優先度,
      },
    });

    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req: any, res, next) => {
  try {
    const payload = projectSchema.partial().parse(req.body) as Partial<ProjectInput>;
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 変更前のプロジェクト情報を取得
    const beforeProject = await getProject(user.orgId, req.params.id);
    if (!beforeProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await updateProject(req.params.id, payload, user.orgId);

    // 変更内容を計算
    const changes = calculateChanges(beforeProject, { ...beforeProject, ...payload });

    // アクティビティログを記録
    if (Object.keys(changes).length > 0) {
      await logActivity({
        orgId: user.orgId,
        projectId: req.params.id,
        type: 'project.updated',
        userId: user.id,
        userName: user.displayName,
        userEmail: user.email,
        targetType: 'project',
        targetId: req.params.id,
        targetName: beforeProject.物件名,
        action: '更新',
        changes,
      });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
