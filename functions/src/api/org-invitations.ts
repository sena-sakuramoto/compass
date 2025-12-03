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
import { getAuth } from 'firebase-admin/auth';

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

    const { email, displayName, role, memberType, message, expiresInDays = 7, orgId: targetOrgId } = req.body;

    // 別組織への招待はsuper_adminのみ可能
    if (targetOrgId && targetOrgId !== user.orgId && user.role !== 'super_admin') {
      res.status(403).json({
        error: 'Forbidden: Only super_admin can invite users to a different organization',
      });
      return;
    }

    // super_adminは別組織に招待できる、それ以外は自分の組織のみ
    const targetOrg = user.role === 'super_admin' && targetOrgId ? targetOrgId : user.orgId;

    // 組織管理者は super_admin を招待できない、admin は admin を招待できない
    if (user.role === 'admin' && (role === 'super_admin' || role === 'admin')) {
      res.status(403).json({ error: 'Forbidden: Admin cannot invite super_admin or admin' });
      return;
    }

    // 組織のドキュメントを取得
    const orgDoc = await db.collection('orgs').doc(targetOrg).get();
    const orgName = orgDoc.exists && orgDoc.data()?.name ? orgDoc.data()!.name : targetOrg;

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
    const limitCheck = await canAddMember(targetOrg, memberType);
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
      .doc(targetOrg)
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
      .doc(targetOrg)
      .collection('invitations')
      .doc();

    const invitation: Omit<OrgInvitation, 'id'> = {
      email,
      displayName: displayName || undefined,
      orgId: targetOrg,
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

    // Firebase Authユーザーを作成してパスワードリセットメールを送信
    let firebaseUserCreated = false;
    try {
      const auth = getAuth();

      // 既存のFirebase Authユーザーをチェック
      let firebaseUser;
      try {
        firebaseUser = await auth.getUserByEmail(email);
        console.log(`[OrgInvitations] Firebase Auth user already exists: ${email}`);
      } catch (err: any) {
        // ユーザーが存在しない場合、新規作成
        if (err.code === 'auth/user-not-found') {
          console.log(`[OrgInvitations] Creating new Firebase Auth user: ${email}`);

          // 一時的なランダムパスワードを生成
          const tempPassword = Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16);

          firebaseUser = await auth.createUser({
            email: email,
            password: tempPassword,
            displayName: displayName || email.split('@')[0],
            emailVerified: false,
          });

          firebaseUserCreated = true;
          console.log(`[OrgInvitations] Created Firebase Auth user: ${firebaseUser.uid}`);

          // パスワードリセットリンクを生成
          const resetLink = await auth.generatePasswordResetLink(email);
          console.log(`[OrgInvitations] Generated password reset link for: ${email}`);

          // パスワード設定メールを送信
          try {
            const { sendPasswordSetupEmail } = await import('../lib/gmail');
            await sendPasswordSetupEmail({
              to: email,
              displayName: displayName,
              organizationName: orgName,
              resetLink: resetLink,
            });
            console.log(`[OrgInvitations] Sent password setup email to: ${email}`);
          } catch (emailError) {
            console.error(`[OrgInvitations] Failed to send password setup email:`, emailError);
            // パスワード設定メール送信失敗でも継続
          }
        } else {
          throw err;
        }
      }

      // Firestoreにユーザードキュメントを作成（存在しない場合）
      const userRef = db.collection('users').doc(firebaseUser.uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({
          email: email,
          displayName: displayName || email.split('@')[0],
          orgId: targetOrg,
          role: role,
          memberType: memberType,
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`[OrgInvitations] Created Firestore user document: ${firebaseUser.uid}`);
      }

    } catch (error) {
      console.error('[OrgInvitations] Failed to create Firebase Auth user:', error);
      // Firebase Auth作成失敗でも招待は継続（招待メールは送る）
    }

    // メール送信
    try {
      const { sendInvitationEmail } = await import('../lib/gmail');
      await sendInvitationEmail({
        to: email,
        inviterName: user.displayName || user.email,
        organizationName: orgName,
        role: role as string,
        inviteUrl: invitation.inviteLink,
        message: message,
      });
    } catch (error) {
      console.error('[OrgInvitations] Failed to send invitation email:', error);
      // メール送信失敗でも招待は成功とする
    }

    // アプリ内通知を作成（招待されたユーザーがログイン済みの場合）
    try {
      const { getUserByEmail } = await import('../lib/users');
      const invitedUser = await getUserByEmail(email);

      if (invitedUser) {
        const { createNotification } = await import('./notifications-api');
        await createNotification({
          userId: invitedUser.id,
          type: 'invitation',
          title: `${orgName}への招待`,
          message: `${user.displayName || user.email}さんから組織に招待されました`,
          actionUrl: invitation.inviteLink,
          metadata: {
            invitationId: invitationRef.id,
            inviterName: user.displayName || user.email,
            organizationName: orgName,
            role: role as string,
          },
        });
      }
    } catch (error) {
      console.error('[OrgInvitations] Failed to create in-app notification:', error);
      // 通知作成失敗でも招待は成功とする
    }

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
