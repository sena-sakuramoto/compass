# マルチテナント・RBAC実装 Phase 1-4 サマリー

## 実施日時
2025年10月18日

## 実装されたフェーズ

### Phase 1: データベース構造の設計とドキュメント作成 ✅

**成果物**:
- `MULTI_TENANT_DESIGN.md`: 完全な設計ドキュメント
  - データベース構造
  - ロール定義
  - アクセス制御ロジック
  - API設計
  - UI設計
  - マイグレーション計画

### Phase 2: ユーザー管理とロール定義の実装 ✅

**実装ファイル**:
1. `functions/src/lib/roles.ts`
   - ロール定義: `admin`, `project_manager`, `sales`, `designer`, `site_manager`, `worker`, `viewer`
   - プロジェクトロール定義: `owner`, `manager`, `member`, `viewer`
   - 権限定義: `RolePermissions`, `ProjectPermissions`
   - ヘルパー関数: `getRolePermissions`, `getProjectRolePermissions`

2. `functions/src/lib/auth-types.ts`
   - 型定義: `Organization`, `User`, `ProjectMember`
   - 入力型: `UserInput`, `ProjectMemberInput`
   - 認証コンテキスト: `AuthContext`

3. `functions/src/lib/users.ts`
   - ユーザー管理関数:
     - `createUser`: ユーザーを作成
     - `getUser`: ユーザーを取得
     - `updateUser`: ユーザーを更新
     - `listUsers`: ユーザー一覧を取得
     - `getUserByEmail`: メールアドレスからユーザーを検索
     - `updateLastLogin`: ログイン時刻を更新
     - `deactivateUser`: ユーザーを非アクティブ化
     - `activateUser`: ユーザーをアクティブ化
   - 組織管理関数:
     - `createOrganization`: 組織を作成
     - `getOrganization`: 組織を取得
     - `listOrganizations`: 組織一覧を取得

### Phase 3: プロジェクトメンバー管理機能の実装 ✅

**実装ファイル**:
1. `functions/src/lib/project-members.ts`
   - プロジェクトメンバー管理関数:
     - `addProjectMember`: プロジェクトメンバーを追加（招待）
     - `getProjectMember`: プロジェクトメンバーを取得
     - `listProjectMembers`: プロジェクトメンバー一覧を取得
     - `updateProjectMember`: プロジェクトメンバーを更新
     - `removeProjectMember`: プロジェクトメンバーを削除
     - `acceptProjectInvitation`: プロジェクトメンバーの招待を承認
     - `listUserProjects`: ユーザーが参加しているプロジェクト一覧を取得
     - `isProjectMember`: ユーザーがプロジェクトのメンバーかどうかを確認
     - `getProjectMemberPermissions`: ユーザーのプロジェクト内の権限を取得

### Phase 4: アクセス制御ロジックの実装 ✅

**実装ファイル**:
1. `functions/src/lib/access-control.ts`
   - プロジェクトアクセス制御:
     - `canAccessProject`: プロジェクトへのアクセス権限をチェック
     - `canEditProject`: プロジェクトの編集権限をチェック
     - `canDeleteProject`: プロジェクトの削除権限をチェック
     - `canManageProjectMembers`: プロジェクトメンバーの管理権限をチェック
   - タスクアクセス制御:
     - `canAccessTask`: タスクへのアクセス権限をチェック
     - `canEditTask`: タスクの編集権限をチェック
     - `canCreateTask`: タスクの作成権限をチェック
     - `canDeleteTask`: タスクの削除権限をチェック
   - グローバル権限:
     - `canCreateProject`: プロジェクト作成権限をチェック
     - `canManageUsers`: ユーザー管理権限をチェック
   - ヘルパー関数:
     - `getUserPermissionsForProject`: ユーザーのすべての権限を取得

2. `functions/src/api/users-api.ts`
   - APIエンドポイント:
     - `GET /api/users`: ユーザー一覧を取得
     - `GET /api/users/:userId`: ユーザー詳細を取得
     - `POST /api/users`: ユーザーを作成（管理者のみ）
     - `PATCH /api/users/:userId`: ユーザーを更新
     - `POST /api/users/:userId/deactivate`: ユーザーを非アクティブ化
     - `POST /api/users/:userId/activate`: ユーザーをアクティブ化
     - `GET /api/users/me`: 現在のユーザー情報を取得

3. `functions/src/api/project-members-api.ts`
   - APIエンドポイント:
     - `GET /api/projects/:projectId/members`: プロジェクトメンバー一覧を取得
     - `POST /api/projects/:projectId/members`: プロジェクトメンバーを追加
     - `PATCH /api/projects/:projectId/members/:userId`: プロジェクトメンバーを更新
     - `DELETE /api/projects/:projectId/members/:userId`: プロジェクトメンバーを削除
     - `POST /api/projects/:projectId/members/:userId/accept`: 招待を承認
     - `GET /api/users/:userId/projects`: ユーザーが参加しているプロジェクト一覧

4. `functions/src/lib/firestore.ts`
   - 追加関数:
     - `getProject`: プロジェクトを取得（orgId対応）

5. `functions/src/index.ts`
   - 新しいAPIルートを追加:
     - `/api/users`
     - `/api/projects/:projectId/members`

## 実装された機能

### 1. ロールベースのアクセス制御（RBAC）

**グローバルロール**:
- **admin**: すべての権限
- **project_manager**: プロジェクト全体の管理
- **sales**: 営業関連の閲覧・編集
- **designer**: 設計関連の閲覧・編集
- **site_manager**: 施工関連の閲覧・編集
- **worker**: 自分のタスクのみ閲覧・編集
- **viewer**: 閲覧のみ

**プロジェクトロール**:
- **owner**: プロジェクトの所有者
- **manager**: プロジェクトの管理者
- **member**: 通常のメンバー
- **viewer**: 閲覧のみ

### 2. ユーザー管理

- ユーザーの作成・更新・削除
- ユーザー一覧の取得（フィルタリング対応）
- メールアドレスからユーザーを検索
- ログイン時刻の記録
- ユーザーのアクティブ/非アクティブ化

### 3. 組織管理

- 組織の作成・取得
- 組織一覧の取得
- 組織タイプ: `prime`（元請け）、`subcontractor`（下請け）、`partner`（協力会社）

### 4. プロジェクトメンバー管理

- プロジェクトへのメンバー招待
- メンバーのロールと権限の設定
- メンバーの更新・削除
- 招待の承認
- ユーザーが参加しているプロジェクト一覧の取得

### 5. アクセス制御

- プロジェクトへのアクセス権限チェック
- タスクへのアクセス権限チェック
- 編集・削除権限のチェック
- メンバー管理権限のチェック

## 次のステップ（Phase 5-7）

### Phase 5: UIの更新（メンバー招待、権限管理）

**実装予定**:
1. メンバー管理画面の追加
2. メンバー招待ダイアログの実装
3. 権限表示・編集UIの実装
4. プロジェクト詳細画面に「メンバー」タブを追加

### Phase 6: Firestoreセキュリティルールの更新

**実装予定**:
1. ユーザーコレクションのセキュリティルール
2. プロジェクトコレクションのセキュリティルール
3. プロジェクトメンバーサブコレクションのセキュリティルール
4. タスクコレクションのセキュリティルール（権限ベース）

### Phase 7: テストとデプロイ

**実装予定**:
1. APIエンドポイントのテスト
2. アクセス制御ロジックのテスト
3. 本番環境へのデプロイ
4. 既存データのマイグレーション

## 現在の状態

- ✅ バックエンドの基本機能が実装済み
- ✅ TypeScriptのコンパイルエラーなし
- ✅ Gitにコミット済み
- ⏳ デプロイ待ち（Phase 5-7の実装後）

## デプロイ前の確認事項

### 1. 環境変数の設定

現在の環境変数:
```
ORG_ID=archi-prisma
```

マルチテナント対応後も、デフォルトの組織IDとして使用されます。

### 2. 既存データの互換性

現在の実装は、既存のデータ構造と互換性があります：
- 既存のプロジェクトとタスクはそのまま動作
- 新しいフィールド（`ownerUserId`, `ownerOrgId`など）は後から追加可能

### 3. 段階的な移行

推奨される移行手順:
1. Phase 1-4をデプロイ（バックエンドのみ）
2. 動作確認（APIエンドポイントのテスト）
3. Phase 5を実装（UIの更新）
4. Phase 6を実装（セキュリティルール）
5. Phase 7を実装（テストとデプロイ）
6. 既存データのマイグレーション

## 使用例

### 1. ユーザーの作成（管理者のみ）

```bash
curl -X POST https://your-api.com/api/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "displayName": "山田太郎",
    "orgId": "archi-prisma",
    "role": "site_manager",
    "職種": "施工管理"
  }'
```

### 2. プロジェクトメンバーの追加

```bash
curl -X POST https://your-api.com/api/projects/P001/members \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "member@example.com",
    "role": "member"
  }'
```

### 3. ユーザーが参加しているプロジェクト一覧の取得

```bash
curl -X GET https://your-api.com/api/users/USER_ID/projects \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## まとめ

Phase 1-4の実装により、マルチテナント・マルチユーザー対応の基盤が完成しました。

**実装された主要機能**:
1. ✅ ロールベースのアクセス制御（7つのグローバルロール、4つのプロジェクトロール）
2. ✅ ユーザー管理（作成、更新、削除、検索）
3. ✅ 組織管理（元請け、下請け、協力会社）
4. ✅ プロジェクトメンバー管理（招待、更新、削除、承認）
5. ✅ アクセス制御ロジック（プロジェクト、タスク、メンバー）
6. ✅ APIエンドポイント（ユーザー、プロジェクトメンバー）

**次のステップ**:
- Phase 5: UIの更新
- Phase 6: Firestoreセキュリティルール
- Phase 7: テストとデプロイ

これらの機能により、複数の会社や職種のユーザーが、プロジェクトごとに適切な権限で参加できるようになります。

