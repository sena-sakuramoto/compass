/**
 * IndexedDB Cache Utility - 素のIndexedDB APIで実装
 *
 * 依存ライブラリなしで、TTL付きのKey-Valueキャッシュを提供する。
 * cacheGet / cacheSet / cacheDelete / cacheClear の4つのAPIのみ。
 */

const DB_NAME = 'compass-cache-v2';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number; // Unix ms
}

// ---------- キャッシュバージョン ----------
// フィールド構成変更時にインクリメントすることで旧キャッシュとの衝突を防止
const CACHE_VERSION = 'v1';

// ---------- ユーザースコープ ----------
// 全キーに uid(+orgId) プレフィックスを付与して別ユーザー・別組織のデータ混入を防止
let _scopePrefix = '';

/**
 * キャッシュのスコープを設定する。
 * ログイン時に uid を渡し、ログアウト時に '' をセットする。
 * orgId は組織切替が発生する場合に渡す（省略時は uid のみでスコープ）。
 */
export function setCacheScope(uid: string, orgId?: string): void {
  if (!uid) {
    _scopePrefix = '';
    return;
  }
  _scopePrefix = orgId ? `${CACHE_VERSION}:${uid}:${orgId}:` : `${CACHE_VERSION}:${uid}:`;
}

/** 内部: スコープ付きキーを生成 */
function scopedKey(key: string): string {
  return `${_scopePrefix}${key}`;
}

// DB接続はシングルトンで保持
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = () => resolve(req.result);

    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });

  return dbPromise;
}

/**
 * キャッシュからデータを取得する。
 * TTL切れの場合は null を返す。
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    const fullKey = scopedKey(key);
    return new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(fullKey);

      req.onsuccess = () => {
        const entry = req.result as CacheEntry<T> | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        // TTL チェック
        if (Date.now() > entry.expiresAt) {
          // 期限切れ → 非同期でクリーンアップ（結果は待たない）
          cacheDelete(key).catch(() => {});
          resolve(null);
          return;
        }
        resolve(entry.value);
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * キャッシュにデータを保存する。
 * @param ttl ミリ秒単位のTTL
 */
export async function cacheSet<T>(key: string, data: T, ttl: number): Promise<void> {
  try {
    const db = await openDB();
    const fullKey = scopedKey(key);
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry: CacheEntry<T> = {
        value: data,
        expiresAt: Date.now() + ttl,
      };
      const req = store.put(entry, fullKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[cache] cacheSet failed:', key, err);
  }
}

/**
 * キャッシュから特定のキーを削除する。
 */
export async function cacheDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    const fullKey = scopedKey(key);
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(fullKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[cache] cacheDelete failed:', key, err);
  }
}

/**
 * キャッシュ内のすべてのエントリを削除する。
 */
export async function cacheClear(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[cache] cacheClear failed:', err);
  }
}

/**
 * 指定プレフィックスに一致するキャッシュを全削除する。
 * スコーププレフィックスは自動付与される。
 * 例: cacheDeleteByPrefix('tasks') → '{uid}:tasks*' を全削除
 */
export async function cacheDeleteByPrefix(prefix: string): Promise<void> {
  try {
    const db = await openDB();
    const fullPrefix = scopedKey(prefix);
    return new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          if (typeof cursor.key === 'string' && cursor.key.startsWith(fullPrefix)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      req.onerror = () => resolve();
    });
  } catch {
    // ignore - IDB unavailable
  }
}

// ---------- キャッシュキー定数 ----------

/** タスクキャッシュのプレフィックス (パラメータごとにキーが異なる) */
export const CACHE_KEY_TASKS = 'tasks';
/** プロジェクト一覧 */
export const CACHE_KEY_PROJECTS = 'projects';
/** メンバー候補 (プロジェクトIDサフィックス付き) */
export const CACHE_KEY_MANAGEABLE_USERS_PREFIX = 'manageable-users:';
/** 協力者一覧 */
export const CACHE_KEY_COLLABORATORS = 'collaborators';
/** プロジェクトメンバー（プロジェクトIDサフィックス付き） */
export const CACHE_KEY_PROJECT_MEMBERS_PREFIX = 'project-members:';

// ---------- TTL定数 ----------

/** タスク・プロジェクトの IndexedDB TTL: 5分 */
export const TTL_SHORT = 5 * 60 * 1000;
/** メンバー候補・協力者の IndexedDB TTL: 24時間 */
export const TTL_LONG = 24 * 60 * 60 * 1000;

// ---------- staleTime定数 ----------

/** タスク・プロジェクトの staleTime: 30秒 */
export const STALE_TIME_SHORT = 30_000;
/** メンバー候補・協力者の staleTime: 5分 */
export const STALE_TIME_LONG = 5 * 60 * 1000;
