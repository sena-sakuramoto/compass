/**
 * 既存プロジェクトに組織のユーザーをメンバーとして追加するマイグレーション
 */

const admin = require('firebase-admin');

// 既に初期化されているかチェック
if (!admin.apps.length) {
  const serviceAccount = require('./compass-31e9e-8835b72b43c6.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function migrateExistingProjects() {
  const orgId = 'archi-prisma';

  console.log(`\n[Migration] Starting migration for org: ${orgId}`);

  try {
    // 1. 全プロジェクトを取得
    const projectsSnapshot = await db
      .collection('orgs')
      .doc(orgId)
      .collection('projects')
      .get();

    console.log(`[Migration] Found ${projectsSnapshot.size} projects`);

    // 2. 組織の全アクティブユーザーを取得
    const usersSnapshot = await db
      .collection('users')
      .where('orgId', '==', orgId)
      .where('isActive', '==', true)
      .get();

    console.log(`[Migration] Found ${usersSnapshot.size} active users`);

    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // 3. 各プロジェクトについて処理
    for (const projectDoc of projectsSnapshot.docs) {
      const projectId = projectDoc.id;
      const projectData = projectDoc.data();

      console.log(`\n[Migration] Processing project: ${projectId} - ${projectData.物件名}`);

      // 既存のメンバーを確認
      const existingMembersSnapshot = await db
        .collection('project_members')
        .where('projectId', '==', projectId)
        .where('orgId', '==', orgId)
        .get();

      const existingUserIds = new Set(
        existingMembersSnapshot.docs.map(doc => doc.data().userId)
      );

      console.log(`[Migration] Project ${projectId} has ${existingUserIds.size} existing members`);

      // 4. 各ユーザーをメンバーとして追加（既に存在する場合はスキップ）
      let addedCount = 0;
      let skippedCount = 0;

      for (const user of users) {
        if (existingUserIds.has(user.id)) {
          console.log(`  - Skipping ${user.displayName} (already a member)`);
          skippedCount++;
          continue;
        }

        const memberId = `${projectId}_${user.id}`;

        // 最初のユーザーをownerに、それ以外をmemberに
        const isFirstMember = existingUserIds.size === 0 && addedCount === 0;
        const role = isFirstMember || user.role === 'admin' ? 'owner' : 'member';

        const memberData = {
          id: memberId,
          projectId: projectId,
          userId: user.id,
          email: user.email,
          displayName: user.displayName,
          orgId: user.orgId,
          orgName: orgId,
          role: role,
          職種: user.職種 || null,
          permissions: {
            canEditProject: role === 'owner',
            canDeleteProject: role === 'owner',
            canManageMembers: role === 'owner',
            canViewTasks: true,
            canCreateTasks: true,
            canEditTasks: true,
            canDeleteTasks: role === 'owner',
            canViewFiles: true,
            canUploadFiles: true,
          },
          invitedBy: user.id, // 自己招待扱い
          invitedAt: admin.firestore.FieldValue.serverTimestamp(),
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.collection('project_members').doc(memberId).set(memberData);
        console.log(`  ✓ Added ${user.displayName} as ${role}`);
        addedCount++;
      }

      console.log(`[Migration] Project ${projectId}: Added ${addedCount}, Skipped ${skippedCount}`);
    }

    console.log(`\n[Migration] ✅ Migration completed successfully!`);

  } catch (error) {
    console.error('[Migration] ❌ Error during migration:', error);
    throw error;
  }
}

// 実行
migrateExistingProjects()
  .then(() => {
    console.log('\n[Migration] Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n[Migration] Script failed:', error);
    process.exit(1);
  });
