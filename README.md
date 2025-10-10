# Project Compass セットアップ手順

## 前提条件
- Node.js 20以上
- Firebase CLI (`npm install -g firebase-tools`)

## 初回セットアップ

### 1. リポジトリのクローン（またはファイル転送）
```bash
git clone <リポジトリURL>
cd projectask
```

### 2. Firebaseにログイン
```bash
firebase login
```

### 3. 環境変数の設定

#### functions/.env
`functions/.env.example`をコピーして`functions/.env`を作成:
```bash
cp functions/.env.example functions/.env
```

内容:
```
ORG_ID=archi-prisma
ALLOW_EMAILS=*@archi-prisma.co.jp,s.sakuramoto@archi-prisma.co.jp
COMPASS_FUNCTION_REGION=asia-northeast1
CORS_ORIGIN=https://compass-31e9e.web.app
```

#### web/.env
`web/.env.example`をコピーして`web/.env`を作成:
```bash
cp web/.env.example web/.env
```

内容:
```
VITE_API_BASE=/api
VITE_FIREBASE_API_KEY=AIzaSyAGutWJF5bcTr_01Bjkizr7Sfo9HO__H78
VITE_FIREBASE_AUTH_DOMAIN=compass-31e9e.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=compass-31e9e
VITE_FIREBASE_STORAGE_BUCKET=compass-31e9e.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=70173334851
VITE_FIREBASE_APP_ID=1:70173334851:web:fc6c922a399014a10923f6
```

### 4. 依存関係のインストール

#### Functions
```bash
cd functions
npm install
cd ..
```

#### Web
```bash
cd web
npm install
cd ..
```

### 5. ローカル開発

#### Webアプリの起動
```bash
cd web
npm run dev
```

#### Functions（エミュレーター）
```bash
firebase emulators:start
```

### 6. 本番デプロイ

#### Functions
```bash
cd functions
npm run deploy
```

#### Hosting（Web）
```bash
cd web
npm run build
cd ..
firebase deploy --only hosting
```

## トラブルシューティング

### 401 Unauthorized エラー
1. Google Cloud Console (https://console.cloud.google.com/iam-admin/iam?project=compass-31e9e) にアクセス
2. `compass-31e9e@appspot.gserviceaccount.com` に **Service Usage Consumer** ロールを追加

### Firebase config が読み込めない
```bash
cd functions
firebase functions:config:get
```
で設定を確認。必要なら:
```bash
firebase functions:config:set auth.allow_emails="*@archi-prisma.co.jp,s.sakuramoto@archi-prisma.co.jp"
firebase functions:config:set org.id="apdw"
```

## プロジェクト構造
```
projectask/
├── functions/          # Firebase Functions (API)
│   ├── src/
│   │   ├── api/       # APIエンドポイント
│   │   ├── lib/       # 共通ライブラリ
│   │   └── index.ts   # エントリーポイント
│   └── .env           # 環境変数（gitignore）
├── web/               # フロントエンド (React + Vite)
│   ├── src/
│   │   ├── components/
│   │   └── lib/
│   └── .env           # 環境変数（gitignore）
├── firebase.json      # Firebase設定
└── firestore.rules    # Firestoreセキュリティルール
```

## 本番URL
- Web: https://compass-31e9e.web.app
- API: https://asia-northeast1-compass-31e9e.cloudfunctions.net/api
