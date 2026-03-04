/**
 * 冪等性キー管理
 * `orgs/{orgId}/mcp_idempotency/{key}` に結果を保存。
 * 同じキーが再度送信された場合、保存済みの結果を返す。
 */
import admin from 'firebase-admin';
import crypto from 'crypto';
import { db } from '../../lib/firestore';

/** 24時間（ミリ秒） */
const TTL_MS = 24 * 60 * 60 * 1000;

interface IdempotencyRecord {
  result: unknown;
  createdAt: FirebaseFirestore.Timestamp;
}

/**
 * キーを SHA-256 ハッシュに変換してFirestore ドキュメントIDとして安全にする。
 * Firestore doc ID は `/` を含めないため。
 */
function sanitizeKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * 冪等性キーで既存結果を検索する。
 * 存在して TTL 内であれば結果を返す。期限切れまたは未登録なら null。
 */
export async function findIdempotent(
  orgId: string,
  key: string
): Promise<unknown | null> {
  const docId = sanitizeKey(key);
  const doc = await db
    .collection('orgs')
    .doc(orgId)
    .collection('mcp_idempotency')
    .doc(docId)
    .get();

  if (!doc.exists) return null;

  const data = doc.data() as IdempotencyRecord;
  const createdMs =
    data.createdAt instanceof admin.firestore.Timestamp
      ? data.createdAt.toMillis()
      : 0;

  if (Date.now() - createdMs > TTL_MS) {
    // 期限切れ — 削除して null を返す
    await doc.ref.delete();
    return null;
  }

  return data.result;
}

/**
 * 冪等性キーに結果を保存する。
 */
export async function saveIdempotent(
  orgId: string,
  key: string,
  result: unknown
): Promise<void> {
  const docId = sanitizeKey(key);
  await db
    .collection('orgs')
    .doc(orgId)
    .collection('mcp_idempotency')
    .doc(docId)
    .set({
      result,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}
