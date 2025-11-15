#!/usr/bin/env node

/**
 * プロジェクト数を確認するスクリプト
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

admin.initializeApp({ projectId: projectId });
const db = admin.firestore();

async function checkProjects() {
  console.log('========================================');
  console.log('プロジェクト数を確認');
  console.log('========================================\n');

  try {
    // すべての組織を取得
    const orgsSnapshot = await db.collection('orgs').get();
    console.log(`組織数: ${orgsSnapshot.size}\n`);

    let totalProjects = 0;

    for (const orgDoc of orgsSnapshot.docs) {
      const orgId = orgDoc.id;
      console.log(`[${orgId}] 組織`);

      // 組織のプロジェクトを取得
      const projectsSnapshot = await db
        .collection('orgs')
        .doc(orgId)
        .collection('projects')
        .get();

      console.log(`  プロジェクト数: ${projectsSnapshot.size}`);
      totalProjects += projectsSnapshot.size;

      // プロジェクト一覧を表示
      if (projectsSnapshot.size > 0) {
        console.log('  プロジェクト一覧:');
        projectsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          console.log(`    - ${doc.id}: ${data.物件名 || '(名前なし)'}`);
        });
      }
      console.log('');
    }

    console.log('========================================');
    console.log(`合計プロジェクト数: ${totalProjects}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkProjects()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
