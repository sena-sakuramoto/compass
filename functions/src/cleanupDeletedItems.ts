/**
 * 削除済みアイテムのクリーンアップ
 * 30日以上経過した削除済みプロジェクトとタスクを完全削除
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { ensureFirebaseAdmin } from './lib/firebaseAdmin';

ensureFirebaseAdmin();

const db = admin.firestore();
const DELETION_GRACE_PERIOD_DAYS = 30;

export const cleanupDeletedItems = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Tokyo',
    region: 'asia-northeast1',
  },
  async (event) => {
    console.log('[cleanupDeletedItems] Starting cleanup of deleted items...');

    const now = admin.firestore.Timestamp.now();
    const cutoffDate = new Date(now.toDate());
    cutoffDate.setDate(cutoffDate.getDate() - DELETION_GRACE_PERIOD_DAYS);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

    try {
      // すべての組織を取得
      const orgsSnapshot = await db.collection('orgs').get();
      let totalDeletedProjects = 0;
      let totalDeletedTasks = 0;

      for (const orgDoc of orgsSnapshot.docs) {
        const orgId = orgDoc.id;
        console.log(`[cleanupDeletedItems] Processing org: ${orgId}`);

        // 削除済みプロジェクトをクリーンアップ
        const deletedProjectsSnapshot = await db
          .collection('orgs')
          .doc(orgId)
          .collection('projects')
          .where('deletedAt', '<=', cutoffTimestamp)
          .get();

        const batch = db.batch();
        deletedProjectsSnapshot.docs.forEach((doc) => {
          console.log(`[cleanupDeletedItems] Permanently deleting project: ${doc.id}`);
          batch.delete(doc.ref);
        });

        // 削除済みタスクをクリーンアップ
        const deletedTasksSnapshot = await db
          .collection('orgs')
          .doc(orgId)
          .collection('tasks')
          .where('deletedAt', '<=', cutoffTimestamp)
          .get();

        deletedTasksSnapshot.docs.forEach((doc) => {
          console.log(`[cleanupDeletedItems] Permanently deleting task: ${doc.id}`);
          batch.delete(doc.ref);
        });

        if (deletedProjectsSnapshot.size > 0 || deletedTasksSnapshot.size > 0) {
          await batch.commit();
          totalDeletedProjects += deletedProjectsSnapshot.size;
          totalDeletedTasks += deletedTasksSnapshot.size;
          console.log(
            `[cleanupDeletedItems] Org ${orgId}: Deleted ${deletedProjectsSnapshot.size} projects and ${deletedTasksSnapshot.size} tasks`
          );
        }
      }

      console.log(
        `[cleanupDeletedItems] Cleanup complete. Total: ${totalDeletedProjects} projects, ${totalDeletedTasks} tasks`
      );
    } catch (error) {
      console.error('[cleanupDeletedItems] Error during cleanup:', error);
      throw error;
    }
  }
);
