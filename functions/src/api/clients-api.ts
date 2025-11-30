import { Router } from 'express';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';

const router = Router();
const db = getFirestore();

router.use(authMiddleware());

/**
 * GET /api/clients
 * クライアント一覧を取得
 */
router.get('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 組織のクライアント一覧を取得
    const clientsSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('clients')
      .orderBy('name', 'asc')
      .get();

    const clients = clientsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

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
