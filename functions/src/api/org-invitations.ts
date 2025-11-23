/**
 * 組織メンバー招待API
 */

import express from 'express';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/firestore';
import { canInviteMembers, canAddMember, getMemberCounts, getOrganizationLimits } from '../lib/member-limits';
import type { MemberType } from '../lib/auth-types';
import type { Role } from '../lib/roles';
import { db, FieldValue } from '../lib/firestore';

const router = express.Router();

router.use(authMiddleware());

interface OrgInvitation {
  id: string;
  email: string;
  displayName?: string;
  orgId: string;
  role: Role;
  memberType: MemberType;
  invitedBy: string;
  invitedByName: string;
  invitedAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  inviteLink?: string;
  message?: string;
}

/**
 * GET /api/org-invitations
 * 組織の招待一覧を取得（admin, project_managerのみ）
 */
router.get('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // 招待権限チェック
    if (!user.role || !canInviteMembers(user.role)) {
      res.status(403).json({ error: 'Forbidden: No permission to view invitations' });
      return;
    }

    // 招待一覧を取得
    const invitationsSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('invitations')
      .orderBy('invitedAt', 'desc')
      .get();

    const invitations = invitationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(invitations);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/org-invitations
 * 組織メンバー招待を作成（admin, project_managerのみ）
 */
router.post('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // 招待権限チェック
    if (!user.role || !canInviteMembers(user.role)) {
      res.status(403).json({ error: 'Forbidden: No permission to invite members' });
      return;
    }

    const { email, displayName, role, memberType, message, expiresInDays = 7 } = req.body;

    // 必須フィールドのチェック
    if (!email || !role || !memberType) {
      res.status(400).json({ error: 'Missing required fields: email, role, memberType' });
      return;
    }

    // memberTypeの検証
    if (memberType !== 'member' && memberType !== 'guest') {
      res.status(400).json({ error: 'Invalid memberType. Must be "member" or "guest"' });
      return;
    }

    // 人数制限チェック
    const limitCheck = await canAddMember(user.orgId, memberType);
    if (!limitCheck.canAdd) {
      res.status(400).json({
        error: limitCheck.reason,
        current: limitCheck.current,
        max: limitCheck.max,
      });
      return;
    }

    // 既存の招待または既存ユーザーをチェック
    const existingUserSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('users')
      .where('email', '==', email)
      .get();

    if (!existingUserSnapshot.empty) {
      res.status(400).json({ error: 'User with this email already exists in the organization' });
      return;
    }

    // 有効期限を計算
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

    // 招待を作成
    const invitationRef = db
      .collection('orgs')
      .doc(user.orgId)
      .collection('invitations')
      .doc();

    const invitation: Omit<OrgInvitation, 'id'> = {
      email,
      displayName: displayName || undefined,
      orgId: user.orgId,
      role: role as Role,
      memberType: memberType as MemberType,
      invitedBy: req.uid,
      invitedByName: user.displayName || user.email,
      invitedAt: FieldValue.serverTimestamp() as any,
      expiresAt: expiresAt as any,
      status: 'pending',
      message: message || undefined,
      // TODO: 招待リンク生成
      inviteLink: `${process.env.APP_URL || 'https://compass-31e9e.web.app'}/invite/${invitationRef.id}`,
    };

    await invitationRef.set(invitation);

    // TODO: メール送信

    res.status(201).json({
      id: invitationRef.id,
      ...invitation,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/org-invitations/stats
 * 現在のメンバー/ゲスト数と上限を取得
 */
router.get('/stats', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const counts = await getMemberCounts(user.orgId);
    const limits = await getOrganizationLimits(user.orgId);

    res.json({
      members: {
        current: counts.members,
        max: limits.maxMembers,
        available: limits.maxMembers - counts.members,
      },
      guests: {
        current: counts.guests,
        max: limits.maxGuests,
        available: limits.maxGuests - counts.guests,
      },
      total: counts.total,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/org-invitations/:id
 * 招待を取り消し
 */
router.delete('/:id', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // 招待権限チェック
    if (!user.role || !canInviteMembers(user.role)) {
      res.status(403).json({ error: 'Forbidden: No permission to revoke invitations' });
      return;
    }

    const invitationRef = db
      .collection('orgs')
      .doc(user.orgId)
      .collection('invitations')
      .doc(req.params.id);

    const invitationDoc = await invitationRef.get();
    if (!invitationDoc.exists) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    // 招待を削除または取り消し状態に更新
    await invitationRef.update({
      status: 'revoked',
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: 'Invitation revoked successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
