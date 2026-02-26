/**
 * ChatGPT 用 OAuth クライアント登録ヘルパー
 *
 * ワンタイム実行:
 *   npx ts-node -e "require('./register-client').registerGptClient()"
 * または Firebase Functions として公開して一度だけ呼ぶ。
 *
 * 生成された client_id と client_secret を GPT Builder に設定する。
 */
import { randomUUID, randomBytes } from 'crypto';
import admin from 'firebase-admin';

const COLLECTION = 'mcp_oauth_clients';

export interface GptClientRegistration {
  client_id: string;
  client_secret: string;
  client_name: string;
  redirect_uris: string[];
}

/**
 * ChatGPT 用クライアントを Firestore に登録する。
 *
 * @param redirectUris ChatGPT が使用するリダイレクト URI の配列
 *   GPT Builder の設定画面に表示される Callback URL を指定。
 *   例: ["https://chat.openai.com/aip/g-XXXX/oauth/callback"]
 */
export async function registerGptClient(
  redirectUris: string[] = []
): Promise<GptClientRegistration> {
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();

  const clientId = `gpt-${randomUUID()}`;
  const clientSecret = randomBytes(32).toString('base64url');

  const clientInfo = {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: 'ChatGPT Custom GPT',
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection(COLLECTION).doc(clientId).set(clientInfo);

  console.log('=== ChatGPT OAuth Client Registered ===');
  console.log(`Client ID:     ${clientId}`);
  console.log(`Client Secret: ${clientSecret}`);
  console.log(`Redirect URIs: ${redirectUris.join(', ') || '(none — set later in GPT Builder)'}`);
  console.log('========================================');
  console.log('');
  console.log('GPT Builder に以下を設定:');
  console.log(`  Authentication:     OAuth`);
  console.log(`  Client ID:          ${clientId}`);
  console.log(`  Client Secret:      ${clientSecret}`);
  console.log(`  Authorization URL:  https://compass-31e9e.web.app/gpt/authorize`);
  console.log(`  Token URL:          https://compass-31e9e.web.app/gpt/token`);
  console.log(`  Scope:              compass:read compass:write`);

  return {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: 'ChatGPT Custom GPT',
    redirect_uris: redirectUris,
  };
}
