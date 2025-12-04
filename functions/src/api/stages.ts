import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import {
  listStages,
  createStage,
  updateStage,
  deleteStage,
  getProject,
} from '../lib/firestore';
import { getUser } from '../lib/users';
import { listUserProjects, getProjectMemberPermissions } from '../lib/project-members';

const router = Router();

router.use(authMiddleware());

const stageSchema = z.object({
  projectId: z.string().min(1),
  タスク名: z.string().min(1),
  予定開始日: z.string().optional().nullable(),
  期限: z.string().optional().nullable(),
  orderIndex: z.number().optional().nullable(),
});

const updateStageSchema = z.object({
  タスク名: z.string().optional(),
  予定開始日: z.string().optional().nullable(),
  期限: z.string().optional().nullable(),
  orderIndex: z.number().optional().nullable(),
});

/**
 * GET /api/projects/:projectId/stages
 * プロジェクトの工程一覧を取得
 */
router.get('/projects/:projectId/stages', async (req: any, res, next) => {
  try {
    const { projectId } = req.params;

    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // プロジェクトメンバーシップをチェック
    const userProjectMemberships = await listUserProjects(user.orgId, req.uid);
    const membership = userProjectMemberships.find(m => m.projectId === projectId);

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    const stages = await listStages(projectId, user.orgId);

    res.json({ stages });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/projects/:projectId/stages
 * 工程を作成
 */
router.post('/projects/:projectId/stages', async (req: any, res, next) => {
  try {
    const { projectId } = req.params;
    const payload = stageSchema.parse({ ...req.body, projectId });

    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // プロジェクトメンバーシップと権限をチェック
    const userProjectMemberships = await listUserProjects(user.orgId, req.uid);
    const membership = userProjectMemberships.find(m => m.projectId === projectId);

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    const permissions = await getProjectMemberPermissions(user.orgId, projectId, req.uid);
    if (!permissions || !permissions.canCreateTasks) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to create stages' });
    }

    const stageId = await createStage({
      ...payload,
      orgId: user.orgId,
    });

    res.status(201).json({ id: stageId });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/stages/:stageId
 * 工程を更新
 */
router.patch('/stages/:stageId', async (req: any, res, next) => {
  try {
    const { stageId } = req.params;
    const updates = updateStageSchema.parse(req.body);

    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // TODO: ステージの所属プロジェクトを取得して権限チェック
    // 簡易実装として、ユーザーの orgId で更新を許可

    await updateStage(stageId, updates, user.orgId);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/stages/:stageId
 * 工程を削除（配下のタスクは未割り当てに戻す）
 */
router.delete('/stages/:stageId', async (req: any, res, next) => {
  try {
    const { stageId } = req.params;

    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // TODO: ステージの所属プロジェクトを取得して権限チェック
    // 簡易実装として、ユーザーの orgId で削除を許可

    await deleteStage(stageId, user.orgId);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
