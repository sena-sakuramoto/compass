/**
 * ChatGPT Custom GPT 用 OAuth エンドポイント（PKCE なし）
 *
 * ChatGPT は OAuth 2.0 (PKCE 非対応) のため、
 * 既存の MCP OAuth 2.1 フローとは別に PKCE なしのエンドポイントを提供する。
 *
 *   GET  /gpt/authorize  — ログイン画面表示
 *   POST /gpt/callback   — ログイン処理 → 認可コード発行
 *   POST /gpt/token      — 認可コード/リフレッシュトークン → アクセストークン
 */
import { Router } from 'express';
import type { CompassOAuthProvider } from '../oauth/provider';
import { renderLoginPage } from '../oauth/login-page';

/**
 * ChatGPT 用 OAuth ルーターを生成する。
 * 既存の OAuthProvider のメソッドを直接呼び出し、PKCE バリデーションを迂回する。
 */
export function gptOAuthRouter(oauthProvider: CompassOAuthProvider): Router {
  const router = Router();

  // ── GET /gpt/authorize — ログイン画面表示 ──
  router.get('/authorize', async (req, res) => {
    try {
      const {
        client_id,
        redirect_uri,
        response_type,
        scope,
        state,
      } = req.query as Record<string, string>;

      if (!client_id || !redirect_uri) {
        res.status(400).json({ error: 'client_id and redirect_uri are required' });
        return;
      }

      if (response_type && response_type !== 'code') {
        res.status(400).json({ error: 'Only response_type=code is supported' });
        return;
      }

      // クライアント検証
      const client = await oauthProvider.clientsStore.getClient(client_id);
      if (!client) {
        res.status(400).json({ error: 'Unknown client_id' });
        return;
      }

      const scopes = scope ? scope.split(' ').filter(Boolean) : [];

      const html = renderLoginPage({
        clientId: client_id,
        clientName: client.client_name,
        redirectUri: redirect_uri,
        codeChallenge: '',  // PKCE なし — 空文字
        state,
        scopes,
        callbackUrl: '/gpt/callback',
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      console.error('[GPT OAuth] Authorize error:', err);
      res.status(500).json({
        error: 'server_error',
        error_description: err instanceof Error ? err.message : 'Internal error',
      });
    }
  });

  // ── POST /gpt/callback — ログイン処理 → 認可コード発行 ──
  router.post('/callback', async (req, res) => {
    try {
      const { id_token, client_id, redirect_uri, state, scopes } = req.body;

      if (!id_token || !client_id || !redirect_uri) {
        res.status(400).json({ error: 'Missing required parameters' });
        return;
      }

      // handleLoginCallback は codeChallenge を空文字で呼ぶ（PKCE なし）
      const { redirectUrl } = await oauthProvider.handleLoginCallback({
        idToken: id_token,
        clientId: client_id,
        redirectUri: redirect_uri,
        codeChallenge: '',  // PKCE なし
        state: state ?? '',
        scopes: scopes ?? '',
      });

      res.redirect(302, redirectUrl);
    } catch (err) {
      console.error('[GPT OAuth] Callback error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';

      // ログイン画面にエラーを表示して再試行できるようにする
      const html = renderLoginPage({
        clientId: req.body.client_id ?? '',
        redirectUri: req.body.redirect_uri ?? '',
        codeChallenge: '',
        state: req.body.state ?? '',
        scopes: req.body.scopes ? req.body.scopes.split(' ') : [],
        callbackUrl: '/gpt/callback',
        error: errorMessage,
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(400).send(html);
    }
  });

  // ── POST /gpt/token — トークン発行/更新 ──
  router.post('/token', async (req, res) => {
    try {
      const {
        grant_type,
        code,
        redirect_uri,
        client_id,
        client_secret,
        refresh_token,
      } = req.body;

      if (!client_id) {
        res.status(400).json({ error: 'invalid_request', error_description: 'client_id is required' });
        return;
      }

      // クライアント認証
      const client = await oauthProvider.clientsStore.getClient(client_id);
      if (!client) {
        res.status(401).json({ error: 'invalid_client', error_description: 'Unknown client' });
        return;
      }

      // client_secret 検証（ChatGPT は client_secret を送る）
      if (client.client_secret && client.client_secret !== client_secret) {
        res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client_secret' });
        return;
      }

      if (grant_type === 'authorization_code') {
        if (!code) {
          res.status(400).json({ error: 'invalid_request', error_description: 'code is required' });
          return;
        }

        // exchangeAuthorizationCode を直接呼ぶ（SDK 経由しない → PKCE バリデーション不要）
        const tokens = await oauthProvider.exchangeAuthorizationCode(
          client,
          code,
          undefined,     // codeVerifier: PKCE なし
          redirect_uri,
        );

        res.json(tokens);
      } else if (grant_type === 'refresh_token') {
        if (!refresh_token) {
          res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token is required' });
          return;
        }

        const tokens = await oauthProvider.exchangeRefreshToken(
          client,
          refresh_token,
        );

        res.json(tokens);
      } else {
        res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code and refresh_token are supported',
        });
      }
    } catch (err) {
      console.error('[GPT OAuth] Token error:', err);
      res.status(400).json({
        error: 'invalid_grant',
        error_description: err instanceof Error ? err.message : 'Token exchange failed',
      });
    }
  });

  return router;
}
