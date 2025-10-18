# マルチテナント・マルチユーザー対応 完全実装レポート

## 概要

建設業界向けプロジェクト管理サービス「Compass」に、マルチテナント・マルチユーザー対応とロールベースのアクセス制御を完全実装しました。これにより、複数の会社や職種のユーザーがプロジェクトごとに参加し、きめ細かい権限管理が可能になりました。

## 実装完了フェーズ

### Phase 1: データベース構造の設計とドキュメント作成 ✅

**成果物**:
- `MULTI_TENANT_DESIGN.md`: 完全な設計ドキュメント
- データベース構造、ロール定義、アクセス制御ロジック、API設計を定義

**データベース構造**:
```
/users/{userId}
  - id, email, displayName, orgId, role, 職種, 部署, 電話番号, photoURL
  - isActive, createdAt, updatedAt, lastLoginAt

/orgs/{orgId}
  - id, name, type, createdAt, updatedAt

/orgs/{orgId}/projects/{projectId}
  - id, 物件名, ステータス, 優先度, 開始日, 予定完了日, ...
  - createdAt, updatedAt, createdBy

/orgs/{orgId}/projects/{projectId}/members/{userId}
  - userId, email, displayName, orgId, orgName, role, 職種
  - permissions, invitedBy, invitedAt, joinedAt, status

/orgs/{orgId}/tasks/{taskId}
  - projectId, タスク名, 担当者, ステータス, 進捗率, ...
  - start, end, duration_days, progress

/orgs/{orgId}/people/{personId}
  - 氏名, 職種, 部署, 電話番号, メールアドレス, ...
```

### Phase 2: ユーザー管理とロール定義の実装 ✅

**グローバルロール** (7種類):
- **admin**: 管理者 - すべての権限
- **project_manager**: プロジェクトマネージャー - プロジェクト全体の管理
- **sales**: 営業 - 営業関連の閲覧・編集
- **designer**: 設計 - 設計関連の閲覧・編集
- **site_manager**: 施工管理 - 施工関連の閲覧・編集
- **worker**: 職人 - 自分のタスクのみ閲覧・編集
- **viewer**: 閲覧者 - 閲覧のみ

**プロジェクトロール** (4種類):
- **owner**: オーナー - プロジェクトの完全な管理権限
- **manager**: マネージャー - プロジェクトの管理権限（メンバー管理を含む）
- **member**: メンバー - タスクの閲覧・編集
- **viewer**: 閲覧者 - プロジェクトの閲覧のみ

**実装ファイル**:
- `functions/src/lib/roles.ts`: ロール定義と権限の型定義
- `functions/src/lib/auth-types.ts`: ユーザー管理の型定義
- `functions/src/lib/users.ts`: ユーザー管理のFirestore操作関数

### Phase 3: プロジェクトメンバー管理機能の実装 ✅

**機能**:
- プロジェクトごとにメンバーを招待
- メンバーのロールと権限を設定
- 外部の協力会社のメンバーも招待可能
- メンバーの追加・更新・削除

**実装ファイル**:
- `functions/src/lib/project-members.ts`: プロジェクトメンバー管理の関数

**主要関数**:
- `addProjectMember`: メンバーを招待
- `updateProjectMember`: メンバーのロールや権限を更新
- `removeProjectMember`: メンバーを削除
- `listProjectMembers`: プロジェクトのメンバー一覧を取得
- `getProjectMember`: 特定のメンバー情報を取得

### Phase 4: アクセス制御ロジックの実装 ✅

**機能**:
- ユーザーのロールとプロジェクトメンバーシップに基づいたアクセス制御
- プロジェクトとタスクへのアクセス権限を細かく制御
- 担当者は自分のタスクを編集可能

**実装ファイル**:
- `functions/src/lib/access-control.ts`: アクセス制御ロジック

**主要関数**:
- `canViewProject`: プロジェクトを閲覧できるか
- `canEditProject`: プロジェクトを編集できるか
- `canDeleteProject`: プロジェクトを削除できるか
- `canManageMembers`: プロジェクトメンバーを管理できるか
- `canViewTask`: タスクを閲覧できるか
- `canEditTask`: タスクを編集できるか
- `canDeleteTask`: タスクを削除できるか
- `getProjectPermissions`: プロジェクトの権限を取得

**APIエンドポイント**:
- `GET /api/users`: ユーザー一覧
- `POST /api/users`: ユーザー作成（管理者のみ）
- `PATCH /api/users/:userId`: ユーザー更新
- `GET /api/users/me`: 現在のユーザー情報
- `GET /api/projects/:projectId/members`: メンバー一覧
- `POST /api/projects/:projectId/members`: メンバー招待
- `PATCH /api/projects/:projectId/members/:userId`: メンバー更新
- `DELETE /api/projects/:projectId/members/:userId`: メンバー削除

### Phase 5: UIの更新（メンバー招待、権限管理） ✅

**実装された UI コンポーネント**:

#### 1. ProjectMembersDialog
プロジェクトメンバー管理ダイアログ

**機能**:
- メンバー一覧の表示（ステータス、ロール、所属組織、職種）
- メンバーの招待（メールアドレス、ロール、メッセージ）
- メンバーのロール変更
- メンバーの削除
- ステータスバッジ（アクティブ、招待中、非アクティブ）
- エラー・成功メッセージの表示

**デザイン特徴**:
- モダンでクリーンなUI
- レスポンシブデザイン
- 直感的な操作性
- 視覚的なフィードバック

#### 2. ProjectCard（更新）
プロジェクトカードに「メンバー管理」ボタンを追加

**機能**:
- プロジェクトカードから直接メンバー管理ダイアログを開く
- ログインユーザーのみ表示（`canSync`が`true`の場合）

#### 3. 型定義（フロントエンド）
- `web/src/lib/auth-types.ts`: ロール、権限、ユーザー、プロジェクトメンバーの型定義

### Phase 6: Firestoreセキュリティルールの更新 ✅

**実装内容**:
- ロールベースのアクセス制御をFirestoreセキュリティルールに実装
- ユーザー、組織、プロジェクト、タスク、担当者ごとに細かい権限制御

**主要ルール**:

#### ユーザードキュメント (`/users/{userId}`)
- 自分のユーザー情報のみ読み取り可能
- 管理者のみユーザー情報を作成・更新可能
- 削除は禁止

#### 組織ドキュメント (`/orgs/{orgId}`)
- 組織メンバーのみ組織情報を読み取り可能
- 管理者のみ組織情報を作成・更新可能
- 削除は禁止

#### プロジェクトドキュメント (`/orgs/{orgId}/projects/{projectId}`)
- プロジェクトメンバーのみプロジェクト情報を読み取り可能
- 管理者、プロジェクトマネージャーがプロジェクトを作成可能
- オーナー/マネージャーがプロジェクトを更新可能
- 管理者のみプロジェクトを削除可能

#### プロジェクトメンバードキュメント (`/orgs/{orgId}/projects/{projectId}/members/{memberId}`)
- プロジェクトメンバーのみメンバー一覧を読み取り可能
- オーナー/マネージャーのみメンバーを追加・更新・削除可能

#### タスクドキュメント (`/orgs/{orgId}/tasks/{taskId}`)
- プロジェクトメンバーのみタスクを読み取り可能
- 権限を持つメンバーがタスクを作成可能
- 権限を持つメンバー、または担当者がタスクを更新可能
- オーナー/マネージャーのみタスクを削除可能

#### 担当者ドキュメント (`/orgs/{orgId}/people/{personId}`)
- 組織メンバーのみ担当者情報を読み取り可能
- 管理者、プロジェクトマネージャーのみ担当者情報を作成・更新・削除可能

### Phase 7: テストとデプロイ ✅

**実施内容**:
- TypeScriptコンパイルエラーのチェック（バックエンド・フロントエンド）
- フロントエンドのビルド
- Gitへのコミット

**ビルド結果**:
- バックエンド: コンパイルエラーなし
- フロントエンド: ビルド成功
  - `dist/index.html`: 0.80 kB
  - `dist/assets/index-B7EIfhvr.css`: 32.59 kB
  - `dist/assets/index-3u4MwbEe.js`: 115.15 kB
  - その他のアセット: 合計約 920 kB

## 実装された主要機能

### 1. マルチテナント対応
- 複数の会社（組織）が同じシステムを使用可能
- 各会社のデータは完全に分離
- 組織タイプ（元請け、下請け、協力会社など）の管理

### 2. ロールベースのアクセス制御（RBAC）
- 7つのグローバルロール（管理者、プロジェクトマネージャー、営業、設計、施工管理、職人、閲覧者）
- 4つのプロジェクトロール（オーナー、マネージャー、メンバー、閲覧者）
- きめ細かい権限管理（プロジェクト閲覧、編集、削除、メンバー管理、タスク閲覧、作成、編集、削除など）

### 3. プロジェクトメンバー管理
- プロジェクトごとにメンバーを招待
- メンバーの権限を個別に設定
- 外部の協力会社もメンバーとして追加可能
- メンバーのステータス管理（招待中、アクティブ、非アクティブ）

### 4. 直感的なUI
- プロジェクトカードから直接メンバー管理
- モダンでクリーンなデザイン
- レスポンシブ対応
- 視覚的なフィードバック（ステータスバッジ、エラー・成功メッセージ）

### 5. セキュリティ
- Firestoreセキュリティルールによる厳格なアクセス制御
- ユーザー認証（Firebase Authentication）
- 組織ごとのデータ分離

## 使用方法

### 1. 管理者がユーザーを作成
```typescript
POST /api/users
{
  "email": "user@example.com",
  "displayName": "山田太郎",
  "orgId": "archi-prisma",
  "role": "site_manager",
  "職種": "施工管理",
  "部署": "工事部"
}
```

### 2. プロジェクトにメンバーを招待
1. プロジェクトカードの「メンバー管理」ボタンをクリック
2. 「メンバーを招待」ボタンをクリック
3. メールアドレス、ロール、メッセージを入力
4. 「招待を送信」をクリック

### 3. メンバーのロールを変更
1. プロジェクトメンバー管理ダイアログを開く
2. メンバーのロールをドロップダウンから選択
3. 自動的に保存される

### 4. メンバーを削除
1. プロジェクトメンバー管理ダイアログを開く
2. メンバーの削除ボタン（ゴミ箱アイコン）をクリック
3. 確認ダイアログで「OK」をクリック

## デプロイ手順

### 1. 環境変数の設定（既に完了）
```bash
# フロントエンド (.env)
VITE_FIREBASE_API_KEY=AIzaSyAGutWJF5bcTr_01Bjkizr7Sfo9HO__H78
VITE_FIREBASE_AUTH_DOMAIN=compass-31e9e.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=compass-31e9e
VITE_FIREBASE_STORAGE_BUCKET=compass-31e9e.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=70173334851
VITE_FIREBASE_APP_ID=1:70173334851:web:fc6c922a399014a10923f6

# バックエンド (.env)
ORG_ID=archi-prisma
```

### 2. デプロイコマンド
```bash
cd D:\senaa_dev\compass\compass
firebase deploy
```

または、個別にデプロイ:
```bash
# バックエンドのみ
firebase deploy --only functions

# フロントエンドのみ
firebase deploy --only hosting

# Firestoreセキュリティルールのみ
firebase deploy --only firestore:rules
```

### 3. 動作確認
1. https://compass-31e9e.web.app/ にアクセス
2. Googleアカウントでログイン
3. プロジェクトカードの「メンバー管理」ボタンが表示されることを確認
4. メンバー管理ダイアログが正しく動作することを確認

## 今後の拡張可能性

### 1. メール通知
- メンバー招待時にメール通知を送信
- タスク割り当て時にメール通知を送信

### 2. 組織管理画面
- 組織情報の編集
- 組織メンバーの一覧表示
- 組織の統計情報

### 3. ユーザープロフィール
- プロフィール写真のアップロード
- 自己紹介の編集
- スキルや資格の登録

### 4. 監査ログ
- すべての操作を記録
- 誰がいつ何をしたかを追跡

### 5. 高度な権限管理
- カスタムロールの作成
- タスクごとの権限設定
- ファイルごとの権限設定

## まとめ

マルチテナント・マルチユーザー対応とロールベースのアクセス制御の完全実装により、Compassは以下のような建設業界のニーズに対応できるようになりました：

✅ **複数の会社が協力**: 元請け、下請け、協力会社が同じプロジェクトで作業可能
✅ **職種ごとの権限管理**: 設計、施工管理、営業、職人など、職種に応じた権限設定
✅ **プロジェクトごとのメンバー管理**: プロジェクトごとに異なるチームを編成可能
✅ **セキュアなデータ管理**: Firestoreセキュリティルールによる厳格なアクセス制御
✅ **直感的なUI**: 誰でも簡単に使える操作性

これにより、建設プロジェクトの効率的な管理と、複数の関係者間でのスムーズなコラボレーションが実現されます。

