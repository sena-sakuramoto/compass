# APDW Compass デプロイ手順書

## 前提条件

- Node.js 20以上
- Firebase CLI (`npm install -g firebase-tools`)
- Firebaseプロジェクトの作成
- Google Cloud Platformでの設定

## 1. Firebase プロジェクトの設定

### 1.1 Firebaseプロジェクトの作成

```bash
# Firebase CLIでログイン
firebase login

# プロジェクトを初期化
firebase init
```

以下を選択:
- Firestore
- Functions
- Hosting

### 1.2 Firestoreのセキュリティルール

`firestore.rules` を以下のように設定:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orgs/{orgId}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 1.3 Firestore インデックスの作成

Firebase Consoleで以下のインデックスを作成:

- Collection: `orgs/{orgId}/tasks`
  - Fields: `projectId` (Ascending), `ステータス` (Ascending)
  - Fields: `担当者` (Ascending), `ステータス` (Ascending)

## 2. Google Cloud Platform の設定

### 2.1 サービスアカウントの作成

1. GCP Console > IAM & Admin > Service Accounts
2. 新しいサービスアカウントを作成
3. 以下のロールを付与:
   - Firebase Admin SDK Administrator Service Agent
   - Cloud Datastore User

### 2.2 ドメインワイド委任の設定（Gmail & Calendar API）

1. GCP Console > APIs & Services > Credentials
2. サービスアカウントの詳細を開く
3. "Show domain-wide delegation" を有効化
4. Google Workspace Admin Console で以下のスコープを承認:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/calendar`

### 2.3 APIの有効化

以下のAPIを有効化:
- Gmail API
- Google Calendar API
- Cloud Firestore API

## 3. 環境変数の設定

### 3.1 `.env` ファイルの作成

```bash
cp .env.example .env
```

`.env` を編集して以下を設定:

```env
ORG_ID=archi-prisma
GSA_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
NOTIFICATION_SENDER=no-reply@archi-prisma.co.jp
ALLOW_EMAILS=*@archi-prisma.co.jp,s.sakuramoto@archi-prisma.co.jp
```

### 3.2 Firebase Functions の環境変数設定

```bash
cd functions

# 環境変数を設定
firebase functions:config:set \
  app.org_id="archi-prisma" \
  gsa.client_email="your-service-account@your-project.iam.gserviceaccount.com" \
  gsa.private_key="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n" \
  notification.sender="no-reply@archi-prisma.co.jp" \
  allow.emails="*@archi-prisma.co.jp,s.sakuramoto@archi-prisma.co.jp"
```

## 4. バックエンドのデプロイ

### 4.1 依存関係のインストール

```bash
cd functions
npm install
```

### 4.2 ビルド

```bash
npm run build
```

### 4.3 デプロイ

```bash
npm run deploy
```

または

```bash
firebase deploy --only functions
```

## 5. フロントエンドのデプロイ

### 5.1 Firebase設定の追加

`web/src/lib/firebaseClient.ts` を編集して、Firebaseの設定を追加:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 5.2 依存関係のインストール

```bash
cd web
npm install
```

### 5.3 ビルド

```bash
npm run build
```

### 5.4 デプロイ

```bash
firebase deploy --only hosting
```

## 6. 初期データのインポート

### 6.1 Excelファイルの準備

以下のシートを含むExcelファイルを準備:
- **Projects**: プロジェクト情報
- **Tasks**: タスク情報
- **People**: 担当者情報

### 6.2 インポート

1. デプロイされたWebアプリにアクセス
2. ログイン
3. Excel入出力画面からファイルをインポート

## 7. 定期実行ジョブの設定（オプション）

### 7.1 Cloud Schedulerの設定

1. GCP Console > Cloud Scheduler
2. 以下のジョブを作成:

**通知チェック（毎日9:00）**
```
名前: daily-notifications
頻度: 0 9 * * *
ターゲット: HTTP
URL: https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/api/jobs/process
メソッド: POST
```

**期限超過チェック（毎日10:00）**
```
名前: overdue-check
頻度: 0 10 * * *
ターゲット: HTTP
URL: https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/api/jobs/process
メソッド: POST
```

## 8. 動作確認

### 8.1 認証のテスト

1. Webアプリにアクセス
2. 許可されたメールアドレスでログイン
3. ダッシュボードが表示されることを確認

### 8.2 CRUD操作のテスト

1. プロジェクトの作成・編集・削除
2. タスクの作成・編集・完了
3. 担当者の追加

### 8.3 通知のテスト

1. タスクに担当者メールと期限を設定
2. 通知設定を有効化
3. ジョブ処理エンドポイントを手動実行

### 8.4 カレンダー連携のテスト

1. タスクに担当者メールと日付を設定
2. カレンダー同期ボタンをクリック
3. Google Calendarにイベントが作成されることを確認

## トラブルシューティング

### Functions のログ確認

```bash
firebase functions:log
```

または GCP Console > Cloud Functions > ログ

### Firestore のデータ確認

Firebase Console > Firestore Database

### 認証エラー

- サービスアカウントの権限を確認
- ドメインワイド委任の設定を確認
- `ALLOW_EMAILS` の設定を確認

### API エラー

- Gmail API / Calendar API が有効化されているか確認
- サービスアカウントのスコープが正しいか確認

## セキュリティチェックリスト

- [ ] Firestore セキュリティルールが適切に設定されている
- [ ] 環境変数が正しく設定されている
- [ ] サービスアカウントキーが安全に管理されている
- [ ] 許可メールアドレスリストが適切に設定されている
- [ ] HTTPS が有効化されている
- [ ] CORS 設定が適切である

## 参考リンク

- [Firebase Documentation](https://firebase.google.com/docs)
- [Google Cloud Functions](https://cloud.google.com/functions)
- [Gmail API](https://developers.google.com/gmail/api)
- [Google Calendar API](https://developers.google.com/calendar)

