import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import {
  listStages,
  createStage,
  updateStage,
  deleteStage,
  getProject,
  getStage,
} from '../lib/firestore';
import { getUser } from '../lib/users';
import { listUserProjects, getProjectMemberPermissions } from '../lib/project-members';
import { getProjectForUser } from '../lib/access-helpers';

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

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    const { orgId: projectOrgId } = projectData;

    const stages = await listStages(projectId, projectOrgId);

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

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    const { orgId: projectOrgId } = projectData;

    const permissions = await getProjectMemberPermissions(projectOrgId, projectId, req.uid);
    if (!permissions || !permissions.canCreateTasks) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to create stages' });
    }

    const stageId = await createStage({
      ...payload,
      orgId: projectOrgId,
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

    // ユーザーがアクセス可能な全組織からステージを検索（クロスオーガナイゼーション対応）
    const userProjectMemberships = await listUserProjects(null, req.uid);
    const accessibleOrgIds = new Set(
      userProjectMemberships.map(
        m => m.project?.ownerOrgId || m.member.projectOrgId || m.member.orgId
      )
    );

    let stage: any = null;
    let stageOrgId: string | null = null;

    for (const orgId of accessibleOrgIds) {
      const found = await getStage(stageId, orgId);
      if (found) {
        stage = found;
        stageOrgId = orgId;
        break;
      }
    }

    if (!stage || !stageOrgId) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    // プロジェクトを取得して権限をチェック
    const projectData = await getProjectForUser(req.uid, stage.projectId);
    if (!projectData) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    const { orgId: projectOrgId } = projectData;

    const permissions = await getProjectMemberPermissions(projectOrgId, stage.projectId, req.uid);
    if (!permissions || !permissions.canEditTasks) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to edit stages' });
    }

    await updateStage(stageId, updates, projectOrgId);

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

    // ユーザーがアクセス可能な全組織からステージを検索（クロスオーガナイゼーション対応）
    const userProjectMemberships = await listUserProjects(null, req.uid);
    const accessibleOrgIds = new Set(
      userProjectMemberships.map(
        m => m.project?.ownerOrgId || m.member.projectOrgId || m.member.orgId
      )
    );

    let stage: any = null;
    let stageOrgId: string | null = null;

    for (const orgId of accessibleOrgIds) {
      const found = await getStage(stageId, orgId);
      if (found) {
        stage = found;
        stageOrgId = orgId;
        break;
      }
    }

    if (!stage || !stageOrgId) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    // プロジェクトを取得して権限をチェック
    const projectData = await getProjectForUser(req.uid, stage.projectId);
    if (!projectData) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    const { orgId: projectOrgId } = projectData;

    const permissions = await getProjectMemberPermissions(projectOrgId, stage.projectId, req.uid);
    if (!permissions || !permissions.canDeleteTasks) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to delete stages' });
    }

    await deleteStage(stageId, projectOrgId);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
