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

    // メールアドレスがある協力者については、既存ユーザーを検索して組織情報を追加
    const { getUserByEmail } = await import('../lib/users');
    for (const collaborator of collaborators) {
      if (collaborator.email && collaborator.email.trim()) {
        try {
          const existingUser = await getUserByEmail(collaborator.email.trim());
          if (existingUser) {
            // 組織名を取得
            let orgName = '組織';
            try {
              const orgDoc = await db.collection('orgs').doc(existingUser.orgId).get();
              if (orgDoc.exists) {
                const orgData = orgDoc.data();
                orgName = orgData?.name || orgData?.組織名 || '組織';
              }
            } catch (orgErr) {
              // 組織名が取得できない場合はデフォルト値を使用
            }

            collaborator.linkedUser = {
              orgId: existingUser.orgId,
              orgName,
              displayName: existingUser.displayName,
            };
          }
        } catch (err) {
          // ユーザーが見つからない場合はスキップ
        }
      }
    }

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

    const { name, email, company, jobTitle, phoneNumber, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Collaborator name is required' });
    }

    // 重複チェック（名前またはメールアドレス）
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

    // メールアドレスが提供されている場合、重複チェック
    if (email && email.trim()) {
      const emailSnapshot = await db
        .collection('orgs')
        .doc(user.orgId)
        .collection('collaborators')
        .where('email', '==', email.trim().toLowerCase())
        .limit(1)
        .get();

      if (!emailSnapshot.empty) {
        return res.status(400).json({ error: 'Collaborator with this email already exists' });
      }
    }

    // 協力者を作成
    const now = Timestamp.now();
    const collaboratorRef = db
      .collection('orgs')
      .doc(user.orgId)
      .collection('collaborators')
      .doc();

    const collaborator: any = {
      id: collaboratorRef.id,
      name: name.trim(),
      createdAt: now,
      createdBy: req.uid,
      updatedAt: now,
    };

    // オプションフィールドを追加
    if (email && email.trim()) {
      collaborator.email = email.trim().toLowerCase();
    }
    if (company && company.trim()) {
      collaborator.company = company.trim();
    }
    if (jobTitle && jobTitle.trim()) {
      collaborator.jobTitle = jobTitle.trim();
    }
    if (phoneNumber && phoneNumber.trim()) {
      collaborator.phoneNumber = phoneNumber.trim();
    }
    if (notes && notes.trim()) {
      collaborator.notes = notes.trim();
    }

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

    const { id } = req.params;
    const { name, email, company, jobTitle, phoneNumber, notes } = req.body;
    console.log('[PATCH /collaborators/:id] Request body:', { name, email, company, jobTitle, phoneNumber, notes });

    const collaboratorRef = db
      .collection('orgs')
      .doc(user.orgId)
      .collection('collaborators')
      .doc(id);

    const collaboratorDoc = await collaboratorRef.get();
    if (!collaboratorDoc.exists) {
      return res.status(404).json({ error: 'Collaborator not found' });
    }

    // 更新データを準備
    const updates: any = {
      updatedAt: Timestamp.now(),
    };

    // 名前が提供されている場合
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Collaborator name cannot be empty' });
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

      updates.name = name.trim();
    }

    // メールアドレスが提供されている場合
    if (email !== undefined) {
      if (email.trim()) {
        // メールアドレスの重複チェック（自分以外）
        const emailSnapshot = await db
          .collection('orgs')
          .doc(user.orgId)
          .collection('collaborators')
          .where('email', '==', email.trim().toLowerCase())
          .limit(2)
          .get();

        const emailDuplicates = emailSnapshot.docs.filter(doc => doc.id !== id);
        if (emailDuplicates.length > 0) {
          return res.status(400).json({ error: 'Collaborator with this email already exists' });
        }

        updates.email = email.trim().toLowerCase();
      } else {
        updates.email = null;
      }
    }

    // その他のフィールド
    if (company !== undefined) {
      updates.company = company.trim() || null;
    }
    if (jobTitle !== undefined) {
      updates.jobTitle = jobTitle.trim() || null;
    }
    if (phoneNumber !== undefined) {
      updates.phoneNumber = phoneNumber.trim() || null;
    }
    if (notes !== undefined) {
      updates.notes = notes.trim() || null;
    }

    console.log('[PATCH /collaborators/:id] Updates to apply:', updates);
    await collaboratorRef.update(updates);

    const updated = await collaboratorRef.get();
    const responseData = { id: updated.id, ...updated.data() };
    console.log('[PATCH /collaborators/:id] Updated document data:', responseData);
    res.json(responseData);
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
