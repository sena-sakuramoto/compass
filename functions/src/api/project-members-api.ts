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
import { getProject, db } from '../lib/firestore';
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

    void syncProjectMemberSummary(projectOrgId, projectId).catch((err) => {
      console.warn('[ProjectMembers] Failed to sync member summary:', err);
    });

    res.json(members);
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

    const members = await listProjectMembers(projectOrgId, projectId);
    const orgIds = new Set<string>();
    orgIds.add(projectOrgId);
    if (effectiveOrgId) {
      orgIds.add(effectiveOrgId);
    }
    members.forEach((member) => {
      if (member.orgId) orgIds.add(member.orgId);
      if (member.projectOrgId) orgIds.add(member.projectOrgId);
    });


    const orgIdList = Array.from(orgIds);
    const orgDocs = await db.getAll(...orgIdList.map((orgId) => db.collection('orgs').doc(orgId)));
    const orgNameById = new Map<string, string>();
    orgDocs.forEach((docSnap, index) => {
      const orgId = orgIdList[index];
      const orgData = docSnap.data();
      const orgName = orgData?.name || orgData?.組織名 || orgId;
      orgNameById.set(orgId, orgName);
    });

    const usersByOrg = await Promise.all(
      orgIdList.map((orgId) =>
        listUsers({
          orgId,
          isActive: true,
        })
      )
    );

    const memberUserIds = new Set(members.map(member => member.userId));
    const memberEmails = new Set(
      members
        .map(member => member.email?.toLowerCase())
        .filter(Boolean) as string[]
    );

    const candidates = usersByOrg
      .flatMap((users, index) => {
        const orgId = orgIdList[index];
        const orgName = orgNameById.get(orgId) || orgId;
        return users.map((user) => ({
          ...user,
          orgId,
          orgName,
        }));
      })
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
        orgId: user.orgId,
        orgName: (user as any).orgName ?? user.orgId,
      }))
      .sort((a, b) => {
        const orgDiff = (a.orgName || a.orgId).localeCompare((b.orgName || b.orgId), 'ja');
        if (orgDiff !== 0) return orgDiff;
        return a.displayName.localeCompare(b.displayName, 'ja');
      });

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

/**
 * POST /api/projects/:projectId/members/batch
 * 複数メンバーを一括追加
 */
router.post('/projects/:projectId/members/batch', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;
    const { members: memberInputs } = req.body;

    // バリデーション: members は配列で必須
    if (!Array.isArray(memberInputs) || memberInputs.length === 0) {
      return res.status(400).json({ error: 'members array is required and must not be empty' });
    }

    // Rate limiting: 一度に追加できるメンバー数を制限（最大50人）
    const MAX_BATCH_SIZE = 50;
    if (memberInputs.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        error: `Too many members to add at once. Maximum is ${MAX_BATCH_SIZE} members.`,
        memberCount: memberInputs.length,
      });
    }

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

    // 既存メンバーを取得
    const existingMembers = await listProjectMembers(projectOrgId, projectId);
    const existingEmails = new Set(
      existingMembers
        .map(member => member.email?.toLowerCase())
        .filter(Boolean) as string[]
    );
    const existingUserIds = new Set(existingMembers.map(member => member.userId));

    const projectName = (project as any).物件名 || projectId;
    const appUrl = process.env.APP_URL || 'https://compass-31e9e.web.app';

    // 招待処理
    const results = {
      added: [] as any[],
      skipped: [] as string[],
      errors: [] as { email?: string; displayName?: string; error: string }[],
    };

    for (const input of memberInputs) {
      const normalizedInput: ProjectMemberInput = {
        ...input,
        email:
          typeof input.email === 'string'
            ? input.email.trim().toLowerCase() || undefined
            : undefined,
        displayName:
          typeof input.displayName === 'string'
            ? input.displayName.trim() || undefined
            : undefined,
      };

      // メールアドレスがある場合のみバリデーション
      if (normalizedInput.email) {
        const emailError = validateEmail(normalizedInput.email);
        if (emailError) {
          results.errors.push({ email: normalizedInput.email, error: emailError });
          continue;
        }

        // 自分自身を招待しようとしていないかチェック
        if (normalizedInput.email === req.user.email.toLowerCase()) {
          results.skipped.push(normalizedInput.email);
          continue;
        }

        // 既存メンバーのチェック（メールアドレスで比較）
        if (existingEmails.has(normalizedInput.email)) {
          results.skipped.push(normalizedInput.email);
          continue;
        }
      }

      // ロールバリデーション
      const roleError = validateProjectRole(normalizedInput.role);
      if (roleError) {
        results.errors.push({
          email: normalizedInput.email,
          displayName: normalizedInput.displayName,
          error: roleError
        });
        continue;
      }

      try {
        // メンバーを追加
        const member = await addProjectMember(
          projectOrgId,
          projectId,
          projectName,
          normalizedInput,
          req.uid,
          req.user.displayName || req.user.email
        );

        results.added.push(member);

        // 追加したメールをセットに追加（重複防止）
        if (normalizedInput.email) {
          existingEmails.add(normalizedInput.email);
        }

        // アプリ内通知を作成（メールアドレスがある場合のみ）
        if (normalizedInput.email) {
          try {
            const { getUserByEmail } = await import('../lib/users');
            const invitedUser = await getUserByEmail(normalizedInput.email);

            if (invitedUser) {
              const { createNotification } = await import('./notifications-api');
              await createNotification({
                userId: invitedUser.id,
                type: 'invitation',
                title: `プロジェクト「${projectName}」への招待`,
                message: `${req.user.displayName || req.user.email}さんからプロジェクトに招待されました`,
                actionUrl: `${appUrl}/projects/${projectId}`,
                metadata: {
                  projectId: projectId,
                  projectName: projectName,
                  inviterName: req.user.displayName || req.user.email,
                  role: normalizedInput.role,
                },
              });
            }
          } catch (notifError) {
            console.error('[batch-add] Failed to create notification for', normalizedInput.email, notifError);
          }
        }

      } catch (error) {
        console.error('[batch-add] Failed to add member:', error);
        results.errors.push({
          email: normalizedInput.email,
          displayName: normalizedInput.displayName,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // アクティビティログを記録
    if (results.added.length > 0) {
      try {
        const { logActivity } = await import('../lib/activity-log');
        await logActivity({
          orgId: projectOrgId,
          projectId,
          type: 'member.batch_added',
          userId: req.uid,
          userName: req.user.displayName || req.user.email,
          userEmail: req.user.email,
          targetType: 'member',
          targetId: projectId,
          targetName: projectName,
          action: 'メンバー一括追加',
          metadata: {
            addedCount: results.added.length,
            skippedCount: results.skipped.length,
            errorCount: results.errors.length,
          },
        });
      } catch (logError) {
        console.error('[batch-add] Failed to log activity:', logError);
      }
    }

    res.json({
      message: `Successfully added ${results.added.length} members`,
      addedCount: results.added.length,
      skippedCount: results.skipped.length,
      errorCount: results.errors.length,
      added: results.added,
      skipped: results.skipped.length > 0 ? results.skipped : undefined,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error) {
    console.error('Error batch adding members:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /api/projects/:projectId/invite-org
 * 組織の全メンバーをプロジェクトに一括招待
 */
router.post('/projects/:projectId/invite-org', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;
    const { targetOrgId } = req.body;

    // バリデーション: targetOrgId は必須
    if (!targetOrgId || typeof targetOrgId !== 'string') {
      return res.status(400).json({ error: 'targetOrgId is required' });
    }

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project, orgId: projectOrgId } = projectData;

    // 権限チェック: プロジェクトオーナーまたは管理者のみ実行可能
    const canManage = await canManageProjectMembers(req.user, project as any, projectOrgId);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to manage members' });
    }

    // 自組織への招待は不要（既に参加可能）
    if (targetOrgId === projectOrgId) {
      return res.status(400).json({ error: 'Cannot invite your own organization. Members already have access.' });
    }

    // 対象組織が存在するか確認
    const targetOrgDoc = await db.collection('orgs').doc(targetOrgId).get();
    if (!targetOrgDoc.exists) {
      return res.status(404).json({ error: 'Target organization not found' });
    }

    const targetOrgData = targetOrgDoc.data();
    const targetOrgName = targetOrgData?.name || targetOrgData?.組織名 || targetOrgId;

    // 対象組織の全アクティブユーザーを取得
    const targetUsers = await listUsers({
      orgId: targetOrgId,
      isActive: true,
    });

    if (targetUsers.length === 0) {
      return res.status(400).json({ error: 'Target organization has no active members' });
    }

    // Rate limiting: 一度に招待できるユーザー数を制限（最大100人）
    const MAX_INVITE_BATCH = 100;
    if (targetUsers.length > MAX_INVITE_BATCH) {
      return res.status(400).json({
        error: `Too many members to invite at once. Maximum is ${MAX_INVITE_BATCH} members.`,
        memberCount: targetUsers.length,
      });
    }

    // 既存メンバーを取得
    const existingMembers = await listProjectMembers(projectOrgId, projectId);
    const existingEmails = new Set(
      existingMembers
        .map(member => member.email?.toLowerCase())
        .filter(Boolean) as string[]
    );
    const existingUserIds = new Set(existingMembers.map(member => member.userId));

    // 招待対象のユーザーをフィルタリング（既存メンバーを除外）
    const usersToInvite = targetUsers.filter(user => {
      if (existingUserIds.has(user.id)) return false;
      if (user.email && existingEmails.has(user.email.toLowerCase())) return false;
      return true;
    });

    if (usersToInvite.length === 0) {
      return res.status(200).json({
        message: 'All members from this organization are already in the project',
        invitedCount: 0,
        skippedCount: targetUsers.length,
      });
    }

    // 招待処理
    const results = {
      invited: [] as string[],
      skipped: [] as string[],
      errors: [] as string[],
    };

    const projectName = (project as any).物件名 || projectId;
    const appUrl = process.env.APP_URL || 'https://compass-31e9e.web.app';

    for (const user of usersToInvite) {
      try {
        // メンバーを追加
        const member = await addProjectMember(
          projectOrgId,
          projectId,
          projectName,
          {
            email: user.email,
            role: 'member', // デフォルトはmemberロール
            jobTitle: user.jobTitle,
          },
          req.uid,
          req.user.displayName || req.user.email
        );

        results.invited.push(user.email);

        // アプリ内通知を作成
        try {
          const { createNotification } = await import('./notifications-api');
          await createNotification({
            userId: user.id,
            type: 'invitation',
            title: `プロジェクト「${projectName}」への招待`,
            message: `${req.user.displayName || req.user.email}さんから組織一括招待でプロジェクトに参加しました`,
            actionUrl: `${appUrl}/projects/${projectId}`,
            metadata: {
              projectId: projectId,
              projectName: projectName,
              inviterName: req.user.displayName || req.user.email,
              role: 'member',
              orgInvite: true,
              sourceOrgId: targetOrgId,
              sourceOrgName: targetOrgName,
            },
          });
        } catch (notifError) {
          console.error('[invite-org] Failed to create notification for', user.email, notifError);
        }

        // メール送信（オプション - エラーでも続行）
        try {
          const { sendInvitationEmail } = await import('../lib/gmail');
          await sendInvitationEmail({
            to: user.email,
            inviterName: req.user.displayName || req.user.email,
            organizationName: targetOrgName,
            projectName: projectName,
            role: 'member',
            inviteUrl: `${appUrl}/projects/${projectId}`,
            message: `組織「${targetOrgName}」のメンバーとして一括招待されました。`,
          });
        } catch (emailError) {
          console.error('[invite-org] Failed to send email to', user.email, emailError);
        }
      } catch (error) {
        console.error('[invite-org] Failed to invite', user.email, error);
        results.errors.push(user.email);
      }
    }

    // アクティビティログを記録
    try {
      const { logActivity } = await import('../lib/activity-log');
      await logActivity({
        orgId: projectOrgId,
        projectId,
        type: 'org.invited',
        userId: req.uid,
        userName: req.user.displayName || req.user.email,
        userEmail: req.user.email,
        targetType: 'organization',
        targetId: targetOrgId,
        targetName: targetOrgName,
        action: '組織一括招待',
        metadata: {
          invitedCount: results.invited.length,
          skippedCount: results.skipped.length,
          errorCount: results.errors.length,
        },
      });
    } catch (logError) {
      console.error('[invite-org] Failed to log activity:', logError);
    }

    res.json({
      message: `Successfully invited ${results.invited.length} members from organization "${targetOrgName}"`,
      invitedCount: results.invited.length,
      skippedCount: existingMembers.length,
      errorCount: results.errors.length,
      invited: results.invited,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error) {
    console.error('Error inviting organization:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/projects/:projectId/invite-org/preview
 * 組織招待のプレビュー（対象メンバー数を確認）
 */
router.get('/projects/:projectId/invite-org/preview', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;
    const { targetOrgId } = req.query;

    // バリデーション: targetOrgId は必須
    if (!targetOrgId || typeof targetOrgId !== 'string') {
      return res.status(400).json({ error: 'targetOrgId is required' });
    }

    // プロジェクトを取得（クロスオーガナイゼーション対応）
    const projectData = await getProjectForUser(req.uid, projectId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const { project, orgId: projectOrgId } = projectData;

    // 権限チェック
    const canManage = await canManageProjectMembers(req.user, project as any, projectOrgId);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // 自組織への招待は不要
    if (targetOrgId === projectOrgId) {
      return res.status(400).json({ error: 'Cannot invite your own organization' });
    }

    // 対象組織が存在するか確認
    const targetOrgDoc = await db.collection('orgs').doc(targetOrgId).get();
    if (!targetOrgDoc.exists) {
      return res.status(404).json({ error: 'Target organization not found' });
    }

    const targetOrgData = targetOrgDoc.data();
    const targetOrgName = targetOrgData?.name || targetOrgData?.組織名 || targetOrgId;

    // 対象組織の全アクティブユーザーを取得
    const targetUsers = await listUsers({
      orgId: targetOrgId,
      isActive: true,
    });

    // 既存メンバーを取得
    const existingMembers = await listProjectMembers(projectOrgId, projectId);
    const existingEmails = new Set(
      existingMembers
        .map(member => member.email?.toLowerCase())
        .filter(Boolean) as string[]
    );
    const existingUserIds = new Set(existingMembers.map(member => member.userId));

    // 招待対象のユーザーをカウント
    const usersToInvite = targetUsers.filter(user => {
      if (existingUserIds.has(user.id)) return false;
      if (user.email && existingEmails.has(user.email.toLowerCase())) return false;
      return true;
    });

    res.json({
      targetOrgId,
      targetOrgName,
      totalMembers: targetUsers.length,
      alreadyInProject: targetUsers.length - usersToInvite.length,
      toBeInvited: usersToInvite.length,
      members: usersToInvite.map(user => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        jobTitle: user.jobTitle,
      })),
    });
  } catch (error) {
    console.error('Error previewing organization invite:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/organizations/available
 * 招待可能な組織一覧を取得（自組織以外）
 */
router.get('/organizations/available', authenticate, async (req: any, res) => {
  try {
    // 全組織を取得
    const orgsSnapshot = await db.collection('orgs').get();
    const userOrgId = req.user.orgId;

    const organizations = orgsSnapshot.docs
      .filter(doc => doc.id !== userOrgId) // 自組織を除外
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || data.組織名 || doc.id,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    res.json(organizations);
  } catch (error) {
    console.error('Error listing available organizations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
