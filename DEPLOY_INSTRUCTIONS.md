# デプロイ手順書

## 修正内容サマリー

### 1. Firestoreフィールドパスのサニタイズ処理

**問題**: プロジェクトの `所在地/現地` フィールドに `/` が含まれており、Firestoreのフィールドパスとして無効でした。

**修正内容**:

- `functions/src/lib/firestore.ts` に `sanitizeFieldNames` 関数を追加

- `createProject` と `updateProject` でフィールド名の特殊文字を自動的にサニタイズ（`/` → `_`）

- 型定義に `所在地_現地` フィールドを追加（サニタイズ後のフィールド名）

### 2. タスクのstart/endフィールド生成

**現状**: `deriveTaskFields` 関数が既に実装されており、タスク作成・更新時に自動的に `start`/`end` フィールドを生成します。

**動作**:

- `予定開始日` → `start`

- `期限` → `end`

- フロントエンドでは `task.start ?? task.予定開始日` でフォールバック処理済み

### 3. ProjectEditDialogの拡張

**追加フィールド**:

- クライアント

- LS担当者

- 自社PM

- 所在地/現地

- フォルダURL

これにより、プロジェクトの全情報を編集可能になりました。

## デプロイ手順

### 前提条件

- Firebase CLIがインストールされていること

- `compass-31e9e` プロジェクトへのアクセス権限があること

- Google Cloud認証が完了していること

### 1. Firebase認証

```bash
firebase login
```

### 2. プロジェクトの確認

```bash
cd /home/ubuntu/compass
firebase projects:list
firebase use compass-31e9e
```

### 3. 環境変数の設定

Cloud Functionsの環境変数 `ORG_ID` を設定（既に設定済みの場合はスキップ）:

```bash
firebase functions:config:set org.id="archi-prisma"
```

### 4. バックエンドのデプロイ

```bash
cd /home/ubuntu/compass
firebase deploy --only functions
```

**注意**: 初回デプロイまたは大きな変更がある場合、デプロイに5-10分かかることがあります。

### 5. フロントエンドのデプロイ

フロントエンドは既にビルド済みです（`web/dist`）:

```bash
firebase deploy --only hosting
```

### 6. 全体デプロイ（推奨）

バックエンドとフロントエンドを同時にデプロイ:

```bash
firebase deploy
```

## デプロイ後の確認

### 1. 本番環境へのアクセス

[https://compass-31e9e.web.app/](https://compass-31e9e.web.app/)

### 2. 動作確認項目

#### プロジェクト編集

1. プロジェクト一覧から任意のプロジェクトを選択

1. 編集ボタンをクリック

1. 以下のフィールドが表示されることを確認:
  - プロジェクト名
  - クライアント
  - LS担当者
  - 自社PM
  - ステータス
  - 優先度
  - 開始日
  - 予定完了日
  - 所在地/現地
  - フォルダURL
  - 備考

1. フィールドを編集して保存

1. エラーが発生しないことを確認（特に「所在地/現地」フィールド）

#### タスク編集

1. タスク一覧から任意のタスクを選択

1. 編集ボタンをクリック

1. 予定開始日と期限を設定

1. 保存後、ガントチャートにタスクが表示されることを確認

#### ガントチャート表示

1. ガントチャートビューに切り替え

1. 予定開始日と期限が設定されているタスクが表示されることを確認

1. タスクバーをドラッグして日付を変更できることを確認

### 3. エラーログの確認

Firebase Consoleでエラーログを確認:

```bash
firebase functions:log --only api
```

または、Firebase Console（[https://console.firebase.google.com/）で](https://console.firebase.google.com/%EF%BC%89%E3%81%A7):

1. プロジェクト `compass-31e9e` を選択

1. Functions → Logs を確認

## トラブルシューティング

### デプロイエラー

**エラー**: `Error: HTTP Error: 403, The caller does not have permission`

**解決策**: Firebase CLIで正しいアカウントでログインしているか確認:

```bash
firebase login --reauth
```

### 環境変数が反映されない

**解決策**: Cloud Functionsの環境変数を再設定:

```bash
firebase functions:config:set org.id="archi-prisma"
firebase deploy --only functions
```

### ビルドエラー

**解決策**: 依存関係を再インストール:

```bash
cd /home/ubuntu/compass/web
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 既存タスクのマイグレーション（オプション）

既存のタスクに `start`/`end` フィールドがない場合、以下のマイグレーションスクリプトを実行できます:

```bash
cd /home/ubuntu/compass/functions
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
export ORG_ID="archi-prisma"
npx ts-node src/migrate-task-dates.ts
```

**注意**: このスクリプトはサービスアカウントキーが必要です。既存タスクは次回編集時に自動的に `start`/`end` が生成されるため、マイグレーションは必須ではありません。

## Git管理

### Google Cloud Source Repositoriesへのプッシュ

```bash
cd /home/ubuntu/compass
git push google main
```

**注意**: 認証が必要な場合は、Google Cloud SDKで認証を完了してください:

```bash
gcloud auth login
gcloud config set project compass-31e9e
```

### GitHubへのプッシュ（バックアップ）

```bash
cd /home/ubuntu/compass
git push origin main
```

## 次のステップ

1. 本番環境での動作確認

1. ユーザーフィードバックの収集

1. 必要に応じて追加の修正・機能追加

## サポート

問題が発生した場合は、以下の情報を含めて報告してください:

- エラーメッセージ

- 実行したコマンド

- Firebase Functionsのログ

- ブラウザのコンソールログ

