import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';
import { db } from '../lib/firestore';

const router = Router();

router.use(authMiddleware());

// 全組織を取得（super_adminのみ）
router.get('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: super_admin role required' });
    }

    const orgsSnapshot = await db.collection('orgs').get();
    const organizations = orgsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(organizations);
  } catch (error) {
    next(error);
  }
});

// 新しい組織を作成（super_adminのみ）
const createOrgSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Organization ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
});

router.post('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: super_admin role required' });
    }

    const payload = createOrgSchema.parse(req.body);

    // 組織IDの重複チェック
    const existingOrg = await db.collection('orgs').doc(payload.id).get();
    if (existingOrg.exists) {
      return res.status(400).json({ error: 'Organization ID already exists' });
    }

    // 組織を作成
    const orgData = {
      name: payload.name,
      ownerId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('orgs').doc(payload.id).set(orgData);

    res.status(201).json({
      id: payload.id,
      ...orgData,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
