import { Router } from 'express';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';

const router = Router();
const db = getFirestore();

router.use(authMiddleware());

/**
 * POST /api/admin/migrate-clients
 * 既存のclientsコレクションをpeopleコレクションに移行
 * 管理者のみ実行可能
 */
router.post('/migrate-clients', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 管理者のみ実行可能
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Only admins can run migration' });
    }

    console.log(`Starting client migration for org: ${user.orgId}`);

    // この組織のクライアントを取得
    const clientsSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('clients')
      .get();

    console.log(`Found ${clientsSnapshot.docs.length} clients`);

    let migrated = 0;
    let skipped = 0;

    // 各クライアントをPeopleに移行
    for (const clientDoc of clientsSnapshot.docs) {
      const client = clientDoc.data();

      // 既に同じ名前のPersonが存在するかチェック
      const existingPerson = await db
        .collection('orgs')
        .doc(user.orgId)
        .collection('people')
        .where('氏名', '==', client.name)
        .where('type', '==', 'client')
        .limit(1)
        .get();

      if (!existingPerson.empty) {
        console.log(`Skipping "${client.name}" - already exists in people`);
        skipped++;
        continue;
      }

      // Personとして作成
      const personRef = db
        .collection('orgs')
        .doc(user.orgId)
        .collection('people')
        .doc();

      const person = {
        id: personRef.id,
        type: 'client',
        氏名: client.name,
        createdAt: client.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await personRef.set(person);
      console.log(`Migrated "${client.name}" to people`);
      migrated++;
    }

    console.log(`Migration completed. Migrated: ${migrated}, Skipped: ${skipped}`);

    res.json({
      success: true,
      message: 'Migration completed successfully',
      stats: {
        total: clientsSnapshot.docs.length,
        migrated,
        skipped,
      },
    });
  } catch (error) {
    console.error('Migration failed:', error);
    next(error);
  }
});

export default router;
