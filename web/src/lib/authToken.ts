/**
 * Firebase IDトークンの短期キャッシュ & デデュープ
 *
 * 目的：
 * - 毎回Firebase Auth APIを呼ぶのを防ぐ
 * - 同時多発的な取得リクエストを1本にまとめる
 * - ログ出力の削減
 */

import { getAuth } from 'firebase/auth';
import { getFirebaseApp } from './firebaseClient';

interface TokenCache {
  value?: string;
  exp?: number;
  promise?: Promise<string | undefined>;
}

const tokenCache: TokenCache = {};

/**
 * JWT expiry を取得（簡易的にBase64デコード）
 */
function getTokenExpiry(token: string): number | undefined {
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(atob(payload));
    // exp は秒単位のUNIX時刻なので、ミリ秒に変換
    return decoded.exp ? decoded.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * キャッシュされたIDトークンを取得
 *
 * - 有効期限内ならキャッシュを返す
 * - 期限切れなら再取得
 * - 同時リクエストはデデュープ（1本のPromiseを共有）
 */
export async function getCachedIdToken(): Promise<string | undefined> {
  const now = Date.now();

  // 1. キャッシュが有効ならそれを返す
  if (tokenCache.value && tokenCache.exp && now < tokenCache.exp) {
    // console.log('[authToken] ✅ Using cached token (expires in', Math.round((tokenCache.exp - now) / 1000), 'seconds)');
    return tokenCache.value;
  }

  // 2. 既に取得中のPromiseがあればそれを返す（デデュープ）
  if (tokenCache.promise) {
    // console.log('[authToken] ⏳ Waiting for in-flight token request...');
    return tokenCache.promise;
  }

  // 3. 新規取得
  const promise = (async (): Promise<string | undefined> => {
    try {
      const app = getFirebaseApp();
      if (!app) {
        console.log('[authToken] Firebase app not initialized');
        return undefined;
      }

      const auth = getAuth(app);
      const user = auth.currentUser;

      if (!user) {
        console.log('[authToken] ❌ No authenticated user');
        return undefined;
      }

      // forceRefresh=false でキャッシュされたトークンを使用
      const token = await user.getIdToken(false);

      // JWT expiryを取得して安全側にマージンを引く（5分前に期限切れとみなす）
      const expiry = getTokenExpiry(token);
      const ttl = expiry ? expiry - now - (5 * 60 * 1000) : 4 * 60 * 1000; // デフォルト4分

      tokenCache.value = token;
      tokenCache.exp = now + Math.max(ttl, 60 * 1000); // 最低1分はキャッシュ
      tokenCache.promise = undefined;

      console.log('[authToken] 🔑 New token obtained from Firebase Auth');
      console.log('[authToken] Token preview:', token.substring(0, 30) + '...');
      console.log('[authToken] Cache valid for', Math.round(ttl / 1000), 'seconds');

      return token;
    } catch (error) {
      console.error('[authToken] ❌ Failed to get token:', error);
      tokenCache.promise = undefined;
      return undefined;
    }
  })();

  tokenCache.promise = promise;

  return tokenCache.promise;
}

/**
 * トークンキャッシュをクリア
 * ログアウト時などに呼び出す
 */
export function clearTokenCache(): void {
  tokenCache.value = undefined;
  tokenCache.exp = undefined;
  tokenCache.promise = undefined;
  console.log('[authToken] Cache cleared');
}

/**
 * fetchWithAuth: 認証ヘッダーを自動的に付与するfetchヘルパー
 */
export async function fetchWithAuth(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const token = await getCachedIdToken();
  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
