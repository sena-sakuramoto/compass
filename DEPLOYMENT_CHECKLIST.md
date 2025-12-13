# デプロイ前の最終チェックリスト

## 実施済みの修正

### 1. Firestoreフィールドパスのサニタイズ処理 ✅
- `functions/src/lib/firestore.ts` に `sanitizeFieldNames` 関数を追加
- `createProject` と `updateProject` でフィールド名の特殊文字を自動的にサニタイズ（`/` → `_`）
- プロジェクトの「所在地/現地」フィールドが正しく保存されるようになりました

### 2. Firebase認証情報の更新 ✅
- `web/.env` ファイルに正しいFirebase設定を追加
- フロントエンドのビルドが完了（`web/dist`）

### 3. タスクのstart/endフィールド生成 ✅
- バックエンドの `deriveTaskFields` 関数が正しく実装されている
- `createTask` と `updateTask` で自動的に `start`/`end` フィールドを生成

### 4. ProjectEditDialogの拡張 ✅
- 全フィールドを編集可能にしました
  - クライアント
  - LS担当者
  - 自社PM
  - 所在地/現地
  - フォルダURL

### 5. 環境変数の設定 ✅
- `functions/.env` ファイルを作成（`ORG_ID=archi-prisma`）
- Firebase Functions の環境変数も設定済み

## デプロイ手順

### ステップ1: フロントエンドのデプロイ

```bash
cd D:\senaa_dev\compass\compass
firebase deploy --only hosting
```

**予想される出力**:
```
=== Deploying to 'compass-31e9e'...

i  deploying hosting
i  hosting[compass-31e9e]: beginning deploy...
i  hosting[compass-31e9e]: found 7 files in web/dist
✔  hosting[compass-31e9e]: file upload complete
i  hosting[compass-31e9e]: finalizing version...
✔  hosting[compass-31e9e]: version finalized
i  hosting[compass-31e9e]: releasing new version...
✔  hosting[compass-31e9e]: release complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/compass-31e9e/overview
Hosting URL: https://compass-31e9e.web.app
```

### ステップ2: バックエンドのデプロイ（オプション）

バックエンドは既に最新のコードがデプロイされている可能性がありますが、念のため再デプロイすることをお勧めします：

```bash
firebase deploy --only functions
```

**注意**: 初回デプロイまたは大きな変更がある場合、5-10分かかることがあります。

### ステップ3: 全体デプロイ（推奨）

バックエンドとフロントエンドを同時にデプロイ：

```bash
firebase deploy
```

## デプロイ後の動作確認

### 1. ログインの確認

1. https://compass-31e9e.web.app/ にアクセス
2. Googleアカウントでログインできることを確認
3. `@archi-prisma.co.jp` ドメインのアカウントでログイン

### 2. プロジェクト編集の確認

1. プロジェクト一覧から任意のプロジェクトを選択
2. 編集ボタンをクリック
3. 「所在地/現地」フィールドを編集
4. 保存ボタンをクリック
5. **エラーが発生しないことを確認**（以前は500エラーが発生していました）

### 3. タスク作成とガントチャート表示の確認

#### 新しいタスクを作成
1. 「タスク追加」ボタンをクリック
2. 以下の情報を入力：
   - タスク名: 「テストタスク」
   - プロジェクト: 任意のプロジェクトを選択
   - ステータス: 「未着手」
   - **予定開始日**: 今日の日付
   - **期限**: 1週間後の日付
3. 保存ボタンをクリック

#### ガントチャートで確認
1. 「ガントチャート」ビューに切り替え
2. **作成したタスクがガントチャートに表示されることを確認**
3. タスクバーをドラッグして日付を変更できることを確認

### 4. 既存タスクの確認

#### 既存タスクが表示されない場合
既存のタスクに `予定開始日` または `start` フィールドが設定されていない可能性があります。

**解決方法**:
1. 既存のタスクを編集
2. 「予定開始日」と「期限」を設定
3. 保存
4. ガントチャートに表示されることを確認

### 5. エラーログの確認

Firebase Consoleでエラーログを確認：

```bash
firebase functions:log --only api
```

または、Firebase Console（https://console.firebase.google.com/）で：
1. プロジェクト `compass-31e9e` を選択
2. Functions → Logs を確認

## トラブルシューティング

### 問題1: ログインできない

**症状**: Googleアカウントでログインしようとするとエラーが発生

**原因**: Firebase認証の設定が正しくない

**解決策**:
1. Firebase Console → Authentication → Sign-in method を確認
2. Google認証が有効になっているか確認
3. 承認済みドメインに `compass-31e9e.web.app` が含まれているか確認

### 問題2: プロジェクト編集で500エラーが発生

**症状**: 「所在地/現地」フィールドを編集すると500エラーが発生

**原因**: バックエンドが古いコードのまま

**解決策**:
```bash
firebase deploy --only functions
```

### 問題3: ガントチャートにタスクが表示されない

**症状**: タスク一覧には表示されるが、ガントチャートには表示されない

**原因**: タスクに `予定開始日` または `start` フィールドが設定されていない

**解決策**:
1. タスクを編集
2. 「予定開始日」と「期限」を設定
3. 保存

### 問題4: CORSエラーが発生

**症状**: ブラウザのコンソールに `Access-Control-Allow-Origin` エラーが表示される

**原因**: バックエンドのCORS設定が正しくない

**解決策**:
1. `functions/.env` ファイルを確認
2. `CORS_ORIGIN=https://compass-31e9e.web.app` が設定されているか確認
3. バックエンドを再デプロイ

## 次のステップ

### 1. 既存データのマイグレーション（オプション）

既存のタスクに `start`/`end` フィールドがない場合、以下のマイグレーションスクリプトを実行できます：

```bash
cd functions
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
export ORG_ID="archi-prisma"
npx ts-node src/migrate-task-dates.ts
```

**注意**: サービスアカウントキーが必要です。既存タスクは次回編集時に自動的に `start`/`end` が生成されるため、マイグレーションは必須ではありません。

### 2. ユーザーフィードバックの収集

デプロイ後、実際のユーザーからフィードバックを収集し、必要に応じて追加の修正を行います。

### 3. パフォーマンスの最適化

必要に応じて、以下の最適化を検討します：
- Firestoreクエリの最適化
- フロントエンドのコード分割
- 画像の最適化

## サポート

問題が発生した場合は、以下の情報を含めて報告してください：
- エラーメッセージ
- 実行したコマンド
- Firebase Functionsのログ
- ブラウザのコンソールログ
- スクリーンショット

