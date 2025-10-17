#!/usr/bin/env node
/**
 * Migrate existing tasks to add start/end fields derived from date fields
 * This script updates all tasks in Firestore to ensure they have proper start/end dates
 */

import admin from 'firebase-admin';
import { deriveTaskFields } from './lib/progress';
import type { TaskInput } from './lib/firestore';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const ORG_ID = process.env.ORG_ID ?? 'archi-prisma';

async function migrateTaskDates() {
  console.log(`Starting migration for org: ${ORG_ID}`);
  
  const tasksRef = db.collection('orgs').doc(ORG_ID).collection('tasks');
  const snapshot = await tasksRef.get();
  
  console.log(`Found ${snapshot.size} tasks to migrate`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  const batch = db.batch();
  let batchCount = 0;
  const BATCH_SIZE = 500;
  
  for (const doc of snapshot.docs) {
    try {
      const data = doc.data() as TaskInput;
      
      // Derive start/end fields
      const derived = deriveTaskFields(data);
      
      // Check if update is needed
      const needsUpdate = 
        data.start !== derived.start ||
        data.end !== derived.end ||
        data.duration_days !== derived.duration_days ||
        data.progress !== derived.progress ||
        data.assignee !== derived.assignee;
      
      if (needsUpdate) {
        batch.update(doc.ref, {
          start: derived.start,
          end: derived.end,
          duration_days: derived.duration_days,
          progress: derived.progress,
          assignee: derived.assignee,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        updated++;
        batchCount++;
        
        console.log(`Updating task ${doc.id}:`, {
          予定開始日: data.予定開始日,
          期限: data.期限,
          start: derived.start,
          end: derived.end,
        });
        
        // Commit batch if it reaches the limit
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`Committed batch of ${batchCount} updates`);
          batchCount = 0;
        }
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`Error processing task ${doc.id}:`, error);
      errors++;
    }
  }
  
  // Commit remaining updates
  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${batchCount} updates`);
  }
  
  console.log('\nMigration complete:');
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total: ${snapshot.size}`);
}

// Run migration
migrateTaskDates()
  .then(() => {
    console.log('Migration finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

