/**
 * Firestore自動バックアップ
 * 毎日2:00にFirestoreデータをCloud Storageにエクスポート
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

const firestore = admin.firestore();

export const firestoreBackup = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'Asia/Tokyo',
    region: 'asia-northeast1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async (event) => {
    console.log('[firestoreBackup] Starting Firestore backup...');

    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
      console.error('[firestoreBackup] Project ID not found');
      throw new Error('Project ID not found');
    }

    // デフォルトのFirebase Storageバケットを使用
    const bucketName = `${projectId}.firebasestorage.app`;

    // タイムスタンプ付きフォルダ名（backupsフォルダ内に保存）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputUriPrefix = `gs://${bucketName}/firestore-backups/${timestamp}`;

    try {
      // Firestore Export API を使用してバックアップ
      const client = new admin.firestore.v1.FirestoreAdminClient();
      const databaseName = client.databasePath(projectId, '(default)');

      console.log(`[firestoreBackup] Exporting to ${outputUriPrefix}`);

      const [operation] = await client.exportDocuments({
        name: databaseName,
        outputUriPrefix: outputUriPrefix,
        // すべてのコレクションをエクスポート（必要に応じて特定のコレクションのみ指定可能）
        // collectionIds: ['orgs'],
      });

      console.log(`[firestoreBackup] Export operation started: ${operation.name}`);

      // オペレーションの完了を待つ（オプション）
      // await operation.promise();
      // console.log('[firestoreBackup] Export completed successfully');

      // 古いバックアップを削除（30日以上前）
      await cleanupOldBackups(bucketName, 30);

      console.log('[firestoreBackup] Backup process completed');
    } catch (error) {
      console.error('[firestoreBackup] Error during backup:', error);
      throw error;
    }
  }
);

/**
 * 古いバックアップを削除
 */
async function cleanupOldBackups(bucketName: string, retentionDays: number) {
  try {
    const bucket = admin.storage().bucket(bucketName);
    const [files] = await bucket.getFiles();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;

    for (const file of files) {
      const [metadata] = await file.getMetadata();
      if (!metadata.timeCreated) continue;

      const createdDate = new Date(metadata.timeCreated);

      if (createdDate < cutoffDate) {
        console.log(`[cleanupOldBackups] Deleting old backup: ${file.name}`);
        await file.delete();
        deletedCount++;
      }
    }

    console.log(`[cleanupOldBackups] Deleted ${deletedCount} old backup(s)`);
  } catch (error) {
    console.error('[cleanupOldBackups] Error during cleanup:', error);
    // クリーンアップエラーは致命的ではないので、エラーをログに記録するだけ
  }
}
