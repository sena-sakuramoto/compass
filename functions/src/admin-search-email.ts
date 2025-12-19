import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * 管理者用: メールアドレスでデータを検索するCloud Function
 * すべてのコレクションから該当データを探す
 */
export const adminSearchEmail = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  console.log(`Searching for email: ${email}`);

  try {
    const db = admin.firestore();
    const results: any = {
      email,
      found: []
    };

    // 1. Search in top-level users collection
    const usersSnapshot = await db.collection('users')
      .where('email', '==', email)
      .get();

    usersSnapshot.forEach(doc => {
      results.found.push({
        collection: 'users',
        path: `users/${doc.id}`,
        id: doc.id,
        data: doc.data()
      });
    });

    // 2. Search in all orgs
    const orgsSnapshot = await db.collection('orgs').get();

    for (const orgDoc of orgsSnapshot.docs) {
      const orgId = orgDoc.id;

      // Search in org members
      const membersSnapshot = await db.collection('orgs').doc(orgId)
        .collection('members')
        .get();

      for (const memberDoc of membersSnapshot.docs) {
        const memberData = memberDoc.data();
        if (memberData.email === email) {
          results.found.push({
            collection: 'orgs/members',
            path: `orgs/${orgId}/members/${memberDoc.id}`,
            id: memberDoc.id,
            orgId,
            data: memberData
          });
        }
      }

      // Search in collaborators
      const collaboratorsSnapshot = await db.collection('orgs').doc(orgId)
        .collection('collaborators')
        .where('email', '==', email)
        .get();

      collaboratorsSnapshot.forEach(doc => {
        results.found.push({
          collection: 'orgs/collaborators',
          path: `orgs/${orgId}/collaborators/${doc.id}`,
          id: doc.id,
          orgId,
          data: doc.data()
        });
      });

      // Search in people (メール field)
      const peopleSnapshot = await db.collection('orgs').doc(orgId)
        .collection('people')
        .where('メール', '==', email)
        .get();

      peopleSnapshot.forEach(doc => {
        results.found.push({
          collection: 'orgs/people',
          path: `orgs/${orgId}/people/${doc.id}`,
          id: doc.id,
          orgId,
          data: doc.data()
        });
      });

      // Search in invitations
      const invitationsSnapshot = await db.collection('orgs').doc(orgId)
        .collection('invitations')
        .where('email', '==', email)
        .get();

      invitationsSnapshot.forEach(doc => {
        results.found.push({
          collection: 'orgs/invitations',
          path: `orgs/${orgId}/invitations/${doc.id}`,
          id: doc.id,
          orgId,
          data: doc.data()
        });
      });

      // Search in clients (check all clients for email field)
      const clientsSnapshot = await db.collection('orgs').doc(orgId)
        .collection('clients')
        .get();

      for (const clientDoc of clientsSnapshot.docs) {
        const clientData = clientDoc.data();
        if (clientData.email === email) {
          results.found.push({
            collection: 'orgs/clients',
            path: `orgs/${orgId}/clients/${clientDoc.id}`,
            id: clientDoc.id,
            orgId,
            data: clientData
          });
        }
      }

      // Search in projects for any member references
      const projectsSnapshot = await db.collection('orgs').doc(orgId)
        .collection('projects')
        .get();

      for (const projectDoc of projectsSnapshot.docs) {
        const projectMembersSnapshot = await db.collection('orgs').doc(orgId)
          .collection('projects').doc(projectDoc.id)
          .collection('members')
          .get();

        for (const memberDoc of projectMembersSnapshot.docs) {
          const memberData = memberDoc.data();
          if (memberData.email === email) {
            results.found.push({
              collection: 'orgs/projects/members',
              path: `orgs/${orgId}/projects/${projectDoc.id}/members/${memberDoc.id}`,
              id: memberDoc.id,
              orgId,
              projectId: projectDoc.id,
              data: memberData
            });
          }
        }
      }
    }

    // 3. Search in top-level project_members
    const projectMembersSnapshot = await db.collection('project_members')
      .where('userId', '==', email)
      .get();

    projectMembersSnapshot.forEach(doc => {
      results.found.push({
        collection: 'project_members',
        path: `project_members/${doc.id}`,
        id: doc.id,
        data: doc.data()
      });
    });

    console.log(`Found ${results.found.length} references to ${email}`);
    console.log(JSON.stringify(results, null, 2));

    res.status(200).json({
      success: true,
      ...results,
      summary: {
        totalFound: results.found.length,
        byCollection: results.found.reduce((acc: any, item: any) => {
          acc[item.collection] = (acc[item.collection] || 0) + 1;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('Error searching for email:', error);
    res.status(500).json({
      error: 'Failed to search for email',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});
