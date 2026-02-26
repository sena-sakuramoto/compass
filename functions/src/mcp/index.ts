/**
 * MCP Gateway Express アプリ
 *
 * OAuth 2.1 エンドポイント:
 *   /.well-known/oauth-protected-resource/mcp  — リソースメタデータ
 *   /.well-known/oauth-authorization-server     — AS メタデータ
 *   /authorize                                  — 認可（ログイン画面）
 *   /token                                      — トークン発行/更新
 *   /register                                   — 動的クライアント登録
 *   /revoke                                     — トークン失効
 *   /oauth/callback                             — ログインコールバック
 *
 * MCP エンドポイント:
 *   POST   /mcp    — JSON-RPC over Streamable HTTP（ステートレス）
 *   GET    /mcp    — 405（SSE 不要）
 *   DELETE /mcp    — 200（no-op）
 *
 * ヘルスチェック:
 *   GET /health
 */
import express from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { authenticateMcpRequest, setOAuthProvider } from './auth';
import { createMcpServer } from './server';
import { CompassOAuthProvider } from './oauth/provider';
import { gptOAuthRouter } from './gpt/oauth';
import { gptRestApiRouter } from './gpt/rest-api';
import { serveOpenApiSpec } from './gpt/openapi';

const mcpApp = express();

// MCP クライアントは任意のオリジンから接続する
mcpApp.use(cors({ origin: true, credentials: true }));
mcpApp.use(express.json());
mcpApp.use(express.urlencoded({ extended: true }));

// ── OAuth 2.1 セットアップ ──

// issuerUrl は Firebase Function の公開 URL
// firebase deploy 後に自動で決まる。実行時に req.headers.host から推定する。
// ただし mcpAuthRouter は起動時に URL が必要なので、環境変数またはデフォルトを使う。
// Hosting 経由でアクセスされるため、issuer は Hosting ドメイン
const GATEWAY_URL = process.env.MCP_GATEWAY_URL
  || 'https://compass-31e9e.web.app';
const issuerUrl = new URL(GATEWAY_URL);

const oauthProvider = new CompassOAuthProvider('/oauth/callback');

// auth.ts にプロバイダーを渡す（Bearer トークン検証用）
setOAuthProvider(oauthProvider);

// MCP SDK の OAuth ルーター（メタデータ + authorize + token + register + revoke）
mcpApp.use(mcpAuthRouter({
  provider: oauthProvider,
  issuerUrl,
  // MCP リソースサーバーの URL（/mcp エンドポイント）
  resourceServerUrl: new URL('/mcp', issuerUrl),
  resourceName: 'Compass MCP Gateway',
  scopesSupported: ['compass:read', 'compass:write'],
}));

// ── OAuth コールバック（ログインフォーム送信先） ──
mcpApp.post('/oauth/callback', async (req, res) => {
  try {
    const { id_token, client_id, redirect_uri, code_challenge, state, scopes } = req.body;

    if (!id_token || !client_id || !redirect_uri || !code_challenge) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    const { redirectUrl } = await oauthProvider.handleLoginCallback({
      idToken: id_token,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      state: state ?? '',
      scopes: scopes ?? '',
    });

    res.redirect(302, redirectUrl);
  } catch (err) {
    console.error('[MCP OAuth] Callback error:', err);
    res.status(400).json({
      error: 'login_failed',
      error_description: err instanceof Error ? err.message : 'Authentication failed',
    });
  }
});

// ── POST /mcp — メインの JSON-RPC エンドポイント ──
mcpApp.post('/mcp', async (req, res) => {
  try {
    // 認証（OAuth Bearer or Firebase Auth ID Token）
    const context = await authenticateMcpRequest(
      req.headers.authorization as string | undefined
    );
    if (!context) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: valid access token required' },
        id: null,
      });
      return;
    }

    // ステートレス: リクエスト毎にサーバー+トランスポートを生成
    const server = createMcpServer(context);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // ステートレス — セッションID不要
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      await transport.close?.();
      await server.close();
    }
  } catch (err) {
    console.error('[MCP] Error handling POST /mcp:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// ── GET /mcp — SSE は使わない（ステートレス） ──
mcpApp.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method Not Allowed. This server is stateless — use POST only.',
    },
    id: null,
  });
});

// ── DELETE /mcp — セッション終了（no-op） ──
mcpApp.delete('/mcp', (_req, res) => {
  res.status(200).json({ ok: true });
});

// ── ChatGPT Custom GPT 用エンドポイント ──
mcpApp.use('/gpt', gptOAuthRouter(oauthProvider));
mcpApp.use('/gpt/api/v1', gptRestApiRouter);
mcpApp.get('/gpt/openapi.json', serveOpenApiSpec);
mcpApp.get('/gpt/health', (_req, res) => {
  res.json({ ok: true, service: 'compass-gpt-gateway' });
});

// ── ヘルスチェック ──
mcpApp.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'compass-mcp-gateway' });
});

export { mcpApp };
