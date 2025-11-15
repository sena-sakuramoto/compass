#!/usr/bin/env node

/**
 * タスクに orgId フィールドを追加する移行スクリプト
 *
 * すべての組織のタスクに orgId フィールドを追加します。
 * タスクは /orgs/{orgId}/tasks/{taskId} に保存されているため、
 * パスから orgId を取得してタスクに保存します。
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// .firebaserc からプロジェクトIDを読み取る
let projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  try {
    const firebaseRcPath = path.resolve(__dirname, '../../.firebaserc');
    const firebaseRc = JSON.parse(fs.readFileSync(firebaseRcPath, 'utf8'));
    projectId = firebaseRc.projects?.default;
  } catch (error) {
    console.error('Failed to read .firebaserc:', error.message);
  }
}

// Firebase Admin を初期化
try {
  admin.initializeApp({
    projectId: projectId
  });
  console.log(`Firebase Admin initialized successfully with project: ${projectId || 'auto-detected'}`);
} catch (error) {
  console.error('Error initializing Firebase Admin:', error.message);
  console.error('\nPlease ensure you have set up authentication:');
  console.error('1. Run "firebase login" to authenticate, OR');
  console.error('2. Set FIREBASE_PROJECT_ID environment variable, OR');
  console.error('3. Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON file');
  process.exit(1);
}

const db = admin.firestore();

async function addOrgIdToTasks() {
  console.log('========================================');
  console.log('タスクに orgId フィールドを追加する移行スクリプト');
  console.log('========================================\n');

  try {
    // すべての組織を取得
    const orgsSnapshot = await db.collection('orgs').get();
    console.log(`Found ${orgsSnapshot.size} organizations\n`);

    let totalTasks = 0;
    let updatedTasks = 0;
    let skippedTasks = 0;

    for (const orgDoc of orgsSnapshot.docs) {
      const orgId = orgDoc.id;
      console.log(`\n[${orgId}] Processing organization...`);

      // 組織のタスクを取得
      const tasksSnapshot = await db
        .collection('orgs')
        .doc(orgId)
        .collection('tasks')
        .get();

      console.log(`  Found ${tasksSnapshot.size} tasks`);
      totalTasks += tasksSnapshot.size;

      // 各タスクに orgId を追加
      const batch = db.batch();
      let batchCount = 0;
      const BATCH_SIZE = 500;

      for (const taskDoc of tasksSnapshot.docs) {
        const taskData = taskDoc.data();

        // 既に orgId がある場合はスキップ
        if (taskData.orgId) {
          console.log(`  ✓ Task ${taskDoc.id} already has orgId: ${taskData.orgId}`);
          skippedTasks++;
          continue;
        }

        // orgId を追加
        batch.update(taskDoc.ref, {
          orgId: orgId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        batchCount++;
        updatedTasks++;

        console.log(`  + Task ${taskDoc.id}: Adding orgId=${orgId}`);

        // バッチサイズに達したらコミット
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`  Committed batch of ${batchCount} updates`);
          batchCount = 0;
        }
      }

      // 残りのバッチをコミット
      if (batchCount > 0) {
        await batch.commit();
        console.log(`  Committed final batch of ${batchCount} updates`);
      }

      console.log(`[${orgId}] ✅ Completed`);
    }

    console.log('\n========================================');
    console.log('移行完了');
    console.log('========================================');
    console.log(`Total tasks: ${totalTasks}`);
    console.log(`Updated: ${updatedTasks}`);
    console.log(`Skipped (already had orgId): ${skippedTasks}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
}

// スクリプト実行
addOrgIdToTasks()
  .then(() => {
    console.log('Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
