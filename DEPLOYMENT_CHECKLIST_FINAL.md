# COMPASS プロジェクト - 最終デプロイチェックリスト

**プロジェクト名**: APDW Project Compass
**デプロイ日**: ___________
**担当者**: ___________
**レビュアー**: ___________

---

## Phase 1: セキュリティ修正 【必須】

### 🔴 P0 - 即座に実施

- [ ] **Firebase API キーを Git から削除**
  ```bash
  git rm --cached web/.env
  git rm --cached functions/.env
  git commit -m "security: Remove exposed credentials"
  git push
  ```

- [ ] **Firebase Console でキーを再生成**
  - 旧アプリを削除
  - 新アプリを作成
  - 新しいキーを `web/.env.local` に保存
  - `.env.local` が `.gitignore` に含まれることを確認

- [ ] **Google Service Account を設定**
  - Service Account を作成
  - JSON キーをダウンロード
  - `functions/.env.local` に設定
  - ドメイン全体の委任を設定

- [ ] **TypeScript strict モード有効化**
  - `functions/tsconfig.json` の `strict: true` を確認
  - コンパイルエラーを確認: `cd functions && npm run build`

- [ ] **CORS 設定を修正**
  - `functions/src/index.ts` の修正を確認
  - `allowedOrigins` が正しく設定されていることを確認

- [ ] **Firestore セキュリティルール強化**
  - `firestore.rules` の更新を確認
  - プロジェクトメンバーチェックが実装されていることを確認

---

## Phase 2: コード品質チェック

### TypeScript コンパイル

```bash
# Backend
cd functions
npm run build
# エラーがないことを確認

# Frontend
cd ../web
npm run build
# エラーがないことを確認
```

**結果**: ✅ / ❌
**エラー詳細** (ある場合):
```
_______________________________________
_______________________________________
```

---

### 依存関係の確認

```bash
# Backend
cd functions
npm audit
npm audit fix

# Frontend
cd ../web
npm audit
npm audit fix
```

**脆弱性**: ✅ なし / ❌ あり
**対応**: ___________

---

### 環境変数の確認

#### フロントエンド (`web/.env.local`)

- [ ] `VITE_FIREBASE_API_KEY` (新しいキー)
- [ ] `VITE_FIREBASE_AUTH_DOMAIN`
- [ ] `VITE_FIREBASE_PROJECT_ID`
- [ ] `VITE_FIREBASE_STORAGE_BUCKET`
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `VITE_FIREBASE_APP_ID` (新しいID)
- [ ] `VITE_API_BASE`

#### バックエンド (`functions/.env.local`)

- [ ] `ORG_ID`
- [ ] `GSA_CLIENT_EMAIL`
- [ ] `GSA_PRIVATE_KEY`
- [ ] `GSA_IMPERSONATE`
- [ ] `NOTIFICATION_SENDER`
- [ ] `CALENDAR_ID`
- [ ] `CALENDAR_TIMEZONE`
- [ ] `JOB_RUNNER_BATCH`
- [ ] `CORS_ORIGIN`
- [ ] `ALLOW_EMAILS`
- [ ] `COMPASS_FUNCTION_REGION`

---

## Phase 3: ローカルテスト

### Firebase エミュレーターでテスト

```bash
firebase emulators:start
```

#### テストケース

- [ ] **ログイン**
  - Google認証でログイン成功
  - 許可されたドメインのみログイン可能

- [ ] **プロジェクト管理**
  - プロジェクト一覧表示
  - プロジェクト作成
  - プロジェクト編集
  - プロジェクト削除（管理者のみ）

- [ ] **タスク管理**
  - タスク一覧表示
  - タスク作成
  - タスク編集
  - タスク削除（管理者/PM のみ）
  - ガントチャート表示

- [ ] **権限チェック**
  - メンバーでないプロジェクトのデータが見えない
  - 他組織のデータが見えない
  - 一般ユーザーが削除操作できない

- [ ] **フィルタリング**
  - ステータスでフィルタリング
  - 担当者でフィルタリング
  - 日付範囲でフィルタリング

**テスト結果**: ✅ 全て成功 / ❌ 一部失敗
**失敗詳細**:
```
_______________________________________
_______________________________________
```

---

## Phase 4: デプロイ

### ビルドとデプロイ

```bash
# 1. Firestore ルールをデプロイ
firebase deploy --only firestore:rules

# 2. Functions をビルド・デプロイ
cd functions
npm run build
cd ..
firebase deploy --only functions

# 3. Web アプリをビルド・デプロイ
cd web
npm run build
cd ..
firebase deploy --only hosting
```

#### デプロイログ

**Firestore Rules**:
- [ ] デプロイ成功
- [ ] エラーなし

**Functions**:
- [ ] `api` 関数デプロイ成功
- [ ] `jobRunner` 関数デプロイ成功
- [ ] エラーなし
- [ ] URL: ___________

**Hosting**:
- [ ] デプロイ成功
- [ ] URL: https://compass-31e9e.web.app

---

## Phase 5: 本番環境テスト

### 機能テスト

アクセス URL: https://compass-31e9e.web.app

- [ ] **ログイン**
  - Google認証でログイン成功
  - 正しいユーザー情報が表示される

- [ ] **プロジェクト機能**
  - プロジェクト一覧が表示される
  - 新規プロジェクト作成が成功する
  - プロジェクト編集が成功する

- [ ] **タスク機能**
  - タスク一覧が表示される
  - 新規タスク作成が成功する
  - タスク編集が成功する
  - ガントチャートが正しく表示される

- [ ] **担当者管理**
  - 担当者一覧が表示される
  - 担当者追加が成功する

- [ ] **フィルタリング**
  - 各種フィルターが正しく動作する

### セキュリティテスト

- [ ] **認証**
  - 未認証ユーザーがログインページにリダイレクトされる
  - 認証後にダッシュボードにアクセスできる

- [ ] **権限**
  - メンバーでないプロジェクトのタスクが見えない
  - 一般ユーザーが削除ボタンを見れない
  - 管理者のみが削除できる

- [ ] **CORS**
  - 許可されたオリジンからのリクエストが成功する
  - ブラウザコンソールにCORSエラーがない

- [ ] **データ保護**
  - 他組織のデータにアクセスできない
  - プロジェクトメンバー以外がタスクを閲覧できない

### パフォーマンステスト

- [ ] **初回ロード時間**: _____ 秒
- [ ] **プロジェクト一覧表示**: _____ 秒
- [ ] **タスク一覧表示 (100件)**: _____ 秒
- [ ] **ガントチャート描画**: _____ 秒

**結果**: ✅ 許容範囲内 / ⚠️ 改善必要 / ❌ 問題あり

---

## Phase 6: エラーログ確認

### Firebase Console でログを確認

URL: https://console.firebase.google.com/project/compass-31e9e/functions/logs

- [ ] **エラーログなし**
- [ ] **警告ログなし**
- [ ] **パフォーマンス問題なし**

**検出された問題**:
```
_______________________________________
_______________________________________
```

---

## Phase 7: ドキュメント確認

- [ ] `README.md` が最新
- [ ] `DEPLOYMENT.md` が最新
- [ ] `SECURITY_FIXES_GUIDE.md` が作成されている
- [ ] `COMPLETE_AUDIT_REPORT.md` が作成されている
- [ ] API ドキュメントが最新

---

## Phase 8: バックアップ

### デプロイ前のバックアップ

- [ ] **Firestore データのエクスポート**
  ```bash
  gcloud firestore export gs://compass-31e9e-backup/$(date +%Y%m%d)
  ```

- [ ] **現在のコードをタグ付け**
  ```bash
  git tag -a v1.0.0-pre-deployment -m "Pre-deployment snapshot"
  git push origin v1.0.0-pre-deployment
  ```

---

## Phase 9: ロールバックプラン

万が一問題が発生した場合の手順:

### 1. Functions のロールバック

```bash
# 以前のバージョンに戻す
firebase functions:rollback api
firebase functions:rollback jobRunner
```

### 2. Hosting のロールバック

```bash
# 以前のデプロイに戻す
firebase hosting:rollback
```

### 3. Firestore Rules のロールバック

```bash
# 手動で firestore.rules を以前のバージョンに戻す
git checkout HEAD~1 firestore.rules
firebase deploy --only firestore:rules
```

---

## Phase 10: デプロイ後の監視

### 最初の24時間

- [ ] **1時間後**: エラーログを確認
- [ ] **4時間後**: パフォーマンスメトリクスを確認
- [ ] **24時間後**: ユーザーフィードバックを収集

### 監視項目

- [ ] **エラー率**: _____ %
- [ ] **平均レスポンス時間**: _____ ms
- [ ] **アクティブユーザー数**: _____
- [ ] **Functionsの実行回数**: _____
- [ ] **Firestoreの読み取り/書き込み**: _____

---

## 完了チェック

### 最終確認

- [ ] 全てのテストが成功した
- [ ] セキュリティ問題が修正された
- [ ] ドキュメントが更新された
- [ ] バックアップが取得された
- [ ] ロールバックプランが準備された
- [ ] 監視が設定された

### 承認

**開発者**: ___________  署名: ___________  日付: ___________

**レビュアー**: ___________  署名: ___________  日付: ___________

**承認者**: ___________  署名: ___________  日付: ___________

---

## 備考

```
_______________________________________
_______________________________________
_______________________________________
_______________________________________
```

---

**チェックリスト作成日**: 2025年10月21日
**最終更新日**: 2025年10月21日
**バージョン**: 1.0
