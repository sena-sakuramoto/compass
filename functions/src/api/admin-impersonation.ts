import { Router } from 'express';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';
import { db } from '../lib/firestore';

const router = Router();

router.use(authMiddleware());

/**
 * POST /api/admin/impersonate/:orgId
 * 組織をなりすまし（super_admin専用）
 *
 * super_adminが他の組織を「幽霊のように」閲覧・操作できる機能
 */
router.post('/impersonate/:orgId', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // super_admin のみ許可
    if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Only super_admin can impersonate organizations' });
    }

    const { orgId } = req.params;

    // 組織が存在するか確認
    const orgDoc = await db.collection('orgs').doc(orgId).get();
    if (!orgDoc.exists) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // ユーザーのimpersonatingOrgIdを更新
    await db.collection('users').doc(req.uid).update({
      impersonatingOrgId: orgId,
      updatedAt: new Date(),
    });

    console.log(`[Impersonation] User ${user.email} (${req.uid}) is now impersonating org: ${orgId}`);

    res.json({
      success: true,
      impersonatingOrgId: orgId,
      message: `Now impersonating organization: ${orgId}`,
    });
  } catch (error) {
    console.error('[Impersonation] Error:', error);
    next(error);
  }
});

/**
 * DELETE /api/admin/impersonate
 * なりすましを解除
 */
router.delete('/impersonate', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // super_admin のみ許可
    if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Only super_admin can manage impersonation' });
    }

    if (!user.impersonatingOrgId) {
      return res.status(400).json({ error: 'Not currently impersonating any organization' });
    }

    const previousOrgId = user.impersonatingOrgId;

    // impersonatingOrgIdを削除
    await db.collection('users').doc(req.uid).update({
      impersonatingOrgId: null,
      updatedAt: new Date(),
    });

    console.log(`[Impersonation] User ${user.email} (${req.uid}) stopped impersonating org: ${previousOrgId}`);

    res.json({
      success: true,
      message: `Stopped impersonating organization: ${previousOrgId}`,
    });
  } catch (error) {
    console.error('[Impersonation] Error:', error);
    next(error);
  }
});

/**
 * GET /api/admin/impersonate/status
 * 現在のなりすまし状態を取得
 */
router.get('/impersonate/status', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // super_admin のみ許可
    if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Only super_admin can check impersonation status' });
    }

    res.json({
      impersonating: !!user.impersonatingOrgId,
      impersonatingOrgId: user.impersonatingOrgId || null,
      originalOrgId: user.orgId,
    });
  } catch (error) {
    console.error('[Impersonation] Error:', error);
    next(error);
  }
});

export default router;
