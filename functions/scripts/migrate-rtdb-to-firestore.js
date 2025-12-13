/**
 * Realtime Database から Firestore へデータを移行するスクリプト
 *
 * 使い方:
 * node scripts/migrate-rtdb-to-firestore.js
 */

const admin = require('firebase-admin');

// Firebase Admin を初期化
if (!admin.apps.length) {
  admin.initializeApp({
    databaseURL: 'https://compass-31e9e-default-rtdb.asia-southeast1.firebasedatabase.app'
  });
}

const rtdb = admin.database();
const firestore = admin.firestore();

const ORG_ID = 'archi-prisma';

/**
 * タスクデータを移行
 */
async function migrateTasks() {
  console.log('📋 タスクの移行を開始します...');

  // Realtime Database からタスクを取得
  const tasksRef = rtdb.ref(`/orgs/${ORG_ID}/tasks`);
  const snapshot = await tasksRef.once('value');
  const tasksData = snapshot.val();

  if (!tasksData) {
    console.log('⚠️  Realtime Database にタスクが見つかりません');
    return { success: 0, failed: 0 };
  }

  console.log(`📦 ${Object.keys(tasksData).length} 件のタスクが見つかりました`);

  let successCount = 0;
  let failedCount = 0;

  // Firestore のバッチ処理
  const batch = firestore.batch();
  const tasksCollection = firestore.collection('orgs').doc(ORG_ID).collection('tasks');

  for (const [taskId, taskData] of Object.entries(tasksData)) {
    try {
      const taskRef = tasksCollection.doc(taskId);

      // タスクデータを準備
      const firestoreData = {
        ...taskData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // 通知設定のデフォルト値を設定
      if (!firestoreData['通知設定']) {
        firestoreData['通知設定'] = {
          開始日: true,
          期限前日: true,
          期限当日: true,
          超過: true,
        };
      }

      batch.set(taskRef, firestoreData, { merge: true });
      successCount++;
      console.log(`  ✓ ${taskId}: ${taskData.タスク名 || '(名前なし)'}`);
    } catch (error) {
      console.error(`  ✗ ${taskId}: エラー - ${error.message}`);
      failedCount++;
    }
  }

  // バッチをコミット
  await batch.commit();
  console.log(`✅ タスクの移行完了: ${successCount} 件成功, ${failedCount} 件失敗`);

  return { success: successCount, failed: failedCount };
}

/**
 * プロジェクトデータを移行
 */
async function migrateProjects() {
  console.log('\n📁 プロジェクトの移行を開始します...');

  // Realtime Database からプロジェクトを取得
  const projectsRef = rtdb.ref(`/orgs/${ORG_ID}/projects`);
  const snapshot = await projectsRef.once('value');
  const projectsData = snapshot.val();

  if (!projectsData) {
    console.log('⚠️  Realtime Database にプロジェクトが見つかりません');
    return { success: 0, failed: 0 };
  }

  console.log(`📦 ${Object.keys(projectsData).length} 件のプロジェクトが見つかりました`);

  let successCount = 0;
  let failedCount = 0;

  // Firestore のバッチ処理
  const batch = firestore.batch();
  const projectsCollection = firestore.collection('orgs').doc(ORG_ID).collection('projects');

  for (const [projectId, projectData] of Object.entries(projectsData)) {
    try {
      const projectRef = projectsCollection.doc(projectId);

      // プロジェクトデータを準備
      const firestoreData = {
        ...projectData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      batch.set(projectRef, firestoreData, { merge: true });
      successCount++;
      console.log(`  ✓ ${projectId}: ${projectData.プロジェクト名 || projectData.name || '(名前なし)'}`);
    } catch (error) {
      console.error(`  ✗ ${projectId}: エラー - ${error.message}`);
      failedCount++;
    }
  }

  // バッチをコミット
  await batch.commit();
  console.log(`✅ プロジェクトの移行完了: ${successCount} 件成功, ${failedCount} 件失敗`);

  return { success: successCount, failed: failedCount };
}

/**
 * 人員データを移行
 */
async function migratePeople() {
  console.log('\n👥 人員の移行を開始します...');

  // Realtime Database から人員を取得
  const peopleRef = rtdb.ref(`/orgs/${ORG_ID}/people`);
  const snapshot = await peopleRef.once('value');
  const peopleData = snapshot.val();

  if (!peopleData) {
    console.log('⚠️  Realtime Database に人員が見つかりません');
    return { success: 0, failed: 0 };
  }

  console.log(`📦 ${Object.keys(peopleData).length} 件の人員が見つかりました`);

  let successCount = 0;
  let failedCount = 0;

  // Firestore のバッチ処理
  const batch = firestore.batch();
  const peopleCollection = firestore.collection('orgs').doc(ORG_ID).collection('people');

  for (const [personId, personData] of Object.entries(peopleData)) {
    try {
      const personRef = peopleCollection.doc(personId);

      // 人員データを準備
      const firestoreData = {
        ...personData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      batch.set(personRef, firestoreData, { merge: true });
      successCount++;
      console.log(`  ✓ ${personId}: ${personData.氏名 || personData.name || '(名前なし)'}`);
    } catch (error) {
      console.error(`  ✗ ${personId}: エラー - ${error.message}`);
      failedCount++;
    }
  }

  // バッチをコミット
  await batch.commit();
  console.log(`✅ 人員の移行完了: ${successCount} 件成功, ${failedCount} 件失敗`);

  return { success: successCount, failed: failedCount };
}

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 Realtime Database から Firestore へのデータ移行を開始します');
  console.log(`組織ID: ${ORG_ID}\n`);

  try {
    const projectsResult = await migrateProjects();
    const tasksResult = await migrateTasks();
    const peopleResult = await migratePeople();

    console.log('\n' + '='.repeat(60));
    console.log('📊 移行結果サマリー:');
    console.log('='.repeat(60));
    console.log(`プロジェクト: ${projectsResult.success} 件成功, ${projectsResult.failed} 件失敗`);
    console.log(`タスク: ${tasksResult.success} 件成功, ${tasksResult.failed} 件失敗`);
    console.log(`人員: ${peopleResult.success} 件成功, ${peopleResult.failed} 件失敗`);
    console.log('='.repeat(60));
    console.log('✅ 移行が完了しました！');

  } catch (error) {
    console.error('❌ 移行中にエラーが発生しました:', error);
    process.exit(1);
  }

  process.exit(0);
}

// スクリプトを実行
main();
