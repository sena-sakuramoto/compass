import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * 管理者用: ユーザーデータを完全削除するCloud Function
 *
 * 使用方法:
 * curl -X POST https://REGION-PROJECT_ID.cloudfunctions.net/adminDeleteUser \
 *   -H "Content-Type: application/json" \
 *   -d '{"userId": "USER_ID_HERE"}'
 */
export const adminDeleteUser = onRequest(async (req, res) => {
  // POSTメソッドのみ許可
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { userId, email } = req.body;

  if (!userId && !email) {
    res.status(400).json({ error: 'userId or email is required' });
    return;
  }

  console.log(`Starting deletion for user: ${userId || email}`);

  try {
    const db = admin.firestore();
    const deletionLog: string[] = [];

    // 1. Delete user document
    deletionLog.push('1. Deleting user document...');
    try {
      await db.collection('users').doc(userId).delete();
      deletionLog.push('   ✓ User document deleted');
    } catch (error) {
      deletionLog.push(`   ⚠ User document not found or already deleted`);
    }

    // 2. Delete project_members where userId matches
    deletionLog.push('2. Deleting project_members documents...');
    const projectMembersSnapshot = await db.collection('project_members')
      .where('userId', '==', userId)
      .get();

    const projectMemberDeletes: Promise<any>[] = [];
    projectMembersSnapshot.forEach(doc => {
      deletionLog.push(`   - Deleting project_member: ${doc.id}`);
      projectMemberDeletes.push(doc.ref.delete());
    });
    await Promise.all(projectMemberDeletes);
    deletionLog.push(`   ✓ Deleted ${projectMemberDeletes.length} project_members documents`);

    // 3. Find and delete org-level memberships
    deletionLog.push('3. Deleting org-level memberships...');
    const orgsSnapshot = await db.collection('orgs').get();
    const orgMemberDeletes: Promise<any>[] = [];

    for (const orgDoc of orgsSnapshot.docs) {
      const memberDoc = await db.collection('orgs').doc(orgDoc.id)
        .collection('members').doc(userId).get();
      if (memberDoc.exists) {
        deletionLog.push(`   - Deleting org member: orgs/${orgDoc.id}/members/${userId}`);
        orgMemberDeletes.push(memberDoc.ref.delete());
      }
    }
    await Promise.all(orgMemberDeletes);
    deletionLog.push(`   ✓ Deleted ${orgMemberDeletes.length} org memberships`);

    // 4. Find and delete project-level memberships
    deletionLog.push('4. Deleting project-level memberships...');
    const projectMembershipDeletes: Promise<any>[] = [];

    for (const orgDoc of orgsSnapshot.docs) {
      const projectsSnapshot = await db.collection('orgs').doc(orgDoc.id)
        .collection('projects').get();

      for (const projectDoc of projectsSnapshot.docs) {
        const projectMemberDoc = await db.collection('orgs').doc(orgDoc.id)
          .collection('projects').doc(projectDoc.id)
          .collection('members').doc(userId).get();

        if (projectMemberDoc.exists) {
          deletionLog.push(`   - Deleting project member: orgs/${orgDoc.id}/projects/${projectDoc.id}/members/${userId}`);
          projectMembershipDeletes.push(projectMemberDoc.ref.delete());
        }
      }
    }
    await Promise.all(projectMembershipDeletes);
    deletionLog.push(`   ✓ Deleted ${projectMembershipDeletes.length} project memberships`);

    // 5. Delete from collaborators collection (email-based search)
    deletionLog.push('5. Deleting from collaborators collections...');
    const collaboratorDeletes: Promise<any>[] = [];

    if (email) {
      for (const orgDoc of orgsSnapshot.docs) {
        const collaboratorsSnapshot = await db.collection('orgs').doc(orgDoc.id)
          .collection('collaborators')
          .where('email', '==', email)
          .get();

        collaboratorsSnapshot.forEach(doc => {
          deletionLog.push(`   - Deleting collaborator: orgs/${orgDoc.id}/collaborators/${doc.id}`);
          collaboratorDeletes.push(doc.ref.delete());
        });
      }
    }
    await Promise.all(collaboratorDeletes);
    deletionLog.push(`   ✓ Deleted ${collaboratorDeletes.length} collaborators`);

    // 6. Delete from people collection (email-based search)
    deletionLog.push('6. Deleting from people collections...');
    const peopleDeletes: Promise<any>[] = [];

    if (email) {
      for (const orgDoc of orgsSnapshot.docs) {
        const peopleSnapshot = await db.collection('orgs').doc(orgDoc.id)
          .collection('people')
          .where('メール', '==', email)
          .get();

        peopleSnapshot.forEach(doc => {
          deletionLog.push(`   - Deleting person: orgs/${orgDoc.id}/people/${doc.id}`);
          peopleDeletes.push(doc.ref.delete());
        });
      }
    }
    await Promise.all(peopleDeletes);
    deletionLog.push(`   ✓ Deleted ${peopleDeletes.length} people records`);

    // 7. Delete from invitations collection (email-based search)
    deletionLog.push('7. Deleting from invitations collections...');
    const invitationDeletes: Promise<any>[] = [];

    if (email) {
      for (const orgDoc of orgsSnapshot.docs) {
        const invitationsSnapshot = await db.collection('orgs').doc(orgDoc.id)
          .collection('invitations')
          .where('email', '==', email)
          .get();

        invitationsSnapshot.forEach(doc => {
          deletionLog.push(`   - Deleting invitation: orgs/${orgDoc.id}/invitations/${doc.id}`);
          invitationDeletes.push(doc.ref.delete());
        });
      }
    }
    await Promise.all(invitationDeletes);
    deletionLog.push(`   ✓ Deleted ${invitationDeletes.length} invitations`);

    deletionLog.push('\n✅ All Firestore data deleted successfully!');
    deletionLog.push('\nNext step: Delete Firebase Auth user with:');
    deletionLog.push(`firebase auth:delete ${userId} --project compass-31e9e`);

    console.log(deletionLog.join('\n'));

    res.status(200).json({
      success: true,
      userId,
      log: deletionLog,
      summary: {
        projectMembersDeleted: projectMemberDeletes.length,
        orgMembershipsDeleted: orgMemberDeletes.length,
        projectMembershipsDeleted: projectMembershipDeletes.length,
        collaboratorsDeleted: collaboratorDeletes.length,
        peopleDeleted: peopleDeletes.length,
        invitationsDeleted: invitationDeletes.length
      }
    });

  } catch (error) {
    console.error('Error deleting user data:', error);
    res.status(500).json({
      error: 'Failed to delete user data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});
