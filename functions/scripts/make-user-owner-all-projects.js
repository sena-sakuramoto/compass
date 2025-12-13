/**
 * 全プロジェクトで指定ユーザーをオーナーにするスクリプト
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

// 既に初期化されているかチェック
if (!admin.apps.length) {
  admin.initializeApp({ projectId: projectId });
}

const db = admin.firestore();

async function makeUserOwnerOfAllProjects() {
  const orgId = 'archi-prisma';
  const targetEmail = 's.sakuramoto@archi-prisma.co.jp';

  console.log(`\n[Migration] Making ${targetEmail} owner of all projects in org: ${orgId}`);

  try {
    // 1. ターゲットユーザーを取得
    const usersSnapshot = await db
      .collection('users')
      .where('email', '==', targetEmail)
      .where('orgId', '==', orgId)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      console.error(`[Error] User not found: ${targetEmail}`);
      return;
    }

    const targetUser = {
      id: usersSnapshot.docs[0].id,
      ...usersSnapshot.docs[0].data()
    };

    console.log(`[Migration] Found user: ${targetUser.displayName} (${targetUser.email})`);

    // 2. 全プロジェクトを取得
    const projectsSnapshot = await db
      .collection('orgs')
      .doc(orgId)
      .collection('projects')
      .get();

    console.log(`[Migration] Found ${projectsSnapshot.size} projects`);

    let updatedCount = 0;
    let addedCount = 0;
    let errorCount = 0;

    // 3. 各プロジェクトについて処理
    for (const projectDoc of projectsSnapshot.docs) {
      const projectId = projectDoc.id;
      const projectData = projectDoc.data();

      console.log(`\n[Project] Processing: ${projectData.物件名 || projectId}`);

      try {
        // プロジェクトメンバーのドキュメントID (複合キー)
        const memberDocId = `${projectId}_${targetUser.id}`;

        // プロジェクトのメンバーサブコレクションを確認
        const memberRef = db
          .collection('orgs')
          .doc(orgId)
          .collection('projects')
          .doc(projectId)
          .collection('members')
          .doc(targetUser.id);

        const memberDoc = await memberRef.get();

        // トップレベルの project_members コレクション
        const projectMemberRef = db.collection('project_members').doc(memberDocId);

        const memberData = {
          projectId,
          userId: targetUser.id,
          email: targetUser.email,
          displayName: targetUser.displayName || targetUser.email.split('@')[0],
          orgId: targetUser.orgId,
          orgName: targetUser.orgName || 'archi-prisma',
          role: 'owner',
          permissions: {
            canEditProject: true,
            canDeleteProject: true,
            canManageMembers: true,
            canViewTasks: true,
            canEditTasks: true,
            canCreateTasks: true,
            canDeleteTasks: true,
            canViewFiles: true,
            canUploadFiles: true,
          },
          invitedBy: targetUser.id,
          invitedAt: admin.firestore.FieldValue.serverTimestamp(),
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'active',
          createdAt: memberDoc.exists ? memberDoc.data().createdAt : admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (targetUser.職種) {
          memberData.職種 = targetUser.職種;
        }

        // プロジェクトのメンバーサブコレクションに保存
        await memberRef.set(memberData, { merge: true });

        // トップレベルのproject_membersコレクションに保存
        await projectMemberRef.set(memberData, { merge: true });

        if (memberDoc.exists) {
          const existingRole = memberDoc.data().role;
          console.log(`  ✓ Updated role from '${existingRole}' to 'owner'`);
          updatedCount++;
        } else {
          console.log(`  ✓ Added as owner (new member)`);
          addedCount++;
        }
      } catch (error) {
        console.error(`  ✗ Error processing project ${projectId}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n[Migration] Complete!`);
    console.log(`  - Updated: ${updatedCount} projects`);
    console.log(`  - Added: ${addedCount} projects`);
    console.log(`  - Errors: ${errorCount} projects`);
    console.log(`  - Total: ${projectsSnapshot.size} projects`);

  } catch (error) {
    console.error('[Error] Migration failed:', error);
    throw error;
  }
}

// 実行
makeUserOwnerOfAllProjects()
  .then(() => {
    console.log('\n[Success] Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n[Error] Migration failed:', error);
    process.exit(1);
  });
