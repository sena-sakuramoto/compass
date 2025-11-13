import { Router } from 'express';
import { getAuth } from 'firebase-admin/auth';
import {
  createUser,
  getUser,
  updateUser,
  listUsers,
  getUserByEmail,
  updateLastLogin,
  deactivateUser,
  activateUser,
} from '../lib/users';
import { UserInput } from '../lib/auth-types';
import { canManageUsers } from '../lib/access-control';
import { resolveAuthHeader, verifyToken } from '../lib/auth';

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

    const user = await getUser(decodedToken.uid);
    if (!user) {
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
    const { orgId, role, isActive } = req.query;

    const users = await listUsers({
      orgId,
      role,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });

    res.json(users);
  } catch (error) {
    console.error('Error listing users:', error);
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
          invitations.push({
            projectId,
            projectName: project.物件名 || projectId,
            invitedBy: member.invitedBy,
            invitedByName: member.invitedBy, // TODO: 招待者の名前を取得
            role: member.role,
            invitedAt: member.invitedAt,
            message: '', // TODO: メッセージの取得
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
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
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

export default router;

