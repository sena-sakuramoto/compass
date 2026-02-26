/**
 * Per-User Google OAuth クライアント
 * ユーザーごとのOAuthトークンを使ってGoogle API操作を行う
 */

import { google } from 'googleapis';
import admin from 'firebase-admin';

const db = admin.firestore();

export interface GoogleTokens {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  scope: string;
  connectedEmail: string;
  connectedAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.');
  }
  return new google.auth.OAuth2(clientId, clientSecret);
}

/**
 * Firestoreからユーザーのトークンを取得
 */
export async function getUserGoogleTokens(uid: string): Promise<GoogleTokens | null> {
  const doc = await db.collection('users').doc(uid).collection('private').doc('googleTokens').get();
  if (!doc.exists) return null;
  return doc.data() as GoogleTokens;
}

/**
 * ユーザーがGoogleアカウントを接続済みか確認
 */
export async function isGoogleConnected(uid: string): Promise<boolean> {
  const tokens = await getUserGoogleTokens(uid);
  return tokens !== null && !!tokens.refreshToken;
}

/**
 * トークンを保存
 */
export async function saveGoogleTokens(uid: string, data: Partial<GoogleTokens>): Promise<void> {
  await db.collection('users').doc(uid).collection('private').doc('googleTokens').set(
    {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * トークンを削除
 */
export async function deleteGoogleTokens(uid: string): Promise<void> {
  await db.collection('users').doc(uid).collection('private').doc('googleTokens').delete();
}

/**
 * 認証済みOAuth2クライアントを取得（トークン自動リフレッシュ付き）
 */
async function getAuthedOAuthClient(uid: string) {
  const tokens = await getUserGoogleTokens(uid);
  if (!tokens?.refreshToken) {
    throw new Error('Google account not connected');
  }

  const oauth2 = getOAuthClient();
  oauth2.setCredentials({
    refresh_token: tokens.refreshToken,
    access_token: tokens.accessToken,
    expiry_date: tokens.expiresAt,
  });

  // トークンリフレッシュ時にFirestoreも更新
  oauth2.on('tokens', async (newTokens) => {
    const update: Partial<GoogleTokens> = {};
    if (newTokens.access_token) update.accessToken = newTokens.access_token;
    if (newTokens.expiry_date) update.expiresAt = newTokens.expiry_date;
    if (Object.keys(update).length > 0) {
      await saveGoogleTokens(uid, update);
    }
  });

  return oauth2;
}

/**
 * ユーザーのDriveクライアントを取得
 */
export async function getUserDriveClient(uid: string) {
  const auth = await getAuthedOAuthClient(uid);
  return google.drive({ version: 'v3', auth });
}

/**
 * ユーザーのChatクライアントを取得
 */
export async function getUserChatClient(uid: string) {
  const auth = await getAuthedOAuthClient(uid);
  return google.chat({ version: 'v1', auth });
}

/**
 * Authorization codeをトークンに交換して保存
 */
export async function exchangeCodeForTokens(
  uid: string,
  code: string,
  redirectUri?: string
): Promise<{ email: string }> {
  const oauth2 = getOAuthClient();

  const { tokens } = await oauth2.getToken({
    code,
    redirect_uri: redirectUri || 'postmessage',
  });

  if (!tokens.refresh_token) {
    throw new Error('No refresh token received. Please revoke access and try again.');
  }

  // トークンからメールアドレスを取得
  oauth2.setCredentials(tokens);
  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
  const userInfo = await oauth2Api.userinfo.get();
  const email = userInfo.data.email || '';

  await saveGoogleTokens(uid, {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token || '',
    expiresAt: tokens.expiry_date || 0,
    scope: tokens.scope || '',
    connectedEmail: email,
    connectedAt: admin.firestore.Timestamp.now(),
  });

  return { email };
}

/**
 * Googleアカウントの接続を解除（トークン失効 + 削除）
 */
export async function revokeGoogleConnection(uid: string): Promise<void> {
  const tokens = await getUserGoogleTokens(uid);
  if (tokens?.accessToken) {
    try {
      const oauth2 = getOAuthClient();
      await oauth2.revokeToken(tokens.accessToken);
    } catch (err) {
      console.warn('[perUserGoogleClient] Failed to revoke token (may already be expired):', err);
    }
  }
  await deleteGoogleTokens(uid);
}
