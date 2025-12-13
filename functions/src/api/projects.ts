import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { createProject, listProjects, updateProject, deleteProject as deleteProjectRepo, ProjectInput, getProject } from '../lib/firestore';
import { getUser } from '../lib/users';
import { logActivity, calculateChanges } from '../lib/activity-log';
import { canDeleteProject } from '../lib/access-control';

const router = Router();

router.use(authMiddleware());

router.get('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // ユーザーがメンバーとして参加している全プロジェクトを取得（組織をまたいでも）
    const { listUserProjects } = await import('../lib/project-members');
    const userProjectMemberships = await listUserProjects(null, req.uid); // orgId=null で全組織のプロジェクトを取得
    const projectIds = userProjectMemberships.map(m => m.projectId);

    if (projectIds.length === 0) {
      res.json({ projects: [] });
      return;
    }

    // 組織IDごとにプロジェクトをグループ化
    const projectsByOrg = new Map<string, string[]>();
    for (const { projectId, member } of userProjectMemberships) {
      if (!projectsByOrg.has(member.orgId)) {
        projectsByOrg.set(member.orgId, []);
      }
      projectsByOrg.get(member.orgId)!.push(projectId);
    }

    // プロジェクト詳細を組織ごとにバッチ取得
    const { db, serialize } = await import('../lib/firestore');
    const projectsMap = new Map();

    for (const [orgId, projectIds] of projectsByOrg.entries()) {
      try {
        // Firestoreの getAll で一度に複数のドキュメントを取得（バッチ読み取り）
        const refs = projectIds.map(projectId =>
          db.collection('orgs').doc(orgId).collection('projects').doc(projectId)
        );
        const snapshots = await db.getAll(...refs);

        snapshots.forEach(snapshot => {
          if (snapshot.exists) {
            // getProject と同じように serialize を使用して型を整える
            const project = serialize(snapshot as any);
            // 削除済みプロジェクトを除外
            if (!project.deletedAt) {
              projectsMap.set(snapshot.id, project);
            }
          }
        });
      } catch (error) {
        console.error(`Failed to load projects from org ${orgId}:`, error);
      }
    }

    const projects = Array.from(projectsMap.values());
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
  引渡し予定日: z.string().optional().nullable(),
  '所在地/現地': z.string().optional().nullable(),
  'フォルダURL': z.string().optional().nullable(),
  '備考': z.string().optional().nullable(),
  施工費: z.number().optional().nullable(),
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

router.delete('/:id', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // ユーザーがメンバーとなっているプロジェクトを検索して、プロジェクトの実際のorgIdを見つける
    const { listUserProjects } = await import('../lib/project-members');
    const userProjectMemberships = await listUserProjects(null, req.uid);
    const membership = userProjectMemberships.find(m => m.projectId === req.params.id);

    if (!membership) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectOrgId = membership.member.orgId;

    // プロジェクトの存在と権限をチェック
    const project = await getProject(projectOrgId, req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // 削除権限をチェック（型アサーション: serialize によって適切な形式に変換済み）
    const hasPermission = await canDeleteProject(user, project as any, projectOrgId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this project' });
    }

    // プロジェクトを削除
    await deleteProjectRepo(req.params.id, projectOrgId);

    // 活動ログに記録
    await logActivity({
      orgId: projectOrgId,
      projectId: req.params.id,
      type: 'project.deleted',
      userId: user.id,
      userName: user.displayName,
      userEmail: user.email,
      targetType: 'project',
      targetId: req.params.id,
      targetName: project.物件名,
      action: '削除',
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
