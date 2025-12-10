import { Router } from 'express';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';

const router = Router();
const db = getFirestore();

router.use(authMiddleware());

/**
 * GET /api/collaborators
 * 協力者一覧を取得（クロスオーガナイゼーション対応）
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

    // 各組織の協力者を取得
    const collaboratorsMap = new Map<string, any>();

    for (const orgId of accessibleOrgIds) {
      const collaboratorsSnapshot = await db
        .collection('orgs')
        .doc(orgId)
        .collection('collaborators')
        .orderBy('name', 'asc')
        .get();

      collaboratorsSnapshot.docs.forEach((doc) => {
        const collaboratorId = doc.id;
        // 既に存在しない場合のみ追加（自組織のデータを優先）
        if (!collaboratorsMap.has(collaboratorId)) {
          collaboratorsMap.set(collaboratorId, {
            id: collaboratorId,
            ...doc.data(),
          });
        }
      });
    }

    const collaborators = Array.from(collaboratorsMap.values());
    res.json({ collaborators });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/collaborators
 * 新規協力者を作成
 */
router.post('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Collaborator name is required' });
    }

    // 重複チェック
    const existingSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('collaborators')
      .where('name', '==', name.trim())
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(400).json({ error: 'Collaborator already exists' });
    }

    // 協力者を作成
    const now = Timestamp.now();
    const collaboratorRef = db
      .collection('orgs')
      .doc(user.orgId)
      .collection('collaborators')
      .doc();

    const collaborator = {
      id: collaboratorRef.id,
      name: name.trim(),
      createdAt: now,
      createdBy: req.uid,
      updatedAt: now,
    };

    await collaboratorRef.set(collaborator);

    res.status(201).json(collaborator);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/collaborators/:id
 * 協力者を更新
 */
router.patch('/:id', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 管理者・PMのみ更新可能
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'project_manager') {
      return res.status(403).json({ error: 'Forbidden: Only admins and PMs can update collaborators' });
    }

    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Collaborator name is required' });
    }

    // 重複チェック（自分以外）
    const existingSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('collaborators')
      .where('name', '==', name.trim())
      .limit(2)
      .get();

    const duplicates = existingSnapshot.docs.filter(doc => doc.id !== id);
    if (duplicates.length > 0) {
      return res.status(400).json({ error: 'Collaborator with this name already exists' });
    }

    const collaboratorRef = db
      .collection('orgs')
      .doc(user.orgId)
      .collection('collaborators')
      .doc(id);

    const collaboratorDoc = await collaboratorRef.get();
    if (!collaboratorDoc.exists) {
      return res.status(404).json({ error: 'Collaborator not found' });
    }

    const now = Timestamp.now();
    await collaboratorRef.update({
      name: name.trim(),
      updatedAt: now,
    });

    const updated = await collaboratorRef.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/collaborators/:id
 * 協力者を削除
 */
router.delete('/:id', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 管理者のみ削除可能
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Only admins can delete collaborators' });
    }

    const { id } = req.params;

    await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('collaborators')
      .doc(id)
      .delete();

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
