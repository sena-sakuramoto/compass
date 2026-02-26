/**
 * MCP OAuth 2.1 サーバープロバイダー（Firestore永続化）
 *
 * OAuthServerProvider インターフェースを実装し、
 * 認可コード・アクセストークン・リフレッシュトークンを管理する。
 */
import { randomUUID, randomBytes, createHash } from 'crypto';
import { Response } from 'express';
import admin from 'firebase-admin';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { FirestoreClientsStore } from './clients-store';
import { renderLoginPage } from './login-page';
import { getUser } from '../../lib/firestore';

const db = admin.firestore();
const CODES_COLLECTION = 'mcp_oauth_codes';
const TOKENS_COLLECTION = 'mcp_oauth_tokens';

// トークン有効期限
const ACCESS_TOKEN_TTL_SEC = 3600;       // 1時間
const REFRESH_TOKEN_TTL_SEC = 30 * 86400; // 30日
const AUTH_CODE_TTL_SEC = 600;           // 10分

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export class CompassOAuthProvider implements OAuthServerProvider {
  private _clientsStore: FirestoreClientsStore;
  private _callbackPath: string;

  constructor(callbackPath: string) {
    this._clientsStore = new FirestoreClientsStore();
    this._callbackPath = callbackPath;
  }

  get clientsStore(): FirestoreClientsStore {
    return this._clientsStore;
  }

  /**
   * 認可フロー開始: ログイン画面を表示
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const html = renderLoginPage({
      clientId: client.client_id,
      clientName: client.client_name,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: params.scopes ?? [],
      callbackUrl: this._callbackPath,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /**
   * 認可コードに紐づく code_challenge を返す（PKCE検証用）
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const doc = await db.collection(CODES_COLLECTION).doc(authorizationCode).get();
    if (!doc.exists) {
      throw new Error('Invalid authorization code');
    }
    const data = doc.data()!;

    // 有効期限チェック
    const expiresAt = data.expiresAt?.toDate?.() ?? new Date(data.expiresAt);
    if (new Date() > expiresAt) {
      await doc.ref.delete();
      throw new Error('Authorization code expired');
    }

    return data.codeChallenge;
  }

  /**
   * 認可コード → アクセストークン + リフレッシュトークン
   * Firestore トランザクションで認可コードの使い捨てを保証。
   */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const codeRef = db.collection(CODES_COLLECTION).doc(authorizationCode);

    // トランザクションで認可コードを読み取り＆削除（使い捨て保証）
    const codeData = await db.runTransaction(async (tx) => {
      const codeDoc = await tx.get(codeRef);
      if (!codeDoc.exists) {
        throw new Error('Invalid authorization code');
      }

      const data = codeDoc.data()!;

      // 有効期限チェック
      const expiresAt = data.expiresAt?.toDate?.() ?? new Date(data.expiresAt);
      if (new Date() > expiresAt) {
        tx.delete(codeRef);
        throw new Error('Authorization code expired');
      }

      // クライアントID一致チェック
      if (data.clientId !== client.client_id) {
        throw new Error('Client ID mismatch');
      }

      // redirect_uri 一致チェック（OAuth 2.1 必須）
      if (data.redirectUri && redirectUri && data.redirectUri !== redirectUri) {
        throw new Error('Redirect URI mismatch');
      }

      // 認可コード使い捨て — 即削除
      tx.delete(codeRef);

      return data;
    });

    // トークン発行
    const accessToken = generateToken();
    const refreshToken = generateToken();
    const now = new Date();

    const tokenBase = {
      uid: codeData.uid,
      orgId: codeData.orgId,
      role: codeData.role,
      clientId: client.client_id,
      scopes: codeData.scopes ?? [],
      createdAt: admin.firestore.Timestamp.fromDate(now),
    };

    // アクセストークン保存（SHA-256 ハッシュをキーに — 平文は保存しない）
    await db.collection(TOKENS_COLLECTION).doc(sha256(accessToken)).set({
      ...tokenBase,
      type: 'access',
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + ACCESS_TOKEN_TTL_SEC * 1000)
      ),
    });

    // リフレッシュトークン保存
    await db.collection(TOKENS_COLLECTION).doc(sha256(refreshToken)).set({
      ...tokenBase,
      type: 'refresh',
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000)
      ),
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SEC,
      refresh_token: refreshToken,
      scope: (codeData.scopes ?? []).join(' '),
    };
  }

  /**
   * リフレッシュトークン → 新しいアクセストークン
   * Firestore トランザクションで古いトークンの使い捨てを保証。
   */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const tokenHash = sha256(refreshToken);
    const tokenRef = db.collection(TOKENS_COLLECTION).doc(tokenHash);

    // トランザクションで古いリフレッシュトークンを読み取り＆削除
    const tokenData = await db.runTransaction(async (tx) => {
      const tokenDoc = await tx.get(tokenRef);
      if (!tokenDoc.exists) {
        throw new Error('Invalid refresh token');
      }

      const data = tokenDoc.data()!;

      if (data.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      if (data.clientId !== client.client_id) {
        throw new Error('Client ID mismatch');
      }

      // 有効期限チェック
      const expiresAt = data.expiresAt?.toDate?.() ?? new Date(data.expiresAt);
      if (new Date() > expiresAt) {
        tx.delete(tokenRef);
        throw new Error('Refresh token expired');
      }

      // 古いリフレッシュトークン無効化（ローテーション）
      tx.delete(tokenRef);

      return data;
    });

    // 新しいトークン発行
    const newAccessToken = generateToken();
    const newRefreshToken = generateToken();
    const now = new Date();

    const tokenBase = {
      uid: tokenData.uid,
      orgId: tokenData.orgId,
      role: tokenData.role,
      clientId: client.client_id,
      scopes: tokenData.scopes ?? [],
      createdAt: admin.firestore.Timestamp.fromDate(now),
    };

    await db.collection(TOKENS_COLLECTION).doc(sha256(newAccessToken)).set({
      ...tokenBase,
      type: 'access',
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + ACCESS_TOKEN_TTL_SEC * 1000)
      ),
    });

    await db.collection(TOKENS_COLLECTION).doc(sha256(newRefreshToken)).set({
      ...tokenBase,
      type: 'refresh',
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000)
      ),
    });

    return {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SEC,
      refresh_token: newRefreshToken,
      scope: (tokenData.scopes ?? []).join(' '),
    };
  }

  /**
   * アクセストークン検証
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenHash = sha256(token);
    const tokenDoc = await db.collection(TOKENS_COLLECTION).doc(tokenHash).get();

    if (!tokenDoc.exists) {
      throw new Error('Invalid access token');
    }

    const tokenData = tokenDoc.data()!;

    if (tokenData.type !== 'access') {
      throw new Error('Invalid token type');
    }

    // 有効期限チェック
    const expiresAt = tokenData.expiresAt?.toDate?.() ?? new Date(tokenData.expiresAt);
    if (new Date() > expiresAt) {
      await tokenDoc.ref.delete();
      throw new Error('Access token expired');
    }

    return {
      token,
      clientId: tokenData.clientId,
      scopes: tokenData.scopes ?? [],
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
      extra: {
        uid: tokenData.uid,
        orgId: tokenData.orgId,
        role: tokenData.role,
      },
    };
  }

  /**
   * トークン失効
   */
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const tokenHash = sha256(request.token);
    const tokenRef = db.collection(TOKENS_COLLECTION).doc(tokenHash);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) return; // 既に無効 — no-op

    const tokenData = tokenDoc.data()!;
    if (tokenData.clientId !== client.client_id) return;

    await tokenRef.delete();
  }

  // ── ヘルパー: 認可コールバック処理 ──

  /**
   * ログインフォームからの POST を処理し、認可コードを発行してリダイレクトする。
   * index.ts の /oauth/callback ルートから呼ばれる。
   */
  async handleLoginCallback(params: {
    idToken: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
    scopes: string;
  }): Promise<{ redirectUrl: string }> {
    // Firebase ID トークン検証
    const decoded = await admin.auth().verifyIdToken(params.idToken, true);
    if (!decoded.uid) {
      throw new Error('Invalid ID token');
    }

    // ユーザー情報取得
    let user = await getUser(decoded.uid);

    // UID で見つからない場合、メールアドレスでフォールバック検索
    if (!user && decoded.email) {
      console.warn(`[OAuth] User not found by UID "${decoded.uid}", trying email "${decoded.email}"...`);
      const snapshot = await db.collection('users')
        .where('email', '==', decoded.email)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        user = snapshot.docs[0].data() as any;
        console.log(`[OAuth] Found user by email. Doc ID: ${snapshot.docs[0].id}, orgId: ${user?.orgId}`);
      }
    }

    if (!user) {
      console.error(`[OAuth] User not found. UID: ${decoded.uid}, email: ${decoded.email ?? 'none'}`);
      throw new Error(
        `Compassにユーザーが登録されていません (${decoded.email ?? decoded.uid})。管理者にユーザー追加を依頼してください。`
      );
    }

    if (!user.orgId) {
      console.error(`[OAuth] User has no orgId. UID: ${decoded.uid}, email: ${user.email}`);
      throw new Error(
        `ユーザーに組織が紐付けされていません (${user.email})。管理者に問い合わせてください。`
      );
    }

    // クライアント検証
    const client = await this._clientsStore.getClient(params.clientId);
    if (!client) {
      throw new Error('Invalid client');
    }

    // redirect_uri 検証
    const registeredUris = (client.redirect_uris ?? []).map((u: string | URL) =>
      typeof u === 'string' ? u : u.toString()
    );
    if (!registeredUris.includes(params.redirectUri)) {
      throw new Error('Invalid redirect URI');
    }

    // 認可コード生成
    const code = randomUUID();
    const now = new Date();

    await db.collection(CODES_COLLECTION).doc(code).set({
      clientId: params.clientId,
      uid: decoded.uid,
      orgId: user.orgId,
      role: user.role ?? 'member',
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: params.redirectUri,
      scopes: params.scopes ? params.scopes.split(' ').filter(Boolean) : [],
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + AUTH_CODE_TTL_SEC * 1000)
      ),
      createdAt: admin.firestore.Timestamp.fromDate(now),
    });

    // リダイレクト URL 生成
    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (params.state) {
      redirectUrl.searchParams.set('state', params.state);
    }

    return { redirectUrl: redirectUrl.toString() };
  }
}
