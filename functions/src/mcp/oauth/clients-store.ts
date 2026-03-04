/**
 * MCP OAuth 動的クライアント登録ストア（Firestore永続化）
 *
 * Claude.ai / ChatGPT が自動でクライアント登録するために必要。
 * RFC 7591 Dynamic Client Registration に準拠。
 *
 * Note: SDK の registration handler が client_id / client_secret を生成した上で
 * registerClient() を呼ぶため、このストアは受け取ったデータをそのまま永続化する。
 */
import admin from 'firebase-admin';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

const db = admin.firestore();
const COLLECTION = 'mcp_oauth_clients';

export class FirestoreClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const doc = await db.collection(COLLECTION).doc(clientId).get();
    if (!doc.exists) return undefined;
    return doc.data() as OAuthClientInformationFull;
  }

  async registerClient(
    clientInfo: OAuthClientInformationFull
  ): Promise<OAuthClientInformationFull> {
    // SDK が client_id を生成済み（runtime では Omit 型でも実際には含まれる）
    const clientId = clientInfo.client_id;

    await db.collection(COLLECTION).doc(clientId).set({
      ...clientInfo,
      // Firestore 用: URL オブジェクトを文字列に変換
      redirect_uris: (clientInfo.redirect_uris ?? []).map((u: string | URL) =>
        typeof u === 'string' ? u : u.toString()
      ),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return clientInfo;
  }
}
