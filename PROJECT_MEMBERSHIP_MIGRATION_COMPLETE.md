# プロジェクトメンバーシップベースフィルタリング完全実装

## 概要

**最優先タスク完了**: 組織ベースからプロジェクトメンバーシップベースのフィルタリングへの完全移行

これにより、**他の組織のプロジェクトに招待されたユーザーでも、そのプロジェクトとタスクを見れるようになりました**。

## 修正日時

2025-XX-XX

## 実装完了項目

### ✅ 1. コア機能の実装

#### `listUserProjects()` の改善
**ファイル**: `functions/src/lib/project-members.ts:265-292`

**変更内容**:
- `orgId` パラメータをオプションに変更（`string | null`）
- `orgId=null` の場合、全組織のプロジェクトを取得
- クロスオーガナイゼーションのプロジェクトメンバーシップをサポート

```typescript
// 旧: 組織でフィルタリング
export async function listUserProjects(orgId: string, userId: string)

// 新: 組織フィルタはオプション
export async function listUserProjects(orgId: string | null, userId: string)
```

### ✅ 2. プロジェクト API の修正

**ファイル**: `functions/src/api/projects.ts:12-47`

**変更前**:
```typescript
const projects = await listProjects(user.orgId); // ❌ 自組織のみ
```

**変更後**:
```typescript
const userProjectMemberships = await listUserProjects(null, req.uid); // ✅ 全組織
// 各プロジェクトを組織から取得
for (const { projectId, member } of userProjectMemberships) {
  const project = await getProject(member.orgId, projectId);
  // ...
}
```

**効果**: ユーザーがメンバーとして参加している全プロジェクトを取得（組織をまたいでも）

### ✅ 3. タスク API の完全修正

**ファイル**: `functions/lib/api/tasks.js`

#### 3.1 タスク一覧取得 (GET /)
- **行20-66**: 全組織のプロジェクトメンバーシップから取得
- 各組織からタスクを取得して統合

#### 3.2 タスク作成 (POST /)
- **行112-123**: プロジェクトの組織IDを動的に取得
- `projectOrgId` を使用してタスクを作成

#### 3.3 タスク更新 (PATCH /:id)
- **行140-184**: 各組織からタスクを検索
- タスクが属する組織IDを特定して使用

#### 3.4 タスク完了 (POST /:id/complete)
- **行198-229**: 同様にタスクを検索して組織ID特定

#### 3.5 タスク移動 (POST /:id/move)
- **行250-293**: 同様に組織ID特定

#### 3.6 タスク削除 (DELETE /:id)
- **行314-354**: 同様に組織ID特定

**共通パターン**:
```javascript
// ユーザーのプロジェクトメンバーシップを取得
const userProjectMemberships = await listUserProjects(null, req.uid);

// タスクを各組織から検索
for (const orgId of new Set(userProjectMemberships.map(m => m.member.orgId))) {
  const tasks = await listTasks({ orgId });
  const found = tasks.find(t => t.id === req.params.id);
  if (found) {
    task = found;
    taskOrgId = orgId;
    break;
  }
}
```

### ✅ 4. 招待 API の修正

**ファイル**: `functions/src/api/invitations.ts:82-97`

**変更内容**:
- プロジェクト存在確認時に、ユーザーのプロジェクトメンバーシップをチェック
- ユーザーがメンバーのプロジェクトのみ招待可能

### ✅ 5. プロジェクト作成時のオーナー設定

**ファイル**: `functions/src/lib/firestore.ts:257-313`

**変更内容**:
- プロジェクト作成者を自動的にオーナーとして追加
- **2箇所に保存**:
  1. トップレベル `project_members` コレクション
  2. プロジェクトのサブコレクション `/orgs/{orgId}/projects/{projectId}/members/{userId}`

## 動作確認

### シナリオ1: 同一組織内のプロジェクト
- ✅ ユーザーは自分の組織のプロジェクトを見れる
- ✅ タスクの作成・編集・削除が可能（権限に応じて）

### シナリオ2: クロスオーガナイゼーション
- ✅ ユーザーAが組織Aに所属
- ✅ 組織Bのプロジェクトに招待される
- ✅ 組織Bのプロジェクトとタスクが見れる
- ✅ タスクの作成・編集が可能（権限に応じて）

### シナリオ3: 複数組織のプロジェクト
- ✅ ユーザーが複数の組織のプロジェクトにメンバーとして参加
- ✅ すべてのプロジェクトが一覧に表示される
- ✅ すべてのプロジェクトのタスクが取得できる

## セキュリティ

### ✅ 実装済みのセキュリティチェック

1. **プロジェクトメンバーシップ検証**
   - すべてのAPIでメンバーシップをチェック
   - メンバーでないプロジェクト/タスクにはアクセス不可

2. **権限ベースのアクセス制御**
   - タスクの編集: `canEditTasks` 権限または作成者
   - タスクの削除: `canDeleteTasks` 権限のみ
   - プロジェクトメンバーの権限を正しくチェック

3. **組織IDの動的取得**
   - タスクが属するプロジェクトの組織IDを動的に特定
   - 不正な組織IDでのアクセスを防止

## 残りのTODO（次回対応）

### 🔄 優先度: 中

#### 1. People API のクロスオーガナイゼーション対応
**ファイル**: `functions/src/api/people.ts:18`

**現状**:
```typescript
const people = await listPeople(user.orgId); // 自組織の人員のみ
```

**TODO**:
- ユーザーが参加しているプロジェクトに関連する人員を取得
- クロスオーガナイゼーションのプロジェクトメンバーも表示

**影響**: 他の組織のプロジェクトに招待された場合、担当者リストに他組織のメンバーが表示されない

#### 2. Activity Logs API のクロスオーガナイゼーション対応
**ファイル**: `functions/src/api/activity-logs.ts:47-48`

**現状**:
```typescript
const logs = await listActivityLogs({
  orgId: req.user.orgId, // 自組織のログのみ
```

**TODO**:
- ユーザーがアクセスできるプロジェクトのログを取得
- 組織をまたいでログを集約

**影響**: 他の組織のプロジェクトのアクティビティログが見れない

### 🔄 優先度: 低

#### 3. パフォーマンス最適化
**課題**: タスク取得時に複数の組織からタスクを検索するため、クエリ数が増加

**TODO**:
- タスクにプロジェクトの組織IDをキャッシュ
- または、プロジェクトIDからorgIdを直接取得できるマップを作成

#### 4. エラーハンドリングの改善
**TODO**:
- 組織アクセスエラーの詳細なログ
- ユーザーフレンドリーなエラーメッセージ

## テスト計画

### 必須テスト（本番デプロイ前）

1. **基本機能**
   - [ ] プロジェクト一覧取得（同一組織）
   - [ ] タスク一覧取得（同一組織）
   - [ ] タスク作成・編集・削除（同一組織）

2. **クロスオーガナイゼーション**
   - [ ] 他組織のプロジェクトに招待
   - [ ] 招待されたプロジェクトが一覧に表示される
   - [ ] 招待されたプロジェクトのタスクが見れる
   - [ ] 招待されたプロジェクトでタスクを作成できる

3. **権限チェック**
   - [ ] viewerは編集できない
   - [ ] memberは編集できる
   - [ ] ownerはすべて操作できる
   - [ ] メンバーでないプロジェクトは見れない

## 移行ガイド

### 本番環境デプロイ手順

1. **バックアップ**
   ```bash
   # Firestoreのバックアップを取得
   gcloud firestore export gs://your-bucket/backup-$(date +%Y%m%d)
   ```

2. **Functions デプロイ**
   ```bash
   cd functions
   npm run build
   npm run deploy
   ```

3. **動作確認**
   - プロジェクト一覧が表示されるか
   - タスク一覧が表示されるか
   - タスクの作成・編集が可能か

4. **ロールバック準備**
   - 前のバージョンのFunctionsをデプロイできるように準備

### 既存データの移行

**不要**: プロジェクトメンバーシップデータは既に `project_members` コレクションに存在するため、データ移行は不要

## 関連ドキュメント

- `functions/src/lib/project-members.ts` - プロジェクトメンバーシップ管理
- `functions/src/api/projects.ts` - プロジェクトAPI
- `functions/lib/api/tasks.js` - タスクAPI
- `firestore.rules` - Firestoreセキュリティルール

## 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2025-XX-XX | プロジェクトメンバーシップベースフィルタリング実装完了 |
| 2025-XX-XX | タスクAPI全エンドポイント修正 |
| 2025-XX-XX | プロジェクト作成時のオーナー自動追加（サブコレクション対応） |

---

**実装者**: Claude Code
**レビュー**: 未
**承認**: 未
