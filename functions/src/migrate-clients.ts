/**
 * 既存のclientsコレクションをpeopleコレクションに移行するスクリプト
 * クライアントをPerson type='client'として移行
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, cert } from 'firebase-admin/app';
import * as path from 'path';
import * as fs from 'fs';

// サービスアカウントキーを読み込む
const serviceAccountPath = path.join(__dirname, '../../service-account-key.json');
let serviceAccount: any;

try {
  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
  console.error('❌ service-account-key.json not found. Please ensure it exists in the project root.');
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: 'compass-31e9e',
});
const db = getFirestore(app);

async function migrateClients() {
  try {
    console.log('Starting client migration...');

    // すべての組織を取得
    const orgsSnapshot = await db.collection('orgs').get();

    for (const orgDoc of orgsSnapshot.docs) {
      const orgId = orgDoc.id;
      console.log(`\nProcessing organization: ${orgId}`);

      // この組織のクライアントを取得
      const clientsSnapshot = await db
        .collection('orgs')
        .doc(orgId)
        .collection('clients')
        .get();

      console.log(`Found ${clientsSnapshot.docs.length} clients`);

      // 各クライアントをPeopleに移行
      for (const clientDoc of clientsSnapshot.docs) {
        const client = clientDoc.data();

        // 既に同じ名前のPersonが存在するかチェック
        const existingPerson = await db
          .collection('orgs')
          .doc(orgId)
          .collection('people')
          .where('氏名', '==', client.name)
          .where('type', '==', 'client')
          .limit(1)
          .get();

        if (!existingPerson.empty) {
          console.log(`  Skipping "${client.name}" - already exists in people`);
          continue;
        }

        // Personとして作成
        const personRef = db
          .collection('orgs')
          .doc(orgId)
          .collection('people')
          .doc();

        const person = {
          id: personRef.id,
          type: 'client',
          氏名: client.name,
          createdAt: client.createdAt || Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        await personRef.set(person);
        console.log(`  ✓ Migrated "${client.name}" to people`);
      }

      console.log(`Completed migration for organization: ${orgId}`);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('Note: Original clients data has been preserved in the clients collection.');
    console.log('You can manually delete it after verifying the migration.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

migrateClients();
