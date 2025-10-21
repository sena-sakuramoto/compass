# セキュリティ修正実行ガイド

このガイドでは、発見された重大なセキュリティ問題の修正手順を説明します。

---

## 🚨 緊急: Firebase API キーの露出対応 【最優先】

### 現状
Firebase API キーがGitリポジトリにコミットされており、公開されています。

### 対応手順

#### Step 1: Gitから機密情報を削除

```bash
cd D:\senaa_dev\compass

# .env ファイルをGitから削除（ファイル自体は残す）
git rm --cached web/.env
git rm --cached functions/.env

# コミット
git commit -m "security: Remove exposed environment variables from Git"

# リモートにプッシュ
git push origin main
```

#### Step 2: Firebase プロジェクトのキーを再生成

1. Firebase Console にアクセス
   https://console.firebase.google.com/project/compass-31e9e/settings/general

2. 「ウェブアプリ」セクションで、既存のアプリを見つける

3. 「削除」をクリックして既存のアプリを削除

4. 「アプリを追加」 > 「ウェブ」を選択

5. アプリ名を入力（例: "Compass Web App"）

6. 新しい設定値をコピー

#### Step 3: 新しい環境変数を設定

`web/.env.local` ファイルを作成（Gitには追加しない）:

```env
VITE_FIREBASE_API_KEY=【新しいAPIキー】
VITE_FIREBASE_AUTH_DOMAIN=compass-31e9e.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=compass-31e9e
VITE_FIREBASE_STORAGE_BUCKET=compass-31e9e.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=【新しいSender ID】
VITE_FIREBASE_APP_ID=【新しいApp ID】
VITE_API_BASE=/api
```

#### Step 4: .gitignore を確認

`.gitignore` に以下が含まれていることを確認:

```gitignore
.env
.env.local
.env.*.local
```

---

## 🔐 Google Service Account の設定

### 必要な理由
カレンダー同期とGmail通知機能に必要です。

### 手順

#### Step 1: Service Account を作成

1. Google Cloud Console にアクセス
   https://console.cloud.google.com/iam-admin/serviceaccounts?project=compass-31e9e

2. 「+ サービス アカウントを作成」をクリック

3. 以下を入力:
   - 名前: `compass-service-account`
   - ID: `compass-service-account`
   - 説明: `COMPASS アプリケーション用サービスアカウント`

4. 「作成して続行」をクリック

5. ロールを選択:
   - `Service Account Token Creator`
   - `Editor` (または必要最小限の権限)

6. 「続行」をクリック

7. 「完了」をクリック

#### Step 2: キーを作成

1. 作成したサービスアカウントをクリック

2. 「キー」タブに移動

3. 「鍵を追加」 > 「新しい鍵を作成」をクリック

4. 「JSON」を選択し、「作成」をクリック

5. JSONファイルがダウンロードされる

#### Step 3: APIを有効化

必要なAPIを有効化:
- Gmail API
- Google Calendar API

https://console.cloud.google.com/apis/library

#### Step 4: ドメイン全体の委任を設定

1. Google Workspace 管理コンソールにアクセス
   https://admin.google.com/

2. 「セキュリティ」 > 「アクセスとデータ管理」 > 「API の制御」

3. 「ドメイン全体の委任を管理」をクリック

4. 「新しく追加」をクリック

5. クライアント IDを入力（JSON ファイル内の `client_id`）

6. OAuth スコープを追加:
   ```
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/calendar
   ```

7. 「承認」をクリック

#### Step 5: 環境変数を設定

`functions/.env.local` ファイルを作成:

```env
ORG_ID=archi-prisma

# Service Account
GSA_CLIENT_EMAIL=compass-service-account@compass-31e9e.iam.gserviceaccount.com
GSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
【JSONファイルのprivate_keyの内容をここに貼り付け】
-----END PRIVATE KEY-----
"
GSA_IMPERSONATE=admin@archi-prisma.co.jp

# Notification
NOTIFICATION_SENDER=noreply@archi-prisma.co.jp

# Calendar
CALENDAR_ID=primary
CALENDAR_TIMEZONE=Asia/Tokyo

# Jobs
JOB_RUNNER_BATCH=10

# CORS
CORS_ORIGIN=https://compass-31e9e.web.app,https://compass-31e9e.firebaseapp.com

# Allowed emails
ALLOW_EMAILS=*@archi-prisma.co.jp

# Region
COMPASS_FUNCTION_REGION=asia-northeast1
```

**注意**:
- `GSA_PRIVATE_KEY` は改行を `\n` に変換して1行にする
- このファイルは絶対にGitにコミットしない

---

## 🛡️ CORS とセキュリティルールの確認

### CORS設定

`functions/src/index.ts` が以下のように修正されていることを確認:

```typescript
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['https://compass-31e9e.web.app', 'https://compass-31e9e.firebaseapp.com'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy violation: ${origin} is not allowed`));
      }
    },
    credentials: true,
  })
);
```

### Firestore セキュリティルールのテスト

1. Firebase Console でセキュリティルールを確認
   https://console.firebase.google.com/project/compass-31e9e/firestore/rules

2. ルールシミュレーターでテスト:
   - 認証されていないユーザーがデータを読み取れないこと
   - プロジェクトメンバーのみがタスクにアクセスできること
   - 他組織のデータにアクセスできないこと

---

## 🚀 デプロイ前のチェックリスト

### 環境変数の確認

- [ ] `web/.env.local` が作成され、新しいFirebaseキーが設定されている
- [ ] `functions/.env.local` が作成され、Service Accountキーが設定されている
- [ ] `.env.local` ファイルが `.gitignore` に含まれている
- [ ] Gitに機密情報がコミットされていない

### コードの確認

- [ ] TypeScript strict モードが有効になっている
- [ ] CORS設定が正しく実装されている
- [ ] Firestore セキュリティルールが更新されている
- [ ] ビルドエラーがない

```bash
# ビルドテスト
cd web
npm run build

cd ../functions
npm run build
```

### Firebase Functions の環境変数設定

Firebase Functions に環境変数を設定:

```bash
cd functions

# 環境変数をFirebase Functionsに設定
firebase functions:config:set \
  org.id="archi-prisma" \
  gsa.client_email="compass-service-account@compass-31e9e.iam.gserviceaccount.com" \
  gsa.private_key="【秘密鍵】" \
  gsa.impersonate="admin@archi-prisma.co.jp" \
  notification.sender="noreply@archi-prisma.co.jp" \
  calendar.id="primary" \
  calendar.timezone="Asia/Tokyo" \
  job.runner_batch="10" \
  cors.origin="https://compass-31e9e.web.app,https://compass-31e9e.firebaseapp.com" \
  compass.function_region="asia-northeast1"

# 設定を確認
firebase functions:config:get
```

**または** `.env` ファイルを使用する場合（推奨）:

`functions/.env` に上記の環境変数を設定し、デプロイ時に自動的に読み込まれるようにします。

---

## 📋 デプロイ手順

### 1. ローカルでテスト

```bash
# Firebaseエミュレーターを起動
cd D:\senaa_dev\compass
firebase emulators:start
```

ブラウザで `http://localhost:5000` を開いてテストします。

### 2. 本番環境にデプロイ

```bash
# Firestoreルールをデプロイ
firebase deploy --only firestore:rules

# Functionsをデプロイ
firebase deploy --only functions

# Hostingをデプロイ
cd web
npm run build
cd ..
firebase deploy --only hosting
```

### 3. デプロイ後の確認

- [ ] ログイン機能が動作する
- [ ] プロジェクト一覧が表示される
- [ ] タスク作成・編集ができる
- [ ] 権限のないデータにアクセスできないことを確認
- [ ] エラーログを確認（Firebase Console > Functions > ログ）

---

## 🔍 セキュリティチェック

デプロイ後、以下を確認してください:

### 1. 認証テスト

- [ ] 未認証ユーザーがAPIにアクセスできない
- [ ] ログインしたユーザーのみがデータにアクセスできる
- [ ] 他の組織のデータにアクセスできない

### 2. 権限テスト

- [ ] 一般ユーザーが他人のタスクを編集できない
- [ ] プロジェクトマネージャーがプロジェクトを作成できる
- [ ] 管理者のみが削除操作ができる

### 3. CORS テスト

- [ ] 許可されたオリジンからのリクエストが成功する
- [ ] 許可されていないオリジンからのリクエストが拒否される

### 4. データ漏洩チェック

- [ ] コンソールログに機密情報が出力されていない
- [ ] エラーメッセージに詳細なスタック情報が含まれていない

---

## 🆘 トラブルシューティング

### 問題: Functions のデプロイが失敗する

**原因**: 環境変数が正しく設定されていない

**解決方法**:
```bash
# 環境変数を確認
firebase functions:config:get

# .env ファイルを確認
cat functions/.env
```

### 問題: CORS エラーが発生する

**原因**: `CORS_ORIGIN` が正しく設定されていない

**解決方法**:
```bash
# functions/.env を確認
CORS_ORIGIN=https://compass-31e9e.web.app,https://compass-31e9e.firebaseapp.com
```

### 問題: Firestore のアクセスが拒否される

**原因**: セキュリティルールが厳しすぎる

**解決方法**:
1. Firebase Console でセキュリティルールを確認
2. ルールシミュレーターでテスト
3. 必要に応じてルールを調整

---

## 📞 サポート

問題が解決しない場合:

1. Firebase Console のログを確認
2. ブラウザのコンソールを確認
3. エラーメッセージを記録
4. 開発チームに連絡

---

**最終更新**: 2025年10月21日
