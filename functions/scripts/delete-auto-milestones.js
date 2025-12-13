#!/usr/bin/env node
/**
 * 自動生成されたマイルストーンタスク（着工、竣工、引渡し）を削除するスクリプト
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// .firebaserc からプロジェクトIDを読み込み
const firebaseRcPath = path.resolve(__dirname, '../../.firebaserc');
let projectId;

if (fs.existsSync(firebaseRcPath)) {
  const firebaseRc = JSON.parse(fs.readFileSync(firebaseRcPath, 'utf8'));
  projectId = firebaseRc.projects?.default;
}

if (!projectId) {
  console.error('プロジェクトIDが見つかりません');
  process.exit(1);
}

admin.initializeApp({ projectId: projectId });

const db = admin.firestore();

async function deleteAutoMilestones() {
  console.log('自動生成されたマイルストーンタスクを削除します...\n');

  const milestoneNames = ['着工', '竣工', '引渡し'];

  try {
    // 全組織を取得
    const orgsSnapshot = await db.collection('orgs').get();
    console.log(`組織数: ${orgsSnapshot.size}\n`);

    let totalDeleted = 0;

    for (const orgDoc of orgsSnapshot.docs) {
      const orgId = orgDoc.id;
      console.log(`組織 ${orgId} を処理中...`);

      // タスクコレクションから自動マイルストーンを検索
      const tasksSnapshot = await db
        .collection('orgs')
        .doc(orgId)
        .collection('tasks')
        .get();

      const tasksToDelete = [];

      tasksSnapshot.docs.forEach((taskDoc) => {
        const task = taskDoc.data();
        // タスク名が「着工」「竣工」「引渡し」のいずれかで、マイルストーンフラグがtrueのものを削除
        if (milestoneNames.includes(task.タスク名) && task.マイルストーン === true) {
          tasksToDelete.push({
            id: taskDoc.id,
            name: task.タスク名,
            projectId: task.projectId,
          });
        }
      });

      if (tasksToDelete.length > 0) {
        console.log(`  削除対象: ${tasksToDelete.length} 件`);
        tasksToDelete.forEach((task) => {
          console.log(`    - ${task.name} (${task.id}) [Project: ${task.projectId}]`);
        });

        // バッチで削除
        const batch = db.batch();
        tasksToDelete.forEach((task) => {
          const taskRef = db.collection('orgs').doc(orgId).collection('tasks').doc(task.id);
          batch.delete(taskRef);
        });

        await batch.commit();
        totalDeleted += tasksToDelete.length;
        console.log(`  ✓ 削除完了`);
      } else {
        console.log(`  削除対象なし`);
      }

      console.log('');
    }

    console.log(`\n合計 ${totalDeleted} 件の自動マイルストーンタスクを削除しました。`);
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

deleteAutoMilestones()
  .then(() => {
    console.log('\n完了しました。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('実行エラー:', error);
    process.exit(1);
  });
