import { Router } from 'express';
import { listActivityLogs } from '../lib/activity-log';
import { resolveAuthHeader, verifyToken, ensureUserDocument, OrgSetupRequired } from '../lib/auth';
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
 * アクティビティログ一覧を取得（クロスオーガナイゼーション対応）
 */
router.get('/activity-logs', authenticate, async (req: any, res) => {
  try {
    const { projectId, taskId, userId, limit } = req.query;

    // ユーザーが参加しているプロジェクトを取得
    const { listUserProjects } = await import('../lib/project-members');
    const userProjectMemberships = await listUserProjects(null, req.uid);

    // プロジェクトごとにグループ化（組織別）
    const resolveProjectOrgId = (membership: any) =>
      membership.project?.ownerOrgId ||
      membership.member.projectOrgId ||
      membership.member.orgId;
    const orgIds = new Set(userProjectMemberships.map(resolveProjectOrgId));
    const allLogs: any[] = [];

    // 各組織からログを取得
    for (const orgId of orgIds) {
      const logs = await listActivityLogs({
        orgId,
        projectId: projectId || undefined,
        taskId: taskId || undefined,
        userId: userId || undefined,
        limit: limit ? parseInt(limit) : 50,
      });

      // ユーザーがアクセスできるプロジェクトのログのみフィルタ
      const accessibleProjectIds = userProjectMemberships
        .filter(m => resolveProjectOrgId(m) === orgId)
        .map(m => m.projectId);

      const filteredLogs = logs.filter(log =>
        !log.projectId || accessibleProjectIds.includes(log.projectId)
      );

      allLogs.push(...filteredLogs);
    }

    // 時刻でソート（新しい順）
    allLogs.sort((a, b) => {
      const timeA = a.timestamp?._seconds || 0;
      const timeB = b.timestamp?._seconds || 0;
      return timeB - timeA;
    });

    // limit 適用
    const limitNum = limit ? parseInt(limit) : 50;
    const limitedLogs = allLogs.slice(0, limitNum);

    res.json({ logs: limitedLogs });
  } catch (error) {
    console.error('Error listing activity logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
