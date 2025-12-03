# 作業メモ - プロジェクトメンバーに協力者を追加する機能

## 日付: 2025-12-02

## 完了した作業

### 1. 組織レベル権限の優先実装 ✅
- `functions/src/lib/access-control.ts`を修正
- super_admin, admin, project_managerは常にプロジェクトを管理可能
- デプロイ済み（Functions v0.1.1）

### 2. 人員管理ページの機能 ✅
- クライアント名の編集機能（クリックで編集モード）
- 協力者名の編集機能（クリックで編集モード）
- 協力者の追加・削除機能
- デプロイ済み

### 3. 協力者API実装 ✅
- `functions/src/api/collaborators-api.ts`作成
- GET /api/collaborators（一覧取得）
- POST /api/collaborators（作成）
- PATCH /api/collaborators/:id（更新）
- DELETE /api/collaborators/:id（削除）
- `functions/src/index.ts`にルーター登録済み
- デプロイ済み

### 4. プロジェクトメンバー追加機能（コード実装済み）✅
- `web/src/components/ProjectMembersDialog.tsx`に協力者選択機能を追加
- `loadCollaborators()`関数実装
- 協力者セクションのUI実装
- デバッグログ追加
- デプロイ済み（hosting, build: index-CUYFKuWx.js）

### 5. デバッグ機能の強化 ✅ (NEW - 2025-12-02)
- `ProjectMembersDialog.tsx`に以下のデバッグログを追加:
  1. コンポーネントマウント/アン マウント時のログ
  2. レンダリング時の状態ログ（showInviteForm, collaborators.length, inputMode）
  3. 「メンバーを追加/招待」ボタンクリック時のログ
- コード位置:
  - マウントログ: lines 54-59
  - レンダリングログ: line 306-308
  - ボタンクリックログ: lines 380-383

## 解決した問題 ✅

### ProjectEditDialogでの協力者追加機能（2025-12-02 最終解決）

**問題の経緯:**
1. 協力者選択UIは表示されるが、追加しようとするとページがリロードされる
2. URLに`?inputMode=text`というパラメータが付く
3. `[ProjectEditDialog] 保存データ:`ログが出ない = `handleSubmit`が呼ばれていない

**根本原因:**
- **ネストされたフォーム構造**（HTML5で禁止）
- Line 627: メインフォーム `<form onSubmit={handleSubmit}>`
- Line 1141: ネストされたフォーム `<form onSubmit={handleInvite}>` ← これが問題

**HTML仕様違反の影響:**
- ブラウザの動作が不定になる
- フォームがGETリクエストとして送信される
- メインフォームの`handleSubmit`が実行されない

**修正内容 (ProjectEditDialog.tsx):**
1. メンバー追加セクションの`<form>`を`<div>`に変更（Line 1141）
2. 「追加」ボタンを`type="submit"`から`type="button"`に変更（Line 1323）
3. `onClick`で明示的に`handleInvite`を呼び出すように修正

**デプロイ:**
- ビルド: index-C4c4T4_k.js
- デプロイ完了: 2025-12-02
- URL: https://compass-31e9e.web.app

### 組織招待のセキュリティ問題（2025-12-02 解決）✅

**問題:**
- adminユーザーが/adminページからarchisoftに組織管理者を招待したのに、archi-prisma組織に追加されていた
- 別組織への招待機能にセキュリティ上の欠陥があった

**根本原因 (org-invitations.ts:92):**
```typescript
const targetOrg = user.role === 'super_admin' && targetOrgId ? targetOrgId : user.orgId;
```
- adminが`targetOrgId`パラメータを指定しても、無視されて自分の組織(orgId)が使われていた
- 結果：archisoftに招待したつもりがarchi-prismaに追加される

**セキュリティ要件:**
- 「全く違う組織を作ることができるのはsuper_adminだけ」
- adminやproject_managerは自分の組織にのみ招待可能

**修正内容 (org-invitations.ts:91-100):**
```typescript
// 別組織への招待はsuper_adminのみ可能
if (targetOrgId && targetOrgId !== user.orgId && user.role !== 'super_admin') {
  res.status(403).json({
    error: 'Forbidden: Only super_admin can invite users to a different organization',
  });
  return;
}

// super_adminは別組織に招待できる、それ以外は自分の組織のみ
const targetOrg = user.role === 'super_admin' && targetOrgId ? targetOrgId : user.orgId;
```

**デプロイ:**
- デプロイ完了: 2025-12-02
- 全Functions更新成功（--force使用）
- API URL: https://api-g3xwwspyla-an.a.run.app

## 次回の作業手順

### 1. ビルド＆デプロイ
```bash
# Webアプリケーションのビルドとデプロイ
cd web && npm run build && cd .. && firebase deploy --only hosting
```

### 2. ユーザーへの確認事項
デプロイ後、以下を確認してもらう必要があります:

1. **操作手順の確認**
   - どの画面から「プロジェクトメンバー追加」機能にアクセスしているか
   - 具体的なクリック手順

2. **ダイアログ表示の確認**
   - モーダル/ダイアログは表示されているか
   - 表示されている場合、どんな内容が見えるか（スクリーンショット推奨）

3. **コンソールログの確認**
   - ブラウザの開発者ツール（F12）を開く
   - Consoleタブを確認
   - 以下のログが表示されるか確認:
     - `[ProjectMembersDialog] Component mounted`
     - `[ProjectMembersDialog] Rendering - showInviteForm: ...`
     - `[ProjectMembersDialog] Invite button clicked` （ボタンクリック時）

4. **協力者データの確認**
   - 人員管理ページ（/users）で協力者が正しく表示されているか
   - 協力者が1件以上登録されているか

### 3. コード位置参照
**ProjectMembersDialog.tsx:**
- コンポーネント定義: line 29
- マウントログ: lines 54-59
- showInviteForm useEffect: lines 61-72
- loadCollaborators関数: lines 98-119
- レンダリングログ: lines 306-308
- 招待ボタン（ログ付き）: lines 377-387
- 協力者セクション表示: lines 486-510

## ファイル変更履歴

### Modified (未コミット):
- `.claude/settings.local.json`
- `README.md`
- `firestore.rules`
- `functions/package.json` (version 0.1.0 → 0.1.1)
- `functions/src/api/clients-api.ts`
- `functions/src/api/org-invitations.ts`
- `functions/src/api/project-members-api.ts`
- `functions/src/index.ts`
- `functions/src/lib/access-control.ts`
- `functions/src/lib/auth-types.ts`
- `functions/src/lib/gmail.ts`
- `functions/src/lib/project-members.ts`
- `web/src/App.tsx`
- `web/src/components/ClientSelector.tsx`
- `web/src/components/GoogleMapsAddressInput.tsx`
- `web/src/components/PersonEditDialog.tsx`
- `web/src/components/ProjectEditDialog.tsx`
- `web/src/components/ProjectMembersDialog.tsx` ← **重要（デバッグ機能追加）**
- `web/src/components/UserManagement.tsx`
- `web/src/lib/api.ts`
- `web/src/lib/auth-types.ts`
- `web/src/lib/firebaseClient.ts`
- `web/src/lib/types.ts`
- `web/src/pages/AdminPage.tsx`

### New files (未コミット):
- `functions/src/api/collaborators-api.ts` ← **重要**
- `functions/src/api/migrate-clients-api.ts`
- `functions/src/migrate-clients.ts`

## デプロイ状況
- Functions: v0.1.1 (デプロイ済み - 2025-12-02)
  - 組織招待セキュリティ修正適用済み
  - プロジェクトメンバー操作のアクティビティログ追加済み
  - API URL: https://api-g3xwwspyla-an.a.run.app
- Hosting: デプロイ済み（index-C4c4T4_k.js）
  - ネストフォーム修正適用済み
  - 協力者追加・表示機能実装済み
  - URL: https://compass-31e9e.web.app
- Firestore Rules: デプロイ済み

## 参考コマンド
```bash
# ビルド＆デプロイ
cd web && npm run build && cd .. && firebase deploy --only hosting

# Functions デプロイ
cd functions && npm run build && firebase deploy --only functions --force

# 全体デプロイ
firebase deploy

# キャッシュクリアビルド
cd web && rm -rf dist node_modules/.vite && npm run build
```

## 実装計画
詳細な実装計画は `implementation_plan.md` を参照してください。
