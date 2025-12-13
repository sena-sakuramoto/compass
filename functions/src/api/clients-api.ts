import { Router } from 'express';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';
import { ensureFirebaseAdmin } from '../lib/firebaseAdmin';

ensureFirebaseAdmin();

const router = Router();
const db = getFirestore();

router.use(authMiddleware());

/**
 * GET /api/clients
 * クライアント一覧を取得（クロスオーガナイゼーション対応）
 */
router.get('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // アクセス可能な組織のIDを収集
    const accessibleOrgIds = new Set<string>();
    accessibleOrgIds.add(user.orgId); // 自組織

    // ユーザーが参加しているプロジェクトを取得してプロジェクト所有組織を特定
    const { listUserProjects } = await import('../lib/project-members');
    const userProjectMemberships = await listUserProjects(null, req.uid);

    // プロジェクトの所有組織IDを収集
    for (const membership of userProjectMemberships) {
      if (membership.project?.ownerOrgId) {
        accessibleOrgIds.add(membership.project.ownerOrgId);
      }
    }

    // 各組織のクライアントを取得
    const clientsMap = new Map<string, any>();

    for (const orgId of accessibleOrgIds) {
      const clientsSnapshot = await db
        .collection('orgs')
        .doc(orgId)
        .collection('clients')
        .orderBy('name', 'asc')
        .get();

      clientsSnapshot.docs.forEach((doc) => {
        const clientId = doc.id;
        // 既に存在しない場合のみ追加（自組織のデータを優先）
        if (!clientsMap.has(clientId)) {
          clientsMap.set(clientId, {
            id: clientId,
            ...doc.data(),
          });
        }
      });
    }

    const clients = Array.from(clientsMap.values());
    res.json({ clients });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/clients
 * 新規クライアントを作成
 */
router.post('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    // 重複チェック
    const existingSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('clients')
      .where('name', '==', name.trim())
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(400).json({ error: 'Client already exists' });
    }

    // クライアントを作成
    const now = Timestamp.now();
    const clientRef = db
      .collection('orgs')
      .doc(user.orgId)
      .collection('clients')
      .doc();

    const client = {
      id: clientRef.id,
      name: name.trim(),
      createdAt: now,
      createdBy: req.uid,
      updatedAt: now,
    };

    await clientRef.set(client);

    res.status(201).json(client);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/clients/:id
 * クライアントを更新
 */
router.patch('/:id', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 管理者・PMのみ更新可能
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'project_manager') {
      return res.status(403).json({ error: 'Forbidden: Only admins and PMs can update clients' });
    }

    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    // 重複チェック（自分以外）
    const existingSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('clients')
      .where('name', '==', name.trim())
      .limit(2)
      .get();

    const duplicates = existingSnapshot.docs.filter(doc => doc.id !== id);
    if (duplicates.length > 0) {
      return res.status(400).json({ error: 'Client with this name already exists' });
    }

    const clientRef = db
      .collection('orgs')
      .doc(user.orgId)
      .collection('clients')
      .doc(id);

    const clientDoc = await clientRef.get();
    if (!clientDoc.exists) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const now = Timestamp.now();
    await clientRef.update({
      name: name.trim(),
      updatedAt: now,
    });

    const updated = await clientRef.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/clients/:id
 * クライアントを削除
 */
router.delete('/:id', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 管理者のみ削除可能
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Only admins can delete clients' });
    }

    const { id } = req.params;

    await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('clients')
      .doc(id)
      .delete();

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
