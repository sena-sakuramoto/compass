#!/usr/bin/env node
/**
 * Data cleanup script to:
 * 1. Transfer tasks from "櫻本" to "櫻本聖成"
 * 2. Remove invalid assignees from tasks
 * 3. Remove invalid project members
 */

import admin from 'firebase-admin';
import { deriveTaskFields } from './lib/progress';
import type { TaskInput } from './lib/firestore';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'compass-31e9e',
  });
}

const db = admin.firestore();
const ORG_ID = process.env.ORG_ID ?? 'archi-prisma';

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
 * Clean up task assignees
 */
async function cleanupTaskAssignees() {
  console.log('\n=== Cleaning up task assignees ===');
  console.log(`Valid users: ${VALID_USERS.join(', ')}`);

  const tasksRef = db.collection('orgs').doc(ORG_ID).collection('tasks');
  const snapshot = await tasksRef.get();

  console.log(`Found ${snapshot.size} tasks to check`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const batch = db.batch();
  let batchCount = 0;
  const BATCH_SIZE = 500;

  for (const doc of snapshot.docs) {
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
        // Update both 担当者 and assignee fields
        const updates: any = {
          担当者: newAssignee,
          assignee: newAssignee,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        batch.update(doc.ref, updates);
        updated++;
        batchCount++;

        // Commit batch if it reaches the limit
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`  Committed batch of ${batchCount} updates`);
          batchCount = 0;
        }
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`  Error processing task ${doc.id}:`, error);
      errors++;
    }
  }

  // Commit remaining updates
  if (batchCount > 0) {
    await batch.commit();
    console.log(`  Committed final batch of ${batchCount} updates`);
  }

  console.log('\nTask cleanup complete:');
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total: ${snapshot.size}`);

  return { updated, skipped, errors };
}

/**
 * Get user IDs for valid users
 */
async function getValidUserIds(): Promise<string[]> {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('orgId', '==', ORG_ID).get();

  const validIds: string[] = [];

  for (const doc of snapshot.docs) {
    const userData = doc.data();
    if (VALID_USERS.includes(userData.displayName)) {
      validIds.push(doc.id);
    }
  }

  console.log(`Valid user IDs: ${validIds.join(', ')}`);
  return validIds;
}

/**
 * Clean up project members
 */
async function cleanupProjectMembers() {
  console.log('\n=== Cleaning up project members ===');

  const validUserIds = await getValidUserIds();
  console.log(`Valid user IDs: ${validUserIds.join(', ')}`);

  // Get all project members from top-level collection
  const membersRef = db.collection('project_members');
  const snapshot = await membersRef.where('orgId', '==', ORG_ID).get();

  console.log(`Found ${snapshot.size} project members to check`);

  let deleted = 0;
  let kept = 0;
  let errors = 0;

  const batch = db.batch();
  let batchCount = 0;
  const BATCH_SIZE = 500;

  for (const doc of snapshot.docs) {
    try {
      const memberData = doc.data();
      const userId = memberData.userId;

      // Check if this is a valid user
      const isValid = validUserIds.includes(userId) || userId.startsWith('pending_');

      if (!isValid) {
        console.log(`  Removing member ${doc.id}: userId=${userId}, displayName=${memberData.displayName}`);
        batch.delete(doc.ref);
        deleted++;
        batchCount++;

        // Commit batch if it reaches the limit
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`  Committed batch of ${batchCount} deletions`);
          batchCount = 0;
        }
      } else {
        kept++;
      }
    } catch (error) {
      console.error(`  Error processing member ${doc.id}:`, error);
      errors++;
    }
  }

  // Commit remaining deletions
  if (batchCount > 0) {
    await batch.commit();
    console.log(`  Committed final batch of ${batchCount} deletions`);
  }

  console.log('\nProject member cleanup complete:');
  console.log(`  Deleted: ${deleted}`);
  console.log(`  Kept: ${kept}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total: ${snapshot.size}`);

  return { deleted, kept, errors };
}

/**
 * Main cleanup function
 */
async function runCleanup() {
  console.log(`\n========================================`);
  console.log(`Starting data cleanup for org: ${ORG_ID}`);
  console.log(`========================================`);

  // Step 1: Clean up task assignees
  await cleanupTaskAssignees();

  // Step 2: Clean up project members
  await cleanupProjectMembers();

  console.log(`\n========================================`);
  console.log(`Data cleanup completed successfully!`);
  console.log(`========================================\n`);
}

// Run cleanup
runCleanup()
  .then(() => {
    console.log('Cleanup finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  });
