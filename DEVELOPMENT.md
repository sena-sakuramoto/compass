# APDW Compass 開発ガイド

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
└── README.md
```

## 技術スタック

### バックエンド
- **Firebase Functions**: サーバーレス関数
- **Express.js**: APIルーティング
- **TypeScript**: 型安全な開発
- **Firebase Admin SDK**: Firestore操作
- **Google APIs**: Gmail & Calendar連携
- **Zod**: バリデーション

### フロントエンド
- **React 18**: UIフレームワーク
- **TypeScript**: 型安全な開発
- **Vite**: ビルドツール
- **TailwindCSS**: スタイリング
- **Lucide React**: アイコン
- **Recharts**: グラフ描画
- **React Router**: ルーティング
- **Framer Motion**: アニメーション

## 開発環境のセットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/sena-sakuramoto/compass.git
cd compass
```

### 2. 依存関係のインストール

```bash
# バックエンド
cd functions
npm install

# フロントエンド
cd ../web
npm install
```

### 3. 環境変数の設定

```bash
# ルートディレクトリで
cp .env.example .env
```

`.env` を編集して必要な値を設定。

### 4. Firebase Emulatorの起動（開発用）

```bash
cd functions
npm run serve
```

これにより以下が起動:
- Functions Emulator: http://localhost:5001
- Firestore Emulator: http://localhost:8080

### 5. フロントエンドの起動

```bash
cd web
npm run dev
```

ブラウザで http://localhost:5173 にアクセス。

## 主要な機能

### 1. プロジェクト管理

**API**: `functions/src/api/projects.ts`

- `GET /api/projects` - プロジェクト一覧
- `POST /api/projects` - プロジェクト作成
- `PUT /api/projects/:id` - プロジェクト更新
- `DELETE /api/projects/:id` - プロジェクト削除

### 2. タスク管理

**API**: `functions/src/api/tasks.ts`

- `GET /api/tasks` - タスク一覧（フィルタ対応）
- `POST /api/tasks` - タスク作成
- `PUT /api/tasks/:id` - タスク更新
- `POST /api/tasks/:id/complete` - タスク完了
- `POST /api/tasks/:id/move` - タスク日付移動（ガント用）

### 3. 担当者管理

**API**: `functions/src/api/people.ts`

- `GET /api/people` - 担当者一覧
- `POST /api/people` - 担当者作成
- `PUT /api/people/:name` - 担当者更新
- `DELETE /api/people/:name` - 担当者削除

### 4. Excel入出力

**API**: `functions/src/api/excel.ts`

- `POST /api/excel/import` - Excelインポート
- `GET /api/excel/export` - Excelエクスポート
- `GET /api/excel/snapshot` - JSONスナップショット取得
- `POST /api/excel/snapshot` - JSONスナップショットインポート

### 5. 通知機能

**実装**: `functions/src/lib/notifications.ts`

- タスク開始日通知
- 期限前日通知
- 期限当日通知
- 期限超過通知

**ジョブ処理**: `functions/src/lib/jobProcessor.ts`

### 6. カレンダー連携

**実装**: `functions/src/lib/gcal.ts`

- タスクからカレンダーイベント作成
- イベント更新・削除
- ドメインワイド委任による担当者カレンダーへの同期

## データモデル

### Project

```typescript
interface Project {
  id: string;                    // P-0001形式
  物件名: string;
  クライアント?: string;
  LS担当者?: string;
  自社PM?: string;
  ステータス: string;            // 未着手/進行中/完了
  優先度: string;                // 高/中/低
  開始日?: string;               // YYYY-MM-DD
  予定完了日?: string;
  現地調査日?: string;
  着工日?: string;
  竣工予定日?: string;
  '所在地/現地'?: string;
  フォルダURL?: string;
  備考?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Task

```typescript
interface Task {
  id: string;                    // T000001形式
  projectId: string;
  タスク名: string;
  タスク種別?: string;
  担当者?: string;
  担当者メール?: string;
  優先度?: string;
  ステータス: string;            // 未着手/進行中/確認待ち/保留/完了
  予定開始日?: string;
  期限?: string;
  実績開始日?: string;
  実績完了日?: string;
  progress?: number;             // 0.0 ~ 1.0
  duration_days?: number;
  '工数見積(h)'?: number;
  '工数実績(h)'?: number;
  依頼元?: string;
  '依存タスク'?: string[];
  'カレンダーイベントID'?: string;
  '通知設定'?: TaskNotificationSettings;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Person

```typescript
interface Person {
  氏名: string;                  // ドキュメントID
  役割?: string;
  メール?: string;
  電話?: string;
  '稼働時間/日(h)'?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## コーディング規約

### TypeScript

- **厳格な型チェック**: `strict: true`
- **明示的な型定義**: 関数の引数と戻り値に型を明記
- **インターフェース優先**: `type` より `interface` を優先
- **非同期処理**: `async/await` を使用

### React

- **関数コンポーネント**: クラスコンポーネントは使用しない
- **Hooks**: `useState`, `useEffect` などを活用
- **Props型定義**: すべてのコンポーネントでPropsの型を定義
- **命名規則**: コンポーネントはPascalCase、関数はcamelCase

### スタイリング

- **TailwindCSS**: ユーティリティクラスを使用
- **レスポンシブ**: `sm:`, `md:`, `lg:` プレフィックスを活用
- **カラーパレット**: `slate` を基調とする
- **一貫性**: 既存のデザインパターンに従う

## テスト

### ユニットテスト（TODO）

```bash
cd functions
npm test
```

### E2Eテスト（TODO）

```bash
cd web
npm run test:e2e
```

## デバッグ

### バックエンドのログ

```bash
# ローカル
firebase emulators:start --inspect-functions

# 本番
firebase functions:log --only api
```

### フロントエンドのデバッグ

ブラウザのDevToolsを使用。

### Firestoreのデータ確認

```bash
# Emulator UI
http://localhost:4000

# 本番
Firebase Console > Firestore Database
```

## ビルド

### バックエンド

```bash
cd functions
npm run build
```

出力: `functions/lib/`

### フロントエンド

```bash
cd web
npm run build
```

出力: `web/dist/`

## デプロイ

詳細は `DEPLOYMENT.md` を参照。

```bash
# バックエンド
cd functions
npm run deploy

# フロントエンド
cd web
firebase deploy --only hosting
```

## トラブルシューティング

### ビルドエラー

1. 依存関係を再インストール
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. TypeScriptのキャッシュをクリア
   ```bash
   rm -rf dist lib
   npm run build
   ```

### 認証エラー

- Firebase Admin SDKの初期化を確認
- サービスアカウントキーのパスを確認
- 環境変数が正しく設定されているか確認

### API エラー

- リクエストボディのバリデーションエラーを確認
- Firestoreのセキュリティルールを確認
- ネットワークタブでレスポンスを確認

## 貢献ガイドライン

### ブランチ戦略

- `main`: 本番環境
- `develop`: 開発環境
- `feature/*`: 新機能
- `fix/*`: バグ修正

### コミットメッセージ

```
<type>: <subject>

<body>
```

**Type**:
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント
- `style`: スタイル変更
- `refactor`: リファクタリング
- `test`: テスト追加
- `chore`: その他

### プルリクエスト

1. `develop` から新しいブランチを作成
2. 変更を実装
3. テストを追加
4. プルリクエストを作成
5. レビューを受ける
6. マージ

## 参考資料

- [Firebase Documentation](https://firebase.google.com/docs)
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)

