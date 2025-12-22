import { Router } from 'express';
import {
  addProjectMember,
  getProjectMember,
  listProjectMembers,
  syncProjectMemberSummary,
  updateProjectMember,
  removeProjectMember,
  acceptProjectInvitation,
  listUserProjects,
} from '../lib/project-members';
import { ProjectMemberInput } from '../lib/auth-types';
import { canManageProjectMembers } from '../lib/access-control';
import { getUser, listUsers } from '../lib/users';
import { getProject } from '../lib/firestore';
import { resolveAuthHeader, verifyToken } from '../lib/auth';
import { validateEmail, validateProjectRole } from '../lib/validation';
import { getProjectForUser, getEffectiveOrgId } from '../lib/access-helpers';

const router = Router();

/**
 * 認証ミドルウェア
 */
async function authenticate(req: any, res: any, next: any) {
  try {
    const { header, sources } = resolveAuthHeader(req);
    const token = header?.startsWith('Bearer ') ? header.slice(7) : header;

    console.log('[ProjectMembers][Auth]', {
      path: req.path,
      method: req.method,
      authorization: !!sources.authorization,
      forwarded: !!sources.forwarded,
      original: !!sources.original,
    });

    if (!token) {
      console.warn('[ProjectMembers][Auth] No token extracted');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await verifyToken(token);
    if (!decodedToken) {
      console.warn('[ProjectMembers][Auth] Token verification failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await getUser(decodedToken.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    console.error('[ProjectMembers][Auth] Authentication error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * GET /api/projects/:projectId/members
 * プロジェクトメンバー一覧を取得
 */
router.get('/projects/:projectId/members', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;
    const { role, status, orgId } = req.query;

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project, orgId: projectOrgId } = projectData;

    // プロジェクトの所有組織IDでメンバーを取得
    const members = await listProjectMembers(projectOrgId, projectId, {
      role,
      status,
      orgId,
    });

    // super_admin（システム管理者）はプロジェクトの担当者リスト等に表示しない
    // ただし、プロジェクトの組織のsuper_adminは表示する
    const superAdmins = await listUsers({ role: 'super_admin', isActive: true });
    const superAdminIdsFromOtherOrgs = new Set(
      superAdmins
        .filter(admin => admin.orgId !== projectOrgId) // プロジェクトの組織以外のsuper_adminのみ
        .map(admin => admin.id)
    );
    const filteredMembers = members.filter((member) => {
      if (!member.userId) return true;
      return !superAdminIdsFromOtherOrgs.has(member.userId);
    });

    void syncProjectMemberSummary(projectOrgId, projectId).catch((err) => {
      console.warn('[ProjectMembers] Failed to sync member summary:', err);
    });

    res.json(filteredMembers);
  } catch (error) {
    console.error('Error listing project members:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/projects/:projectId/manageable-users
 * 招待候補となる社内メンバー一覧を取得
 */
router.get('/projects/:projectId/manageable-users', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project, orgId: projectOrgId } = projectData;
    const effectiveOrgId = getEffectiveOrgId(req.user);

    console.log('[manageable-users] User:', { id: req.user.id, email: req.user.email, role: req.user.role, orgId: effectiveOrgId });
    console.log('[manageable-users] Project:', { id: project.id, orgId: projectOrgId });

    const canManage = await canManageProjectMembers(req.user, project as any, projectOrgId);
    console.log('[manageable-users] canManage:', canManage);

    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [members, users] = await Promise.all([
      listProjectMembers(projectOrgId, projectId),
      listUsers({
        orgId: effectiveOrgId,  // 有効な組織のユーザーのみ取得
        isActive: true
      }),
    ]);

    const memberUserIds = new Set(members.map(member => member.userId));
    const memberEmails = new Set(
      members
        .map(member => member.email?.toLowerCase())
        .filter(Boolean) as string[]
    );

    const candidates = users
      .filter(user => {
        if (!user.isActive) return false;
        if (memberUserIds.has(user.id)) return false;
        if (user.email && memberEmails.has(user.email.toLowerCase())) return false;
        return true;
      })
      .map(user => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName || user.email,
        role: user.role,
        jobTitle: user.jobTitle ?? null,
        department: user.department ?? null,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));

    res.json({ users: candidates });
  } catch (error) {
    console.error('Error listing manageable users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/projects/:projectId/members
 * プロジェクトメンバーを追加（招待）
 */
router.post('/projects/:projectId/members', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;
    const rawInput: ProjectMemberInput = req.body || {};

    const normalizedInput: ProjectMemberInput = {
      ...rawInput,
      email:
        typeof rawInput.email === 'string'
          ? rawInput.email.trim().toLowerCase() || undefined
          : undefined,
      displayName:
        typeof rawInput.displayName === 'string'
          ? rawInput.displayName.trim() || undefined
          : undefined,
    };

    if (!normalizedInput.email && !normalizedInput.displayName) {
      console.warn('[ProjectMembers] Missing email/displayName, falling back to placeholder name', {
        projectId,
        inviterId: req.uid,
      });
      normalizedInput.displayName = '名前未設定';
    }

    // メールアドレスがある場合のみバリデーション
    if (normalizedInput.email) {
      const emailError = validateEmail(normalizedInput.email);
      if (emailError) {
        return res.status(400).json({ error: emailError });
      }
    }

    // バリデーション: ロール
    const roleError = validateProjectRole(normalizedInput.role);
    if (roleError) {
      return res.status(400).json({ error: roleError });
    }

    const normalizedEmail = normalizedInput.email ?? null;

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project, orgId: projectOrgId } = projectData;

    // 権限チェック
    const canManage = await canManageProjectMembers(req.user, project as any, projectOrgId);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to manage members' });
    }

    // メールアドレスがある場合のみ重複チェック
    if (normalizedEmail) {
      // 自分自身を招待しようとしていないかチェック
      if (normalizedEmail === req.user.email.toLowerCase()) {
        return res.status(400).json({ error: 'Cannot invite yourself to the project' });
      }

      // 既存メンバーのチェック（メールアドレスで比較）
      const existingMembers = await listProjectMembers(projectOrgId, projectId);
      const isDuplicate = existingMembers.some((member) => {
        return member.email && member.email.toLowerCase() === normalizedEmail;
      });

      if (isDuplicate) {
        return res.status(400).json({
          error: 'This user is already a member or has been invited to this project',
        });
      }
    }

    // メンバーを追加（emailがある場合は正規化されたものを使用）
    const member = await addProjectMember(
      projectOrgId,
      projectId,
      (project as any).物件名 || projectId,
      normalizedInput,
      req.uid,
      req.user.displayName || req.user.email
    );

    // アクティビティログを記録
    try {
      const { logActivity } = await import('../lib/activity-log');
      await logActivity({
        orgId: projectOrgId,
        projectId,
        type: 'member.added',
        userId: req.uid,
        userName: req.user.displayName || req.user.email,
        userEmail: req.user.email,
        targetType: 'member',
        targetId: member.userId,
        targetName: member.displayName,
        action: 'メンバー追加',
        metadata: {
          role: normalizedInput.role,
          jobTitle: normalizedInput.jobTitle,
          email: normalizedEmail,
        },
      });
    } catch (logError) {
      console.error('[ProjectMembers] Failed to log activity:', logError);
      // ログ失敗でもメンバー追加は成功とする
    }

    // メール送信（メールアドレスが提供されている場合のみ）
    if (normalizedEmail) {
      try {
        const { sendInvitationEmail } = await import('../lib/gmail');
        const appUrl = process.env.APP_URL || 'https://compass-31e9e.web.app';
        await sendInvitationEmail({
          to: normalizedEmail,
          inviterName: req.user.displayName || req.user.email,
          organizationName: req.user.orgId,
          projectName: (project as any).物件名 || projectId,
          role: normalizedInput.role,
          inviteUrl: `${appUrl}/projects/${projectId}`,
          message: normalizedInput.message,
        });
      } catch (error) {
        console.error('[ProjectMembers] Failed to send invitation email:', error);
        // メール送信失敗でも招待は成功とする
      }
    }

    // アプリ内通知を作成（招待されたユーザーがログイン済みの場合）
    if (normalizedEmail) {
      try {
        const { getUserByEmail } = await import('../lib/users');
        const invitedUser = await getUserByEmail(normalizedEmail);

      if (invitedUser) {
        const { createNotification } = await import('./notifications-api');
        const appUrl = process.env.APP_URL || 'https://compass-31e9e.web.app';
        await createNotification({
          userId: invitedUser.id,
          type: 'invitation',
          title: `プロジェクト「${(project as any).物件名 || projectId}」への招待`,
          message: `${req.user.displayName || req.user.email}さんからプロジェクトに招待されました`,
          actionUrl: `${appUrl}/projects/${projectId}`,
          metadata: {
            projectId: projectId,
            projectName: (project as any).物件名 || projectId,
            inviterName: req.user.displayName || req.user.email,
            role: normalizedInput.role,
          },
        });
      }
      } catch (error) {
        console.error('[ProjectMembers] Failed to create in-app notification:', error);
        // 通知作成失敗でも招待は成功とする
      }
    }

    res.status(201).json(member);
  } catch (error) {
    console.error('Error adding project member:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * PATCH /api/projects/:projectId/members/:userId
 * プロジェクトメンバーを更新
 */
router.patch('/projects/:projectId/members/:userId', authenticate, async (req: any, res) => {
  try {
    const { projectId, userId } = req.params;
    const updates = req.body;

    // バリデーション: ロールが指定されている場合
    if (updates.role) {
      const roleError = validateProjectRole(updates.role);
      if (roleError) {
        return res.status(400).json({ error: roleError });
      }
    }

    // バリデーション: ステータスが指定されている場合
    if (updates.status) {
      const validStatuses = ['invited', 'active', 'inactive'];
      if (!validStatuses.includes(updates.status)) {
        return res.status(400).json({
          error: `Invalid status. Valid statuses: ${validStatuses.join(', ')}`,
        });
      }
    }

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project, orgId: projectOrgId } = projectData;

    // メンバーが存在するか確認
    const existingMember = await getProjectMember(projectOrgId, projectId, userId);
    if (!existingMember) {
      return res.status(404).json({ error: 'Member not found in this project' });
    }

    // 権限チェック
    const canManage = await canManageProjectMembers(req.user, project as any, projectOrgId);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to manage members' });
    }

    await updateProjectMember(projectOrgId, projectId, userId, updates);

    // アクティビティログを記録
    try {
      const { logActivity, calculateChanges } = await import('../lib/activity-log');
      const changes = calculateChanges(
        existingMember,
        { ...existingMember, ...updates },
        ['role', 'jobTitle', 'status']
      );

      if (Object.keys(changes).length > 0) {
        await logActivity({
          orgId: projectOrgId,
          projectId,
          type: 'member.updated',
          userId: req.uid,
          userName: req.user.displayName || req.user.email,
          userEmail: req.user.email,
          targetType: 'member',
          targetId: userId,
          targetName: existingMember.displayName,
          action: 'メンバー情報更新',
          changes,
        });
      }
    } catch (logError) {
      console.error('[ProjectMembers] Failed to log activity:', logError);
      // ログ失敗でも更新は成功とする
    }

    const updatedMember = await getProjectMember(projectOrgId, projectId, userId);
    res.json(updatedMember);
  } catch (error) {
    console.error('Error updating project member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/projects/:projectId/members/:userId
 * プロジェクトメンバーを削除または招待を辞退
 */
router.delete('/projects/:projectId/members/:userId', authenticate, async (req: any, res) => {
  try {
    const { projectId, userId } = req.params;

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project, orgId: projectOrgId } = projectData;

    // メンバーが存在するか確認
    const existingMember = await getProjectMember(projectOrgId, projectId, userId);
    if (!existingMember) {
      return res.status(404).json({ error: 'Member not found in this project' });
    }

    // 権限チェック: 管理者または本人が自分の招待を辞退する場合
    const canManage = await canManageProjectMembers(req.user, project as any, projectOrgId);
    const isSelfDecline = req.uid === userId && existingMember.status === 'invited';

    console.log('[DELETE Member] Permission check:', {
      userId: req.uid,
      targetUserId: userId,
      userRole: req.user.role,
      canManage,
      isSelfDecline,
      existingMemberRole: existingMember.role,
      existingMemberStatus: existingMember.status,
    });

    if (!canManage && !isSelfDecline) {
      return res.status(403).json({
        error: 'Forbidden: You do not have permission to remove this member'
      });
    }

    // プロジェクトオーナーを削除しようとしていないかチェック
    if (existingMember.role === 'owner') {
      return res.status(400).json({
        error: 'Cannot remove the project owner. Transfer ownership first.',
      });
    }

    await removeProjectMember(projectOrgId, projectId, userId);

    // アクティビティログを記録
    try {
      const { logActivity } = await import('../lib/activity-log');
      await logActivity({
        orgId: projectOrgId,
        projectId,
        type: 'member.removed',
        userId: req.uid,
        userName: req.user.displayName || req.user.email,
        userEmail: req.user.email,
        targetType: 'member',
        targetId: userId,
        targetName: existingMember.displayName,
        action: isSelfDecline ? '招待辞退' : 'メンバー削除',
        metadata: {
          role: existingMember.role,
          jobTitle: existingMember.jobTitle,
          email: existingMember.email,
        },
      });
    } catch (logError) {
      console.error('[ProjectMembers] Failed to log activity:', logError);
      // ログ失敗でも削除は成功とする
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error removing project member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/projects/:projectId/members/:userId/accept
 * プロジェクトメンバーの招待を承認
 */
router.post('/projects/:projectId/members/:userId/accept', authenticate, async (req: any, res) => {
  try {
    const { projectId, userId } = req.params;

    // 自分自身の招待のみ承認可能
    if (req.uid !== userId) {
      return res.status(403).json({ error: 'Forbidden: You can only accept your own invitations' });
    }

    // プロジェクトが存在するか確認（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project, orgId: projectOrgId } = projectData;

    // 招待が存在するか確認
    const member = await getProjectMember(projectOrgId, projectId, userId);
    if (!member) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // ステータスが'invited'であることを確認
    if (member.status !== 'invited') {
      return res.status(400).json({
        error: `Cannot accept invitation with status: ${member.status}`,
      });
    }

    await acceptProjectInvitation(projectOrgId, projectId, userId);

    const updatedMember = await getProjectMember(projectOrgId, projectId, userId);
    res.json(updatedMember);
  } catch (error) {
    console.error('Error accepting project invitation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users/:userId/projects
 * ユーザーが参加しているプロジェクト一覧を取得
 */
router.get('/users/:userId/projects', authenticate, async (req: any, res) => {
  try {
    const { userId } = req.params;

    // 自分自身または管理者のみ取得可能
    if (req.uid !== userId && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // クロスオーガナイゼーション対応：全組織のプロジェクトを取得
    const projects = await listUserProjects(null, userId);

    res.json(projects);
  } catch (error) {
    console.error('Error listing user projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
