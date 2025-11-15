#!/usr/bin/env node

/**
 * プロジェクトメンバーシップを確認するスクリプト
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

async function checkMemberships() {
  console.log('========================================');
  console.log('プロジェクトメンバーシップを確認');
  console.log('========================================\n');

  try {
    // すべてのプロジェクトメンバーシップを取得
    const membershipsSnapshot = await db.collection('project_members').get();
    console.log(`プロジェクトメンバーシップ総数: ${membershipsSnapshot.size}\n`);

    // プロジェクトごとにグループ化
    const projectMap = new Map();

    membershipsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const projectId = data.projectId;

      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, []);
      }

      projectMap.get(projectId).push({
        userId: data.userId,
        email: data.email,
        role: data.role,
        status: data.status
      });
    });

    console.log('プロジェクトごとのメンバー:\n');

    for (const [projectId, members] of projectMap.entries()) {
      console.log(`[${projectId}]`);
      console.log(`  メンバー数: ${members.length}`);
      members.forEach(member => {
        console.log(`    - ${member.email} (${member.role}) [${member.status || 'active'}]`);
      });
      console.log('');
    }

    // ユーザーごとにグループ化
    const userMap = new Map();

    membershipsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const userId = data.userId;

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          email: data.email,
          projects: []
        });
      }

      userMap.get(userId).projects.push({
        projectId: data.projectId,
        role: data.role,
        status: data.status
      });
    });

    console.log('========================================');
    console.log('ユーザーごとのプロジェクト:\n');

    for (const [userId, userData] of userMap.entries()) {
      console.log(`[${userData.email}] (${userId})`);
      console.log(`  参加プロジェクト数: ${userData.projects.length}`);
      userData.projects.forEach(project => {
        console.log(`    - ${project.projectId} (${project.role}) [${project.status || 'active'}]`);
      });
      console.log('');
    }

    console.log('========================================\n');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkMemberships()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
