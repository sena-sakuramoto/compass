/**
 * 組織関連のユーティリティ関数
 */

/**
 * 組織のキーを取得（グルーピング用）
 * orgId が優先、なければ orgName、どちらもなければ 'unknown'
 */
export function getOrgKey(orgId?: string | null, orgName?: string | null): string {
  return orgId?.trim() || orgName?.trim() || 'unknown';
}

/**
 * 組織の表示ラベルを取得
 * orgName が優先、なければ orgId、どちらもなければ '不明な組織'
 */
export function getOrgLabel(orgId?: string | null, orgName?: string | null): string {
  return orgName?.trim() || orgId?.trim() || '不明な組織';
}
