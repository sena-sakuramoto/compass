/**
 * 既存タスクに type='task' を追加するマイグレーションスクリプト
 *
 * 実行方法:
 *   node scripts/migrate-task-types.js
 *
 * このスクリプトは:
 * - type フィールドが未設定のタスクに対して type='task' を設定
 * - createStage で作成された工程（type='stage'）は触らない
 * - parentId は一切見ない（シンプルに type 未設定 → 'task'）
 */

const admin = require('firebase-admin');
const path = require('path');

// サービスアカウントキーのパス（環境変数またはデフォルト）
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, '../serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error.message);
  console.error('Make sure GOOGLE_APPLICATION_CREDENTIALS is set or serviceAccountKey.json exists');
  process.exit(1);
}

const db = admin.firestore();

// 組織ID（環境変数から取得、なければデフォルト）
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

    // type が未設定（null）のタスクを取得
    // Firestore では field が存在しないドキュメントも where('type', '==', null) で取得可能
    const snapshot = await tasksRef.where('type', '==', null).get();

    console.log(`📊 Found ${snapshot.size} tasks with type=null`);

    if (snapshot.empty) {
      console.log('✅ No tasks to migrate. All tasks already have type field.');
      return stats;
    }

    const batch = db.batch();
    let batchCount = 0;
    const BATCH_LIMIT = 500;

    for (const doc of snapshot.docs) {
      const task = doc.data();

      // 念のため既に type が入っているものは触らない
      // （createStage で作った stage を壊さないため）
      if (task.type) {
        stats.skipped++;
        continue;
      }

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
