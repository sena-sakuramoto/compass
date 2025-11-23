import { Router } from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getUser } from '../lib/users';
import { resolveAuthHeader, verifyToken } from '../lib/auth';
import { canManageUsers } from '../lib/access-control';
import type { TaskInput } from '../lib/firestore';

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

export default router;
