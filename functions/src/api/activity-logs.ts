import { Router } from 'express';
import { listActivityLogs } from '../lib/activity-log';
import { resolveAuthHeader, verifyToken } from '../lib/auth';
import { getUser } from '../lib/users';

const router = Router();

/**
 * 認証ミドルウェア
 */
async function authenticate(req: any, res: any, next: any) {
  try {
    const { header } = resolveAuthHeader(req);
    const token = header?.startsWith('Bearer ') ? header.slice(7) : header;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await verifyToken(token);
    if (!decodedToken) {
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
    console.error('[ActivityLogs][Auth] Authentication error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * GET /api/activity-logs
 * アクティビティログ一覧を取得
 */
router.get('/activity-logs', authenticate, async (req: any, res) => {
  try {
    const { projectId, taskId, userId, limit } = req.query;

    const logs = await listActivityLogs({
      orgId: req.user.orgId,
      projectId: projectId || undefined,
      taskId: taskId || undefined,
      userId: userId || undefined,
      limit: limit ? parseInt(limit) : 50,
    });

    res.json({ logs });
  } catch (error) {
    console.error('Error listing activity logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
