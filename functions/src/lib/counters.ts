// ID採番ユーティリティ

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { ensureFirebaseAdmin } from './firebaseAdmin';

ensureFirebaseAdmin();

const ORG_ID = process.env.ORG_ID || 'archi-prisma';

/**
 * プロジェクトIDを採番（P-%04d形式）
 * @param orgId 組織ID（指定しない場合はデフォルトのORG_IDを使用）
 */
export async function getNextProjectId(orgId?: string): Promise<string> {
  const db = getFirestore();
  const targetOrgId = orgId || ORG_ID;
  const counterRef = db.doc(`orgs/${targetOrgId}/counters/projects`);

  const result = await db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);

    let nextValue = 1;
    if (counterDoc.exists) {
      const data = counterDoc.data();
      nextValue = (data?.value ?? 0) + 1;
    }

    transaction.set(counterRef, { value: nextValue }, { merge: true });

    return nextValue;
  });

  return `P-${String(result).padStart(4, '0')}`;
}

/**
 * タスクIDを採番（T%06d形式）
 */
export async function getNextTaskId(): Promise<string> {
  const db = getFirestore();
  const counterRef = db.doc(`orgs/${ORG_ID}/counters/tasks`);

  const result = await db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);

    let nextValue = 1;
    if (counterDoc.exists) {
      const data = counterDoc.data();
      nextValue = (data?.value ?? 0) + 1;
    }

    transaction.set(counterRef, { value: nextValue }, { merge: true });

    return nextValue;
  });

  return `T${String(result).padStart(6, '0')}`;
}

/**
 * ジョブIDを採番（JOB-%08d形式）
 */
export async function getNextJobId(): Promise<string> {
  const db = getFirestore();
  const counterRef = db.doc(`orgs/${ORG_ID}/counters/jobs`);

  const result = await db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);

    let nextValue = 1;
    if (counterDoc.exists) {
      const data = counterDoc.data();
      nextValue = (data?.value ?? 0) + 1;
    }

    transaction.set(counterRef, { value: nextValue }, { merge: true });

    return nextValue;
  });

  return `JOB-${String(result).padStart(8, '0')}`;
}

/**
 * Driveフォルダ連番を採番
 * @param orgId 組織ID
 * @param startNumber 開始番号（カウンター初回作成時に使用）
 * @returns 次の番号（数値）
 */
export async function getNextDriveFolderNumber(orgId: string, startNumber: number = 1): Promise<number> {
  const db = getFirestore();
  const counterRef = db.doc(`orgs/${orgId}/counters/drive-folders`);

  return db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);

    let nextValue: number;
    if (counterDoc.exists) {
      nextValue = (counterDoc.data()?.value ?? startNumber - 1) + 1;
    } else {
      nextValue = startNumber;
    }

    transaction.set(counterRef, { value: nextValue }, { merge: true });
    return nextValue;
  });
}

