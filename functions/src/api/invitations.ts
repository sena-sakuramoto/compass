// プロジェクト招待API

import express from 'express';
import {
  createInvitation,
  listInvitations,
  getInvitation,
  acceptInvitation,
  declineInvitation,
  deleteInvitation,
  getUser,
  listProjects,
} from '../lib/firestore';
import type { ProjectInvitationInput } from '../lib/types';

const router = express.Router();

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

    // プロジェクト存在確認
    const projects = await listProjects(user.orgId);
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // TODO: Get organization name from Firestore
    const orgName = user.orgId; // Placeholder

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

    // TODO: Send invitation email

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
