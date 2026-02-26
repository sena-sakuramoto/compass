/**
 * MCP Gateway の型定義
 */

/** MCP リクエスト毎に解決される認証コンテキスト */
export interface McpContext {
  uid: string;
  email: string;
  orgId: string;
  role: string;
}
