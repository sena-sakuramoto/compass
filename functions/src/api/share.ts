import { Router } from 'express';
import { randomBytes } from 'crypto';
import { authMiddleware } from '../lib/auth';
import { db, serialize } from '../lib/firestore';
import { getUser } from '../lib/users';
import { getProjectForUser } from '../lib/access-helpers';
import admin from 'firebase-admin';

const router = Router();

// POST /api/projects/:projectId/share-link
router.post('/projects/:projectId/share-link', authMiddleware(), async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const result = await getProjectForUser(req.uid, req.params.projectId);
    if (!result) return res.status(404).json({ error: 'Project not found' });

    // 既存トークン検索
    const existing = await db.collection('share_links')
      .where('projectId', '==', req.params.projectId).limit(1).get();
    if (!existing.empty) {
      const token = existing.docs[0].id;
      return res.json({ shareToken: token, shareUrl: buildShareUrl(req, token) });
    }

    const token = randomBytes(24).toString('hex');
    await db.collection('share_links').doc(token).set({
      orgId: result.orgId,
      projectId: req.params.projectId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.uid,
    });
    res.json({ shareToken: token, shareUrl: buildShareUrl(req, token) });
  } catch (err) { next(err); }
});

// DELETE /api/projects/:projectId/share-link
router.delete('/projects/:projectId/share-link', authMiddleware(), async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const result = await getProjectForUser(req.uid, req.params.projectId);
    if (!result) return res.status(404).json({ error: 'Project not found' });

    const snap = await db.collection('share_links')
      .where('projectId', '==', req.params.projectId).get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/projects/:projectId/share-link
router.get('/projects/:projectId/share-link', authMiddleware(), async (req: any, res, next) => {
  try {
    const result = await getProjectForUser(req.uid, req.params.projectId);
    if (!result) return res.status(404).json({ error: 'Project not found' });

    const snap = await db.collection('share_links')
      .where('projectId', '==', req.params.projectId).limit(1).get();
    if (snap.empty) return res.json({ shareToken: null, shareUrl: null });

    const token = snap.docs[0].id;
    res.json({ shareToken: token, shareUrl: buildShareUrl(req, token) });
  } catch (err) { next(err); }
});

// ── 公開エンドポイント ──

const publicRouter = Router();

publicRouter.get('/share/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 32) return res.status(400).json({ error: 'Invalid token' });

    const linkDoc = await db.collection('share_links').doc(token).get();
    if (!linkDoc.exists) return res.status(404).json({ error: 'Link not found' });

    const { orgId, projectId } = linkDoc.data() as { orgId: string; projectId: string };

    const projectDoc = await db.collection('orgs').doc(orgId).collection('projects').doc(projectId).get();
    if (!projectDoc.exists) return res.status(404).json({ error: 'Project not found' });
    const project = serialize(projectDoc as any);
    if ((project as any).deletedAt) return res.status(404).json({ error: 'Project not found' });

    const tasksSnap = await db.collection('orgs').doc(orgId).collection('tasks')
      .where('projectId', '==', projectId).get();
    const tasks = tasksSnap.docs.map(doc => serialize(doc)).filter((t: any) => !t.deletedAt);

    const safeProject = {
      id: (project as any).id, 物件名: (project as any).物件名, クライアント: (project as any).クライアント,
      ステータス: (project as any).ステータス, 優先度: (project as any).優先度,
      開始日: (project as any).開始日, 予定完了日: (project as any).予定完了日,
      現地調査日: (project as any).現地調査日, 着工日: (project as any).着工日,
      竣工予定日: (project as any).竣工予定日, 引渡し予定日: (project as any).引渡し予定日,
      progressAggregate: (project as any).progressAggregate, updatedAt: (project as any).updatedAt,
    };

    const safeTasks = tasks.map((t: any) => ({
      id: t.id, projectId: t.projectId, type: t.type, parentId: t.parentId,
      orderIndex: t.orderIndex, タスク名: t.タスク名, 担当者: t.担当者, assignee: t.assignee,
      優先度: t.優先度, ステータス: t.ステータス, 予定開始日: t.予定開始日, 期限: t.期限,
      進捗率: t.進捗率, progress: t.progress, マイルストーン: t.マイルストーン,
      milestone: t.milestone, フェーズ: t.フェーズ, '依存タスク': t['依存タスク'],
      '工数見積(h)': t['工数見積(h)'], updatedAt: t.updatedAt,
    }));

    res.json({ project: safeProject, tasks: safeTasks });
  } catch (err) { next(err); }
});

function buildShareUrl(req: any, token: string): string {
  const originHeader = String(req.headers.origin || req.headers.referer || '');

  if (originHeader.includes('localhost')) {
    return `http://localhost:5173/share/${token}`;
  }

  if (originHeader.includes('compass-demo.web.app') || originHeader.includes('compass-demo.firebaseapp.com')) {
    return `https://compass-demo.web.app/share/${token}`;
  }

  return `https://compass-31e9e.web.app/share/${token}`;
}

export { router as shareAuthRouter, publicRouter as sharePublicRouter };
