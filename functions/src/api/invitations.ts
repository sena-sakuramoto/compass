// プロジェクト招待API

import express from 'express';
import { authMiddleware } from '../lib/auth';
import {
  createInvitation,
  listInvitations,
  getInvitation,
  acceptInvitation,
  declineInvitation,
  deleteInvitation,
  getUser,
  listProjects,
  getProject,
} from '../lib/firestore';
import type { ProjectInvitationInput } from '../lib/types';

const router = express.Router();

router.use(authMiddleware());

/**
 * GET /api/invitations
 * 組織の招待一覧を取得（管理者のみ）
 */
router.get('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // orgIdの存在チェック
    if (!user.orgId) {
      res.status(400).json({ error: 'User has no organization' });
      return;
    }

    // 管理者権限チェック
    const orgAccess = user.organizations?.[user.orgId];
    if (!orgAccess || (orgAccess.role !== 'owner' && orgAccess.role !== 'admin')) {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    const invitations = await listInvitations(user.orgId);
    res.json({ invitations });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/invitations
 * プロジェクト招待を作成（管理者のみ）
 */
router.post('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // orgIdの存在チェック
    if (!user.orgId) {
      res.status(400).json({ error: 'User has no organization' });
      return;
    }

    // 管理者権限チェック
    const orgAccess = user.organizations?.[user.orgId];
    if (!orgAccess || (orgAccess.role !== 'owner' && orgAccess.role !== 'admin')) {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    const { email, projectId, role, message } = req.body;

    if (!email || !projectId) {
      res.status(400).json({ error: 'Missing required fields: email, projectId' });
      return;
    }

    // プロジェクト存在確認とメンバーシップチェック
    const { listUserProjects } = await import('../lib/project-members');
    const userProjectMemberships = await listUserProjects(null, req.uid);
    const projectMembership = userProjectMemberships.find(m => m.projectId === projectId);

    if (!projectMembership) {
      res.status(404).json({ error: 'Project not found or you are not a member' });
      return;
    }

    // プロジェクト詳細を取得
    const project = await getProject(projectMembership.member.orgId, projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // 組織名をFirestoreから取得
    const { db } = await import('../lib/firestore');
    const orgDoc = await db.collection('orgs').doc(user.orgId).get();
    const orgName = orgDoc.exists && orgDoc.data()?.name ? orgDoc.data()!.name : user.orgId;

    const appUrl = process.env.APP_URL || 'https://compass-31e9e.web.app';
    const inviteUrl = `${appUrl}/projects/${projectId}`;

    const invitationData: ProjectInvitationInput = {
      email,
      projectId,
      projectName: project.物件名,
      orgId: user.orgId,
      orgName,
      invitedBy: req.uid,
      invitedByName: user.displayName || user.email,
      role: role || 'guest',
      message: message || null,
    };

    const invitationId = await createInvitation(invitationData, user.orgId);

    // 招待メールを送信
    try {
      const { sendInvitationEmail } = await import('../lib/gmail');
      await sendInvitationEmail({
        to: email,
        inviterName: user.displayName || user.email,
        organizationName: orgName,
        projectName: project.物件名,
        role: role || 'guest',
        inviteUrl,
        message: message || undefined,
      });
      console.log(`[Invitations] Sent project invitation email to ${email}`);
    } catch (error) {
      console.error('[Invitations] Failed to send invitation email:', error);
      // メール送信失敗でも招待自体は成功とする
    }

    res.status(201).json({
      success: true,
      invitationId,
      message: 'Invitation created successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/invitations/:id
 * 招待詳細を取得
 */
router.get('/:id', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!user.orgId) {
      res.status(400).json({ error: 'User has no organization' });
      return;
    }

    const invitation = await getInvitation(req.params.id, user.orgId);
    if (!invitation) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    // ユーザーが招待の当事者または管理者であることを確認
    const orgAccess = user.organizations?.[user.orgId];
    const isAdmin = orgAccess && (orgAccess.role === 'owner' || orgAccess.role === 'admin');
    const isInvitee = invitation.email === user.email;

    if (!isAdmin && !isInvitee) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.json({ invitation });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/invitations/:id/accept
 * 招待を承認
 */
router.post('/:id/accept', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!user.orgId) {
      res.status(400).json({ error: 'User has no organization' });
      return;
    }

    const invitation = await getInvitation(req.params.id, user.orgId);
    if (!invitation) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    // 招待されたユーザー本人であることを確認
    if (invitation.email !== user.email) {
      res.status(403).json({ error: 'Forbidden: This invitation is not for you' });
      return;
    }

    if (invitation.status !== 'pending') {
      res.status(400).json({ error: `Invitation is already ${invitation.status}` });
      return;
    }

    await acceptInvitation(req.params.id, req.uid, user.orgId);

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
    });
  } catch (err: any) {
    if (err.message === 'Invitation has expired') {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

/**
 * POST /api/invitations/:id/decline
 * 招待を拒否
 */
router.post('/:id/decline', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!user.orgId) {
      res.status(400).json({ error: 'User has no organization' });
      return;
    }

    const invitation = await getInvitation(req.params.id, user.orgId);
    if (!invitation) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    // 招待されたユーザー本人であることを確認
    if (invitation.email !== user.email) {
      res.status(403).json({ error: 'Forbidden: This invitation is not for you' });
      return;
    }

    if (invitation.status !== 'pending') {
      res.status(400).json({ error: `Invitation is already ${invitation.status}` });
      return;
    }

    await declineInvitation(req.params.id, user.orgId);

    res.json({
      success: true,
      message: 'Invitation declined',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/invitations/:id
 * 招待を削除（キャンセル）- 管理者のみ
 */
router.delete('/:id', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!user.orgId) {
      res.status(400).json({ error: 'User has no organization' });
      return;
    }

    // 管理者権限チェック
    const orgAccess = user.organizations?.[user.orgId];
    if (!orgAccess || (orgAccess.role !== 'owner' && orgAccess.role !== 'admin')) {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    const invitation = await getInvitation(req.params.id, user.orgId);
    if (!invitation) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    await deleteInvitation(req.params.id, user.orgId);

    res.json({
      success: true,
      message: 'Invitation deleted',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
