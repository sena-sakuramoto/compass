import { Router } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  createUser,
  getUser,
  updateUser,
  listUsers,
  updateLastLogin,
  deactivateUser,
  activateUser,
} from '../lib/users';
import { UserInput } from '../lib/auth-types';
import { canManageUsers } from '../lib/access-control';
import { resolveAuthHeader, verifyToken, ensureUserDocument, OrgSetupRequired } from '../lib/auth';
import { canAddMember, getMemberCounts, getOrganizationLimits } from '../lib/member-limits';

const router = Router();

/**
 * 認証ミドルウェア
 */
async function authenticate(req: any, res: any, next: any) {
  try {
    const { header, sources } = resolveAuthHeader(req);
    const token = header?.startsWith('Bearer ') ? header.slice(7) : header;

    console.log('[Users][Auth]', {
      path: req.path,
      method: req.method,
      authorization: !!sources.authorization,
      forwarded: !!sources.forwarded,
      original: !!sources.original,
    });

    if (!token) {
      console.warn('[Users][Auth] No token extracted');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await verifyToken(token);
    if (!decodedToken) {
      console.warn('[Users][Auth] Token verification failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ユーザードキュメントを確保（存在しない場合は招待から作成）
    try {
      await ensureUserDocument(decodedToken.uid, decodedToken.email || '');
    } catch (error) {
      if (error instanceof OrgSetupRequired) {
        return res.status(403).json({
          error: 'Org setup required',
          code: 'ORG_SETUP_REQUIRED',
          stripeCustomerId: error.stripeCustomerId ?? null,
        });
      }
      throw error;
    }

    const user = await getUser(decodedToken.uid);
    if (!user) {
      console.warn('[Users][Auth] User not found and no invitation available');
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    console.error('[Users][Auth] Authentication error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * GET /api/users/me
 * 現在のユーザー情報を取得
 * NOTE: 特定のルートは動的ルート /:userId の前に定義する必要がある
 */
router.get('/me', authenticate, async (req: any, res) => {
  try {
    // ログイン時刻を更新
    await updateLastLogin(req.uid);

    res.json(req.user);
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users
 * ユーザー一覧を取得
 */
router.get('/', authenticate, async (req: any, res) => {
  try {
    const { role, isActive } = req.query;

    // orgIdは必須：ログインユーザーの組織のみ取得
    // super_adminはクエリパラメータで別組織を指定可能
    const targetOrgId = req.query.orgId && req.user.role === 'super_admin'
      ? req.query.orgId
      : req.user.orgId;

    const users = await listUsers({
      orgId: targetOrgId,
      role,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });

    // 組織名を追加
    const { getOrganization } = await import('../lib/users');
    const usersWithOrgName = await Promise.all(
      users.map(async (user) => {
        const org = await getOrganization(user.orgId);
        return {
          ...user,
          orgName: org?.name || user.orgId,
        };
      })
    );

    res.json(usersWithOrgName);
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users/with-collaborators
 * 自組織のメンバーと、プロジェクトで関わる他組織のメンバーを組織ごとにグループ化して取得
 */
router.get('/with-collaborators', authenticate, async (req: any, res) => {
  try {
    const db = getFirestore();

    const userOrgId = req.user.orgId;

    // 1. 自組織のユーザーを取得
    const ownOrgUsers = await listUsers({
      orgId: userOrgId,
      isActive: true,
    });

    // 組織名を取得（organizations -> orgs の順で確認）
    let ownOrgName = userOrgId;
    const ownOrgDoc = await db.collection('organizations').doc(userOrgId).get();
    if (ownOrgDoc.exists) {
      ownOrgName = ownOrgDoc.data()?.name || userOrgId;
    } else {
      const ownOrgFallbackDoc = await db.collection('orgs').doc(userOrgId).get();
      if (ownOrgFallbackDoc.exists) {
        const ownOrgData = ownOrgFallbackDoc.data();
        ownOrgName = ownOrgData?.name || ownOrgData?.組織名 || userOrgId;
      }
    }

    // 自組織のユーザーに組織名を追加
    const ownOrgUsersWithOrgName = ownOrgUsers.map(user => ({
      ...user,
      orgName: ownOrgName,
    }));

    // 2. 自組織のプロジェクト一覧を取得（対象プロジェクトID集合）
    const projectsSnapshot = await db
      .collection('orgs')
      .doc(userOrgId)
      .collection('projects')
      .get();
    const ownProjectIds = projectsSnapshot.docs.map((doc) => doc.id);
    const ownProjectIdSet = new Set(ownProjectIds);

    // 3. プロジェクトメンバーを集約取得（N+1回避）
    const projectMembersRef = db.collection('project_members');
    const memberDocsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

    // 現行データ: projectOrgId 付き
    const scopedMembersSnapshot = await projectMembersRef
      .where('projectOrgId', '==', userOrgId)
      .get();
    scopedMembersSnapshot.docs.forEach((doc) => memberDocsById.set(doc.id, doc));

    // レガシー互換: projectOrgId が欠けるデータは projectId in で補完
    for (let i = 0; i < ownProjectIds.length; i += 10) {
      const batch = ownProjectIds.slice(i, i + 10);
      const legacyBatchSnapshot = await projectMembersRef
        .where('projectId', 'in', batch)
        .get();
      legacyBatchSnapshot.docs.forEach((doc) => {
        if (!memberDocsById.has(doc.id)) {
          memberDocsById.set(doc.id, doc);
        }
      });
    }

    const memberRows = Array.from(memberDocsById.values()).map((doc) => doc.data() as any);

    // projectOrgId が欠ける場合の判定補完（invitedBy -> users/{uid}.orgId）
    const legacyInviterIds = Array.from(
      new Set(
        memberRows
          .filter((member) => !member.projectOrgId && member.invitedBy)
          .map((member) => String(member.invitedBy))
      )
    );
    const inviterOrgMap = new Map<string, string>();
    if (legacyInviterIds.length > 0) {
      const inviterDocs = await db.getAll(
        ...legacyInviterIds.map((uid) => db.collection('users').doc(uid))
      );
      inviterDocs.forEach((doc) => {
        if (!doc.exists) return;
        const data = doc.data() as any;
        if (typeof data?.orgId === 'string' && data.orgId) {
          inviterOrgMap.set(doc.id, data.orgId);
        }
      });
    }

    const ownOrgUserIds = new Set(ownOrgUsers.map((user) => user.id));
    const candidateRows: any[] = [];
    const candidateEmails = new Set<string>();

    for (const member of memberRows) {
      const resolvedProjectOrgId =
        (typeof member.projectOrgId === 'string' && member.projectOrgId) ||
        inviterOrgMap.get(String(member.invitedBy || '')) ||
        (typeof member.orgId === 'string' ? member.orgId : null);

      if (resolvedProjectOrgId !== userOrgId) continue;
      if (!ownProjectIdSet.has(String(member.projectId || ''))) continue;

      const memberUserId = typeof member.userId === 'string' ? member.userId : '';
      if (member.orgId === userOrgId) continue;
      if (memberUserId && ownOrgUserIds.has(memberUserId)) continue;
      if (memberUserId.startsWith('text_') || memberUserId.startsWith('external_')) continue;

      const normalizedEmail =
        typeof member.email === 'string' ? member.email.trim().toLowerCase() : '';
      if (normalizedEmail) {
        candidateEmails.add(normalizedEmail);
      }

      candidateRows.push({
        member,
        normalizedEmail,
      });
    }

    // メールアドレスを in クエリでバッチ取得（N+1回避）
    const usersByEmail = new Map<string, any>();
    const emailList = Array.from(candidateEmails);
    for (let i = 0; i < emailList.length; i += 10) {
      const batch = emailList.slice(i, i + 10);
      const usersSnapshot = await db
        .collection('users')
        .where('email', 'in', batch)
        .get();

      usersSnapshot.docs.forEach((doc) => {
        const data = doc.data() as any;
        const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
        if (!email) return;
        usersByEmail.set(email, {
          id: doc.id,
          ...data,
        });
      });
    }

    const enrichedRows = candidateRows.map(({ member, normalizedEmail }) => {
      const userInfo = normalizedEmail ? usersByEmail.get(normalizedEmail) ?? null : null;
      const targetOrgId =
        (typeof userInfo?.orgId === 'string' && userInfo.orgId) ||
        (typeof member.orgId === 'string' && member.orgId) ||
        'unknown';

      return { member, userInfo, targetOrgId };
    });

    // 外部組織名をまとめて解決
    const orgNames = new Map<string, string>();
    orgNames.set(userOrgId, ownOrgName);
    const targetOrgIds = Array.from(
      new Set(
        enrichedRows
          .map((row) => row.targetOrgId)
          .filter((orgId) => orgId && orgId !== userOrgId)
      )
    );
    if (targetOrgIds.length > 0) {
      const organizationDocs = await db.getAll(
        ...targetOrgIds.map((orgId) => db.collection('organizations').doc(orgId))
      );
      organizationDocs.forEach((doc) => {
        if (!doc.exists) return;
        const data = doc.data() as any;
        orgNames.set(doc.id, data?.name || doc.id);
      });
    }
    for (const orgId of targetOrgIds) {
      if (orgNames.has(orgId)) continue;
      const orgDoc = await db.collection('orgs').doc(orgId).get();
      if (orgDoc.exists) {
        const orgData = orgDoc.data() as any;
        orgNames.set(orgId, orgData?.name || orgData?.組織名 || orgId);
      } else {
        orgNames.set(orgId, orgId);
      }
    }

    // 外部ユーザーを orgId ごとに集約
    const externalUsersByOrg = new Map<string, Map<string, any>>(); // orgId -> userKey -> user
    for (const row of enrichedRows) {
      const { member, userInfo, targetOrgId } = row;
      if (!targetOrgId || targetOrgId === userOrgId) continue;

      if (!externalUsersByOrg.has(targetOrgId)) {
        externalUsersByOrg.set(targetOrgId, new Map());
      }
      const orgUserMap = externalUsersByOrg.get(targetOrgId)!;

      const fallbackKey =
        (typeof member.userId === 'string' && member.userId) ||
        (typeof member.email === 'string' && member.email.trim().toLowerCase()) ||
        '';
      const userIdKey = (userInfo?.id || fallbackKey) as string;
      if (!userIdKey || orgUserMap.has(userIdKey)) continue;

      orgUserMap.set(userIdKey, {
        id: userInfo?.id || fallbackKey,
        email: userInfo?.email || member.email || '',
        displayName: userInfo?.displayName || member.displayName || '',
        orgId: targetOrgId,
        orgName: orgNames.get(targetOrgId) || targetOrgId,
        role: userInfo?.role || 'external',
        jobTitle: userInfo?.jobTitle || member.jobTitle || '',
        department: userInfo?.department || '',
        phoneNumber: userInfo?.phoneNumber || '',
        photoURL: userInfo?.photoURL || '',
        isActive: userInfo?.isActive ?? true,
        memberType: userInfo?.memberType || 'external',
        projectRole: member.role,
        projectJobTitle: member.jobTitle,
      });
    }

    // 4. 結果を組織ごとにグループ化して返す
    const groupedUsers: {
      ownOrg: {
        orgId: string;
        orgName: string;
        users: any[];
      };
      collaboratingOrgs: Array<{
        orgId: string;
        orgName: string;
        users: any[];
      }>;
    } = {
      ownOrg: {
        orgId: userOrgId,
        orgName: ownOrgName,
        users: ownOrgUsersWithOrgName,
      },
      collaboratingOrgs: [],
    };

    // 外部組織をソートして追加
    const sortedOrgIds = Array.from(externalUsersByOrg.keys()).sort((a, b) => {
      const nameA = orgNames.get(a) || a;
      const nameB = orgNames.get(b) || b;
      return nameA.localeCompare(nameB, 'ja');
    });

    for (const orgId of sortedOrgIds) {
      const userMap = externalUsersByOrg.get(orgId)!;
      const users = Array.from(userMap.values()).sort((a, b) =>
        (a.displayName || '').localeCompare(b.displayName || '', 'ja')
      );

      groupedUsers.collaboratingOrgs.push({
        orgId,
        orgName: orgNames.get(orgId) || orgId,
        users,
      });
    }

    res.json(groupedUsers);
  } catch (error) {
    console.error('Error listing users with collaborators:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users/:userId/invitations
 * ユーザーのプロジェクト招待一覧を取得
 * NOTE: 動的ルート /:userId より前に定義する必要がある
 */
router.get('/:userId/invitations', authenticate, async (req: any, res) => {
  try {
    const { userId } = req.params;

    // 自分自身の招待のみ取得可能
    if (req.uid !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { listUserProjects } = await import('../lib/project-members');
    const { getProject } = await import('../lib/firestore');

    // ユーザーが参加しているプロジェクトを取得
    const projects = await listUserProjects(req.user.orgId, userId);

    // 招待中のプロジェクトのみをフィルタリング
    const invitations = [];
    for (const { projectId, member } of projects) {
      if (member.status === 'invited') {
        const project = await getProject(req.user.orgId, projectId);
        if (project) {
          // 招待者の名前を取得
          let inviterName = member.invitedBy;
          if (member.invitedBy) {
            const inviter = await getUser(member.invitedBy);
            if (inviter) {
              inviterName = inviter.displayName || inviter.email || member.invitedBy;
            }
          }

          invitations.push({
            projectId,
            projectName: project.物件名 || projectId,
            invitedBy: member.invitedBy,
            invitedByName: inviterName,
            role: member.role,
            invitedAt: member.invitedAt,
            message: member.message || '',
          });
        }
      }
    }

    res.json(invitations);
  } catch (error) {
    console.error('Error getting user invitations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users/:userId
 * ユーザー詳細を取得
 */
router.get('/:userId', authenticate, async (req: any, res) => {
  try {
    const { userId } = req.params;

    const user = await getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/users
 * ユーザーを作成（管理者のみ）
 */
router.post('/', authenticate, async (req: any, res) => {
  try {
    // 権限チェック
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const input: UserInput = req.body;

    // Firebase Authにユーザーを作成
    const userRecord = await getAuth().createUser({
      email: input.email,
      displayName: input.displayName,
      emailVerified: false,
    });

    // Firestoreにユーザー情報を保存
    const user = await createUser(userRecord.uid, input);

    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/users/:userId
 * ユーザーを更新
 */
router.patch('/:userId', authenticate, async (req: any, res) => {
  try {
    const { userId } = req.params;

    // req.userが存在することを確認
    if (!req.user) {
      console.error('[Users API] req.user is undefined');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // 自分自身または管理者のみ更新可能
    if (req.uid !== userId && !canManageUsers(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updates = req.body;

    // 管理者以外はロールを変更できない
    if (updates.role && !canManageUsers(req.user)) {
      delete updates.role;
    }

    await updateUser(userId, updates);

    const updatedUser = await getUser(userId);
    res.json(updatedUser);
  } catch (error) {
    console.error('[Users API] Error updating user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/users/:userId/deactivate
 * ユーザーを非アクティブ化（管理者のみ）
 */
router.post('/:userId/deactivate', authenticate, async (req: any, res) => {
  try {
    const { userId } = req.params;

    // 権限チェック
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await deactivateUser(userId);

    const updatedUser = await getUser(userId);
    res.json(updatedUser);
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/users/:userId/activate
 * ユーザーをアクティブ化（管理者のみ）
 */
router.post('/:userId/activate', authenticate, async (req: any, res) => {
  try {
    const { userId } = req.params;

    // 権限チェック
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await activateUser(userId);

    const updatedUser = await getUser(userId);
    res.json(updatedUser);
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/users/:userId
 * ユーザーを削除（管理者のみ）
 */
router.delete('/:userId', authenticate, async (req: any, res) => {
  try {
    const { userId } = req.params;

    // req.userが存在することを確認
    if (!req.user) {
      console.error('[Users API] req.user is undefined');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // 権限チェック
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // 自分自身は削除できない
    if (req.uid === userId) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Firebase Authからユーザーを削除
    await getAuth().deleteUser(userId);

    // Firestoreからユーザー情報を削除
    const db = getFirestore();
    await db.collection('users').doc(userId).delete();

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

