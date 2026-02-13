import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { createProject, listProjects, updateProject, deleteProject as deleteProjectRepo, ProjectInput, getProject, db } from '../lib/firestore';
import { getUser } from '../lib/users';
import { logActivity, calculateChanges } from '../lib/activity-log';
import { canDeleteProject } from '../lib/access-control';
import { getProjectForUser, getEffectiveOrgId } from '../lib/access-helpers';
import { createDriveFolder, expandFolderNameTemplate } from '../lib/driveIntegration';
import { createChatSpace, expandSpaceNameTemplate, addChatMembersBatch } from '../lib/chatIntegration';
import { DEFAULT_GOOGLE_INTEGRATION_SETTINGS } from '../lib/types';
import { listProjectMembers } from '../lib/project-members';

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
    const userProjectMemberships = await listUserProjects(null, req.uid, { includeProject: false }); // orgId=null で全組織のプロジェクトを取得
    const projectIds = userProjectMemberships.map(m => m.projectId);

    if (projectIds.length === 0) {
      res.json({ projects: [] });
      return;
    }

    // 組織IDごとにプロジェクトをグループ化
    const projectsByOrg = new Map<string, string[]>();
    for (const { projectId, member } of userProjectMemberships) {
      const projectOrgId = member.projectOrgId || member.orgId;
      if (!projectOrgId) {
        console.warn('[projects] Missing projectOrgId for project:', projectId);
        continue;
      }
      if (!projectsByOrg.has(projectOrgId)) {
        projectsByOrg.set(projectOrgId, []);
      }
      projectsByOrg.get(projectOrgId)!.push(projectId);
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
  レイアウト確定日: z.string().optional().nullable(),
  基本設計完了日: z.string().optional().nullable(),
  設計施工現調日: z.string().optional().nullable(),
  見積確定日: z.string().optional().nullable(),
  着工日: z.string().optional().nullable(),
  中間検査日: z.string().optional().nullable(),
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

    // なりすまし中の場合は、なりすまし先の組織にプロジェクトを作成
    const effectiveOrgId = getEffectiveOrgId(user);
    const id = await createProject(payload, effectiveOrgId, req.uid);

    // Google連携設定を取得して自動作成
    let driveFolderUrl: string | null = null;
    let driveFolderId: string | null = null;
    let chatSpaceUrl: string | null = null;
    let chatSpaceId: string | null = null;

    try {
      const settingsDoc = await db.collection('orgs').doc(effectiveOrgId).collection('settings').doc('google-integration').get();
      const settings = settingsDoc.exists ? settingsDoc.data() : DEFAULT_GOOGLE_INTEGRATION_SETTINGS;

      const projectData = { id, 物件名: payload.物件名, クライアント: payload.クライアント };

      // Drive フォルダ自動作成
      if (settings?.drive?.enabled) {
        try {
          const folderName = expandFolderNameTemplate(
            settings.drive.folderNameTemplate || '{projectName}',
            projectData
          );
          const driveResult = await createDriveFolder({
            folderName,
            parentFolderId: settings.drive.parentFolderId,
          });
          driveFolderId = driveResult.folderId;
          driveFolderUrl = driveResult.folderUrl;
          console.log('[projects] Drive folder created:', driveResult);
        } catch (driveError) {
          console.error('[projects] Failed to create Drive folder:', driveError);
          // Drive作成失敗してもプロジェクト作成は続行
        }
      }

      // Chat スペース自動作成
      if (settings?.chat?.enabled) {
        try {
          const spaceName = expandSpaceNameTemplate(
            settings.chat.spaceNameTemplate || '【COMPASS】{projectName}',
            projectData
          );
          const chatResult = await createChatSpace({
            displayName: spaceName,
            description: settings.chat.defaultDescription,
          });
          chatSpaceId = chatResult.spaceId;
          chatSpaceUrl = chatResult.spaceUrl;
          console.log('[projects] Chat space created:', chatResult);
        } catch (chatError) {
          console.error('[projects] Failed to create Chat space:', chatError);
          // Chat作成失敗してもプロジェクト作成は続行
        }
      }

      // 作成した連携情報をプロジェクトに保存
      if (driveFolderId || chatSpaceId) {
        await updateProject(id, {
          driveFolderId,
          driveFolderUrl,
          chatSpaceId,
          chatSpaceUrl,
        } as any, effectiveOrgId);
      }
    } catch (settingsError) {
      console.error('[projects] Failed to process Google integration:', settingsError);
      // 設定取得失敗してもプロジェクト作成は続行
    }

    // アクティビティログを記録
    await logActivity({
      orgId: effectiveOrgId,
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
        driveFolderUrl,
        chatSpaceUrl,
      },
    });

    res.status(201).json({ id, driveFolderUrl, chatSpaceUrl });
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

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, req.params.id);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project: beforeProject, orgId: projectOrgId } = projectData;

    await updateProject(req.params.id, payload, projectOrgId);

    // 変更内容を計算
    const changes = calculateChanges(beforeProject, { ...beforeProject, ...payload });

    // アクティビティログを記録
    if (Object.keys(changes).length > 0) {
      await logActivity({
        orgId: projectOrgId,
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

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, req.params.id);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project, orgId: projectOrgId } = projectData;

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

// Chat メンバー招待スキーマ
const chatMembersSchema = z.object({
  memberIds: z.array(z.string()).min(1),
});

/**
 * POST /:id/chat-members
 * プロジェクトメンバーをChatスペースに招待
 */
router.post('/:id/chat-members', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const payload = chatMembersSchema.parse(req.body);
    const projectId = req.params.id;

    // プロジェクトを取得
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project, orgId: projectOrgId } = projectData;

    // Chat スペースが設定されていない場合はエラー
    if (!project.chatSpaceId) {
      return res.status(400).json({ error: 'Chat space not configured for this project' });
    }

    // プロジェクトメンバーを取得
    const members = await listProjectMembers(projectOrgId, projectId);

    // 指定されたメンバーのメールアドレスを収集
    const emails: string[] = [];
    const missingEmails: string[] = [];

    for (const memberId of payload.memberIds) {
      const member = members.find(m => m.id === memberId || m.userId === memberId);
      if (member) {
        if (member.email) {
          emails.push(member.email);
        } else {
          missingEmails.push(member.displayName || memberId);
        }
      }
    }

    if (emails.length === 0) {
      return res.status(400).json({
        error: 'No valid email addresses found',
        missingEmails,
      });
    }

    // Chat スペースにメンバーを追加
    const result = await addChatMembersBatch(project.chatSpaceId, emails);

    // アクティビティログを記録
    await logActivity({
      orgId: projectOrgId,
      projectId,
      type: 'project.chat_members_invited',
      userId: user.id,
      userName: user.displayName,
      userEmail: user.email,
      targetType: 'project',
      targetId: projectId,
      targetName: project.物件名,
      action: 'Chatメンバー招待',
      metadata: {
        invitedCount: result.successCount,
        failedCount: result.failedCount,
        emails: emails,
      },
    });

    res.json({
      success: true,
      ...result,
      missingEmails,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
