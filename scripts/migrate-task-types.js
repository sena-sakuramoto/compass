/**
 * 既存タスクに type フィールドを追加するマイグレーションスクリプト
 *
 * 実行方法:
 *   node scripts/migrate-task-types.js
 *
 * このスクリプトは:
 * 1. 全タスクを取得
 * 2. type フィールドがないタスクに対して:
 *    - parentId が null → type = 'stage' (工程として扱う)
 *    - parentId が設定されている → type = 'task' (タスクとして扱う)
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

  try {
    // 全タスクを取得
    const tasksSnapshot = await db
      .collection('orgs')
      .doc(ORG_ID)
      .collection('tasks')
      .get();

    console.log(`📊 Found ${tasksSnapshot.size} tasks`);

    let stageCount = 0;
    let taskCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const batch = db.batch();
    let batchCount = 0;
    const BATCH_LIMIT = 500;

    for (const doc of tasksSnapshot.docs) {
      const data = doc.data();

      // 既に type が設定されている場合はスキップ
      if (data.type) {
        skippedCount++;
        continue;
      }

      let newType;
      if (data.parentId === null || data.parentId === undefined) {
        // parentId が null → 工程として扱う
        newType = 'stage';
        stageCount++;
      } else {
        // parentId が設定されている → タスクとして扱う
        newType = 'task';
        taskCount++;
      }

      // バッチに追加
      batch.update(doc.ref, {
        type: newType,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

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
    console.log(`  - Stages created (type='stage'):  ${stageCount}`);
    console.log(`  - Tasks updated (type='task'):    ${taskCount}`);
    console.log(`  - Skipped (already had type):     ${skippedCount}`);
    console.log(`  - Errors:                         ${errorCount}`);
    console.log(`\n✅ Migration completed successfully!`);

    // 検証: 更新後のタスクタイプの分布を確認
    const updatedSnapshot = await db
      .collection('orgs')
      .doc(ORG_ID)
      .collection('tasks')
      .get();

    const typeCounts = {};
    updatedSnapshot.docs.forEach(doc => {
      const type = doc.data().type || 'undefined';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    console.log('\n📊 Verification - Task type distribution:');
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// スクリプト実行
migrateTaskTypes()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
