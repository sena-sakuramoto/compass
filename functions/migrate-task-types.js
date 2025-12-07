/**
 * 既存タスクに type='task' を追加するマイグレーションスクリプト
 *
 * 実行方法:
 *   cd functions && node migrate-task-types.js
 */

const admin = require('firebase-admin');

// Firebase Admin を初期化（Application Default Credentials を使用）
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'compass-31e9e'
  });
}

const db = admin.firestore();

// 組織ID
const ORG_ID = process.env.ORG_ID || 'org-compass';

async function migrateTaskTypes() {
  console.log(`🚀 Starting task type migration for org: ${ORG_ID}`);

  const stats = {
    tasksUpdated: 0,
    skipped: 0,
    errors: 0
  };

  try {
    const tasksRef = db.collection('orgs').doc(ORG_ID).collection('tasks');

    // 全タスクを取得（type フィールドでのフィルタは後でJS側で行う）
    const snapshot = await tasksRef.get();

    console.log(`📊 Found ${snapshot.size} total tasks`);

    if (snapshot.empty) {
      console.log('✅ No tasks found.');
      return stats;
    }

    // type が未設定のタスクをフィルタ
    const tasksToMigrate = snapshot.docs.filter(doc => {
      const data = doc.data();
      return !data.type || data.type === null || data.type === undefined;
    });

    console.log(`📊 Found ${tasksToMigrate.length} tasks with type=null/undefined`);

    if (tasksToMigrate.length === 0) {
      console.log('✅ No tasks to migrate. All tasks already have type field.');
      return stats;
    }

    const BATCH_LIMIT = 500;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of tasksToMigrate) {
      // 無条件で type='task' に設定
      batch.update(doc.ref, {
        type: 'task',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      stats.tasksUpdated++;
      batchCount++;

      // バッチが500件に達したらコミット
      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        console.log(`✅ Committed batch of ${batchCount} updates`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    // 残りのバッチをコミット
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✅ Committed final batch of ${batchCount} updates`);
    }

    console.log('\n📈 Migration Summary:');
    console.log(`  - Tasks updated (type='task'):  ${stats.tasksUpdated}`);
    console.log(`  - Skipped (already had type):   ${stats.skipped}`);
    console.log(`  - Errors:                       ${stats.errors}`);
    console.log(`\n✅ Migration completed successfully!`);

    // 検証: 更新後のタスクタイプの分布を確認
    const allTasksSnapshot = await tasksRef.get();

    const typeCounts = {};
    allTasksSnapshot.docs.forEach(doc => {
      const type = doc.data().type || 'undefined';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    console.log('\n📊 Verification - Task type distribution:');
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });

    return stats;

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// スクリプト実行
migrateTaskTypes()
  .then((stats) => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
