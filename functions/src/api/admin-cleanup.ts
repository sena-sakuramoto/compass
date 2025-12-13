import { Router } from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getUser } from '../lib/users';
import { resolveAuthHeader, verifyToken } from '../lib/auth';
import { canManageUsers } from '../lib/access-control';
import type { TaskInput } from '../lib/firestore';
import { ensureFirebaseAdmin } from '../lib/firebaseAdmin';

ensureFirebaseAdmin();

const router = Router();
const db = getFirestore();

// Valid user names (only these 4 users should remain)
const VALID_USERS = [
  '松井大輔',
  '鈴木海人',
  '櫻本聖成',
  '藤本晃世',
];

// Name migration mapping
const NAME_MIGRATION: Record<string, string> = {
  '櫻本': '櫻本聖成',
};

/**
 * 認証ミドルウェア（管理者のみ）
 */
async function authenticateAdmin(req: any, res: any, next: any) {
  try {
    const { header } = resolveAuthHeader(req);
    const token = header?.startsWith('Bearer ') ? header.slice(7) : header;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await verifyToken(token);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await getUser(decodedToken.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 管理者権限チェック
    if (!canManageUsers(user)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = user;
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    console.error('[Admin Cleanup] Authentication error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * POST /api/admin/cleanup-users
 * データクリーンアップ実行（管理者のみ）
 */
router.post('/cleanup-users', authenticateAdmin, async (req: any, res) => {
  try {
    const orgId = req.user.orgId;
    console.log(`[Admin Cleanup] Starting cleanup for org: ${orgId}`);

    const results = {
      tasks: {
        updated: 0,
        skipped: 0,
        errors: 0,
        total: 0,
      },
      members: {
        deleted: 0,
        kept: 0,
        errors: 0,
        total: 0,
      },
    };

    // Step 1: Clean up task assignees
    console.log('[Admin Cleanup] Cleaning up task assignees...');
    const tasksRef = db.collection('orgs').doc(orgId).collection('tasks');
    const tasksSnapshot = await tasksRef.get();
    results.tasks.total = tasksSnapshot.size;

    const taskBatch = db.batch();
    let taskBatchCount = 0;
    const BATCH_SIZE = 500;

    for (const doc of tasksSnapshot.docs) {
      try {
        const data = doc.data() as TaskInput;
        const currentAssignee = data.担当者 || data.assignee;

        let newAssignee = currentAssignee;
        let needsUpdate = false;

        // Check if assignee needs migration (櫻本 -> 櫻本聖成)
        if (currentAssignee && NAME_MIGRATION[currentAssignee]) {
          newAssignee = NAME_MIGRATION[currentAssignee];
          needsUpdate = true;
          console.log(`  Task ${doc.id}: Migrating "${currentAssignee}" -> "${newAssignee}"`);
        }
        // Check if assignee is invalid (not in valid users list)
        else if (currentAssignee && !VALID_USERS.includes(currentAssignee)) {
          newAssignee = null;
          needsUpdate = true;
          console.log(`  Task ${doc.id}: Removing invalid assignee "${currentAssignee}"`);
        }

        if (needsUpdate) {
          taskBatch.update(doc.ref, {
            担当者: newAssignee,
            assignee: newAssignee,
            updatedAt: FieldValue.serverTimestamp(),
          });
          results.tasks.updated++;
          taskBatchCount++;

          // Commit batch if it reaches the limit
          if (taskBatchCount >= BATCH_SIZE) {
            await taskBatch.commit();
            console.log(`  Committed batch of ${taskBatchCount} task updates`);
            taskBatchCount = 0;
          }
        } else {
          results.tasks.skipped++;
        }
      } catch (error) {
        console.error(`  Error processing task ${doc.id}:`, error);
        results.tasks.errors++;
      }
    }

    // Commit remaining task updates
    if (taskBatchCount > 0) {
      await taskBatch.commit();
      console.log(`  Committed final batch of ${taskBatchCount} task updates`);
    }

    // Step 2: Get valid user IDs
    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.where('orgId', '==', orgId).get();
    const validUserIds: string[] = [];

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      if (VALID_USERS.includes(userData.displayName)) {
        validUserIds.push(doc.id);
      }
    }

    console.log(`[Admin Cleanup] Valid user IDs: ${validUserIds.join(', ')}`);

    // Step 3: Clean up project members
    console.log('[Admin Cleanup] Cleaning up project members...');
    const membersRef = db.collection('project_members');
    const membersSnapshot = await membersRef.where('orgId', '==', orgId).get();
    results.members.total = membersSnapshot.size;

    const memberBatch = db.batch();
    let memberBatchCount = 0;

    for (const doc of membersSnapshot.docs) {
      try {
        const memberData = doc.data();
        const userId = memberData.userId;

        // Check if this is a valid user (keep pending invitations)
        const isValid = validUserIds.includes(userId) || userId.startsWith('pending_');

        if (!isValid) {
          console.log(`  Removing member ${doc.id}: userId=${userId}, displayName=${memberData.displayName}`);
          memberBatch.delete(doc.ref);
          results.members.deleted++;
          memberBatchCount++;

          // Commit batch if it reaches the limit
          if (memberBatchCount >= BATCH_SIZE) {
            await memberBatch.commit();
            console.log(`  Committed batch of ${memberBatchCount} member deletions`);
            memberBatchCount = 0;
          }
        } else {
          results.members.kept++;
        }
      } catch (error) {
        console.error(`  Error processing member ${doc.id}:`, error);
        results.members.errors++;
      }
    }

    // Commit remaining member deletions
    if (memberBatchCount > 0) {
      await memberBatch.commit();
      console.log(`  Committed final batch of ${memberBatchCount} member deletions`);
    }

    console.log('[Admin Cleanup] Cleanup completed successfully');
    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('[Admin Cleanup] Error:', error);
    res.status(500).json({
      error: 'Cleanup failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/admin/migrate-task-types
 * タスクのtypeフィールドをマイグレーション（管理者のみ）
 * type未設定のタスクに type='task' を設定
 */
router.post('/migrate-task-types', authenticateAdmin, async (req: any, res) => {
  try {
    const orgId = req.user.orgId;
    console.log(`[Admin Migration] Starting task type migration for org: ${orgId}`);

    const stats = {
      tasksUpdated: 0,
      skipped: 0,
      errors: 0,
      total: 0,
    };

    const tasksRef = db.collection('orgs').doc(orgId).collection('tasks');
    const snapshot = await tasksRef.get();
    stats.total = snapshot.size;

    console.log(`[Admin Migration] Found ${snapshot.size} total tasks`);

    // type が未設定のタスクをフィルタ
    const tasksToMigrate = snapshot.docs.filter(doc => {
      const data = doc.data();
      return !data.type || data.type === null || data.type === undefined;
    });

    console.log(`[Admin Migration] Found ${tasksToMigrate.length} tasks with type=null/undefined`);

    if (tasksToMigrate.length === 0) {
      console.log('[Admin Migration] No tasks to migrate');
      return res.json({
        success: true,
        message: 'No tasks to migrate. All tasks already have type field.',
        stats,
      });
    }

    const BATCH_LIMIT = 500;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of tasksToMigrate) {
      batch.update(doc.ref, {
        type: 'task',
        updatedAt: FieldValue.serverTimestamp(),
      });

      stats.tasksUpdated++;
      batchCount++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        console.log(`[Admin Migration] Committed batch of ${batchCount} updates`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      console.log(`[Admin Migration] Committed final batch of ${batchCount} updates`);
    }

    // 検証: 更新後のタスクタイプの分布を確認
    const allTasksSnapshot = await tasksRef.get();
    const typeCounts: Record<string, number> = {};
    allTasksSnapshot.docs.forEach(doc => {
      const type = doc.data().type || 'undefined';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    console.log('[Admin Migration] Task type distribution:', typeCounts);
    console.log('[Admin Migration] Migration completed successfully');

    res.json({
      success: true,
      stats,
      typeCounts,
    });
  } catch (error) {
    console.error('[Admin Migration] Error:', error);
    res.status(500).json({
      error: 'Migration failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/admin/fix-stage-types
 * 工程のtypeフィールドを修正（管理者のみ）
 * 子タスクから参照されているタスクを type='stage' に更新
 */
router.post('/fix-stage-types', authenticateAdmin, async (req: any, res) => {
  try {
    const orgId = req.user.orgId;
    console.log(`[Admin Migration] Starting stage type fix for org: ${orgId}`);

    const stats = {
      stagesFixed: 0,
      alreadyStages: 0,
      errors: 0,
      total: 0,
    };

    const tasksRef = db.collection('orgs').doc(orgId).collection('tasks');
    const snapshot = await tasksRef.get();
    stats.total = snapshot.size;

    console.log(`[Admin Migration] Found ${snapshot.size} total tasks`);

    // 全てのparentIdを収集
    const parentIds = new Set<string>();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.parentId && typeof data.parentId === 'string') {
        parentIds.add(data.parentId);
      }
    });

    console.log(`[Admin Migration] Found ${parentIds.size} unique parentIds`);

    if (parentIds.size === 0) {
      console.log('[Admin Migration] No parent IDs found');
      return res.json({
        success: true,
        message: 'No stages to fix. No tasks have parentId.',
        stats,
      });
    }

    // parentIdとして参照されているタスクを type='stage' に更新
    const BATCH_LIMIT = 500;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      if (parentIds.has(doc.id)) {
        const data = doc.data();
        if (data.type === 'stage') {
          stats.alreadyStages++;
          console.log(`  Task ${doc.id} already has type='stage'`);
        } else {
          batch.update(doc.ref, {
            type: 'stage',
            parentId: null, // 工程は親を持たない
            updatedAt: FieldValue.serverTimestamp(),
          });
          stats.stagesFixed++;
          batchCount++;
          console.log(`  Fixing ${doc.id}: type='${data.type || 'undefined'}' -> 'stage'`);

          if (batchCount >= BATCH_LIMIT) {
            await batch.commit();
            console.log(`[Admin Migration] Committed batch of ${batchCount} updates`);
            batch = db.batch();
            batchCount = 0;
          }
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      console.log(`[Admin Migration] Committed final batch of ${batchCount} updates`);
    }

    // 検証: 更新後のタスクタイプの分布を確認
    const allTasksSnapshot = await tasksRef.get();
    const typeCounts: Record<string, number> = {};
    allTasksSnapshot.docs.forEach(doc => {
      const type = doc.data().type || 'undefined';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    console.log('[Admin Migration] Task type distribution after fix:', typeCounts);
    console.log('[Admin Migration] Stage type fix completed successfully');

    res.json({
      success: true,
      stats,
      typeCounts,
    });
  } catch (error) {
    console.error('[Admin Migration] Error:', error);
    res.status(500).json({
      error: 'Stage type fix failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
