/**
 * MCP Gateway 認証
 *
 * 1. OAuth Bearer トークン（Firestore発行） — Claude.ai / ChatGPT 用
 * 2. Firebase Auth ID Token — 後方互換（直接トークン設定）
 */
import admin from 'firebase-admin';
import { getUser } from '../lib/firestore';
import type { McpContext } from './types';
import type { CompassOAuthProvider } from './oauth/provider';

if (!admin.apps.length) {
  admin.initializeApp();
}

let oauthProvider: CompassOAuthProvider | null = null;

export function setOAuthProvider(provider: CompassOAuthProvider): void {
  oauthProvider = provider;
}

/**
 * Authorization ヘッダーから Bearer トークンを検証し McpContext を生成する。
 * まず OAuth トークン（Firestore発行）を試し、失敗したら Firebase Auth ID トークンにフォールバック。
 */
export async function authenticateMcpRequest(
  authHeader: string | undefined
): Promise<McpContext | null> {
  if (!authHeader) return null;

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!token) return null;

  // 1. OAuth Bearer トークン（Firestore発行）を試行
  if (oauthProvider) {
    try {
      const authInfo = await oauthProvider.verifyAccessToken(token);
      const extra = authInfo.extra as { uid: string; orgId: string; role: string } | undefined;
      if (extra?.uid && extra?.orgId) {
        return {
          uid: extra.uid,
          email: '', // OAuth トークンにはメール不要
          orgId: extra.orgId,
          role: extra.role ?? 'member',
        };
      }
    } catch {
      // OAuth トークンではない — Firebase Auth にフォールバック
    }
  }

  // 2. Firebase Auth ID Token（後方互換）
  try {
    const decoded = await admin.auth().verifyIdToken(token, true);
    if (!decoded.uid) return null;

    const user = await getUser(decoded.uid);
    if (!user) {
      console.warn(`[MCP Auth] User document not found for uid: ${decoded.uid}, email: ${decoded.email ?? 'unknown'}`);
      return null;
    }

    if (!user.orgId) {
      console.warn(`[MCP Auth] User has no orgId. uid: ${decoded.uid}, email: ${user.email}`);
      return null;
    }

    return {
      uid: decoded.uid,
      email: decoded.email ?? user.email ?? '',
      orgId: user.orgId,
      role: user.role ?? 'member',
    };
  } catch (err) {
    // OAuth token verify failure is expected (not a Firebase ID token) — suppress unless debugging
    return null;
  }
}
