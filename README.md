# APDW Compass

建築業界向けプロジェクト・タスク・担当者管理システム

## 概要

APDW Compassは、日本の建築業界に特化したプロジェクト管理サービスです。プロジェクト、タスク、担当者を直感的なUIで管理し、Excel入出力、通知機能、カレンダー連携などの機能を提供します。

## 主な機能

### ✅ プロジェクト管理
- プロジェクトの作成・編集・削除
- ステータス管理（未着手/進行中/完了）
- 優先度設定
- クライアント・担当者情報の管理

### 📋 タスク管理
- タスクの作成・編集・完了
- ステータス管理（未着手/進行中/確認待ち/保留/完了）
- 担当者アサイン
- 工数見積・実績管理
- 進捗率の自動計算
- 依存タスクの設定

### 📊 可視化
- プロジェクトダッシュボード
- ガントチャート
- カンバンボード
- 担当者別ワークロード
- 進捗レポート

### 📧 通知機能
- タスク開始日通知
- 期限前日通知
- 期限当日通知
- 期限超過通知
- Gmail API連携

### 📅 カレンダー連携
- Google Calendar同期
- タスクの自動イベント作成
- 担当者カレンダーへの反映

### 📑 Excel入出力
- プロジェクト・タスク・担当者のExcelインポート
- データのExcelエクスポート
- 既存データの一括更新

### 👥 担当者管理
- 担当者情報の管理
- 稼働時間設定
- タスク割り当て状況の確認

## 技術スタック

### バックエンド
- Firebase Functions (Node.js 20)
- Express.js
- TypeScript
- Firebase Admin SDK
- Google APIs (Gmail, Calendar)

### フロントエンド
- React 18
- TypeScript
- Vite
- TailwindCSS
- Recharts

### データベース
- Cloud Firestore

## クイックスタート

### 前提条件
- Node.js 20以上
- Firebase CLI
- Firebaseプロジェクト

### インストール

```bash
# リポジトリのクローン
git clone https://github.com/sena-sakuramoto/compass.git
cd compass

# バックエンドのセットアップ
cd functions
npm install

# フロントエンドのセットアップ
cd ../web
npm install
```

### 開発サーバーの起動

```bash
# バックエンド（Firebase Emulator）
cd functions
npm run serve

# フロントエンド
cd web
npm run dev
```

ブラウザで http://localhost:5173 にアクセス。

## デプロイ

詳細は [DEPLOYMENT.md](./DEPLOYMENT.md) を参照してください。

```bash
# バックエンド
cd functions
npm run deploy

# フロントエンド
firebase deploy --only hosting
```

## ドキュメント

- [開発ガイド](./DEVELOPMENT.md) - 開発環境のセットアップと開発方法
- [デプロイ手順](./DEPLOYMENT.md) - 本番環境へのデプロイ手順
- [要件定義書](./新要件定義書.txt) - システムの要件定義

## プロジェクト構成

```
compass/
├── functions/          # Firebase Functions (バックエンド)
│   ├── src/
│   │   ├── api/       # APIエンドポイント
│   │   ├── lib/       # 共通ライブラリ
│   │   └── index.ts   # エントリーポイント
│   ├── package.json
│   └── tsconfig.json
├── web/               # React フロントエンド
│   ├── src/
│   │   ├── components/  # UIコンポーネント
│   │   ├── lib/         # ユーティリティ
│   │   └── App.tsx      # メインアプリ
│   ├── package.json
│   └── vite.config.ts
├── .env.example       # 環境変数サンプル
├── README.md          # このファイル
├── DEVELOPMENT.md     # 開発ガイド
└── DEPLOYMENT.md      # デプロイ手順
```

## API エンドポイント

### プロジェクト
- `GET /api/projects` - 一覧取得
- `POST /api/projects` - 作成
- `PUT /api/projects/:id` - 更新
- `DELETE /api/projects/:id` - 削除

### タスク
- `GET /api/tasks` - 一覧取得
- `POST /api/tasks` - 作成
- `PUT /api/tasks/:id` - 更新
- `POST /api/tasks/:id/complete` - 完了
- `POST /api/tasks/:id/move` - 日付移動
- `DELETE /api/tasks/:id` - 削除

### 担当者
- `GET /api/people` - 一覧取得
- `POST /api/people` - 作成
- `PUT /api/people/:name` - 更新
- `DELETE /api/people/:name` - 削除

### Excel
- `POST /api/excel/import` - インポート
- `GET /api/excel/export` - エクスポート

### カレンダー
- `POST /api/calendar/sync` - 同期

### ジョブ
- `POST /api/jobs/process` - ジョブ処理実行

## セキュリティ

- Firebase Authentication による認証
- メールアドレスベースのアクセス制御
- Firestoreセキュリティルール
- HTTPS通信
- サービスアカウントによるAPI認証

## 本番環境

- Web: https://compass-31e9e.web.app
- API: https://asia-northeast1-compass-31e9e.cloudfunctions.net/api

## ライセンス

Private

## 作成者

Archi Prisma

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。

