# Compass

建築業界向けプロジェクト・工程管理システム

## 概要

Compassは、建築業界に特化したプロジェクト・工程管理サービスです。
プロジェクト、タスク、メンバーを直感的なUIで管理し、進捗の可視化、メンバー管理、Google API連携などの機能を提供します。

## 本番環境

- **Web**: https://compass-31e9e.web.app
- **API**: https://api-g3xwwspyla-an.a.run.app

## 主な機能

### プロジェクト管理
- プロジェクトCRUD（作成・閲覧・更新・削除）
- ステータス・優先度管理
- 施工費管理
- メンバー管理（営業、PM、設計、施工管理）
- クライアント管理
- マイルストーン管理（現地調査日、着工日、竣工予定日、引渡し予定日）
- フォルダURL管理
- 所在地管理（Google Maps連携）

### タスク管理
- タスクCRUD
- 担当者アサイン
- 日程管理（予定・実績）
- 工数管理（見積・実績）
- 進捗率自動計算
- スプリント・フェーズ管理
- 依存タスク設定

### 可視化
- プロジェクトダッシュボード
- ガントチャート（マイルストーン表示付き）
- タスクテーブル
- 統計情報（プロジェクト数、タスク数、進捗率、施工費合計）

### アクセス管理
- マルチテナント対応（組織単位）
- プロジェクトメンバー管理
- ロールベースアクセス制御（owner/manager/member/viewer）
- 招待システム（メールベース）

### Google API連携
- Google Maps API（住所自動補完）
- Google Drive API（フォルダピッカー）
- Gmail API（タスク通知・招待メール送信）※Google Workspaceアカウント必須
- Google Calendar API（タスク同期）※Google Workspaceアカウント必須


## 技術スタック

### フロントエンド
- React 18 + TypeScript
- Vite
- TailwindCSS
- Lucide Icons
- date-fns
- Recharts

### バックエンド
- Firebase Functions (Node.js 20, 2nd Gen)
- Express.js + TypeScript
- Zod (バリデーション)

### インフラ
- Cloud Firestore
- Firebase Authentication
- Firebase Hosting
- Cloud Scheduler

## セットアップ

### 前提条件
- Node.js 20以上
- Firebase CLI
- Firebaseプロジェクト

### インストール

```bash
# リポジトリのクローン
git clone https://github.com/sena-sakuramoto/compass.git
cd compass

# バックエンド
cd functions
npm install

# フロントエンド
cd ../web
npm install
```

### 開発サーバー起動

```bash
# バックエンド（エミュレーター）
cd functions
npm run serve

# フロントエンド
cd web
npm run dev
```

ブラウザで http://localhost:5173 にアクセス

### 環境変数設定

`web/.env.local` を作成：
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_API_BASE=/api

# Optional: Google API連携
VITE_GOOGLE_MAPS_API_KEY=your_maps_api_key
VITE_GOOGLE_API_KEY=your_google_api_key
VITE_GOOGLE_CLIENT_ID=your_client_id
VITE_GOOGLE_APP_ID=your_app_id
```

詳細は [docs/GOOGLE_API_SETUP.md](./docs/GOOGLE_API_SETUP.md) 参照

## デプロイ

```bash
# バックエンド
cd functions
npx tsc
firebase deploy --only functions

# フロントエンド
cd web
npm run build
firebase deploy --only hosting
```

## プロジェクト構成

```
compass/
├── functions/              # バックエンド
│   ├── src/
│   │   ├── api/           # REST APIエンドポイント
│   │   ├── lib/           # 共通ライブラリ
│   │   ├── scheduled/     # Cloud Scheduler
│   │   └── index.ts
│   └── package.json
├── web/                   # フロントエンド
│   ├── src/
│   │   ├── components/    # UIコンポーネント
│   │   ├── lib/           # ユーティリティ
│   │   └── App.tsx
│   └── package.json
└── docs/                  # ドキュメント
    ├── GOOGLE_API_SETUP.md
    └── QUICK_SETUP_GUIDE.md
```

## データベーススキーマ

```
orgs/{orgId}/
  ├── projects/{projectId}
  │   ├── 物件名、ステータス、優先度
  │   ├── 日程（開始日、完了日、マイルストーン）
  │   ├── 施工費
  │   └── メタデータ
  ├── project_members/{memberId}
  │   ├── projectId, userId, role, 職種
  │   └── status (active/inactive)
  ├── tasks/{taskId}
  │   ├── タスク名、ステータス、担当者
  │   ├── 日程、工数
  │   └── スプリント、フェーズ
  ├── clients/{clientId}
  │   └── name, createdAt
  └── people/{personId}
      └── 氏名、役割、メール

users/{userId}/
  ├── email, displayName
  ├── orgId, role
  └── organizations (複数組織対応)
```

## 開発ドキュメント

- [Google API連携設定](./docs/GOOGLE_API_SETUP.md)
- [クイックセットアップガイド](./docs/QUICK_SETUP_GUIDE.md)
- [スマホUX改善計画](./MOBILE_UX_IMPROVEMENT_PLAN.md)
- [開発ガイド](./DEVELOPMENT.md)
- [デプロイ手順](./DEPLOYMENT.md)

## 今後の開発予定

優先度順：
1. スマホUX改善（レスポンシブデザイン、タッチ操作最適化）
2. 通知機能の完成
3. PWA対応
4. Excel入出力機能

詳細は [MOBILE_UX_IMPROVEMENT_PLAN.md](./MOBILE_UX_IMPROVEMENT_PLAN.md) 参照

## セキュリティ

- Firebase Authentication
- メールアドレスベースのアクセス制御
- ロールベースのアクセス制御
- Firestoreセキュリティルール
- HTTPS通信

## ライセンス

Private

## 作成者

Archi Prisma
