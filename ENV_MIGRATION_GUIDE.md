# 環境変数の移行ガイド

## 背景

Firebase Functionsの `functions.config()` APIは2026年3月に廃止されます。現在のコードでは既に `process.env.ORG_ID` を使用しているため、`.env`ファイルベースの環境変数管理に移行することを推奨します。

## 現在の状態

現在、環境変数は以下のコマンドで設定されています：

```bash
firebase functions:config:set org.id="archi-prisma"
```

これは一時的に動作しますが、将来的に廃止されるため、`.env`ファイルに移行する必要があります。

## 移行手順

### ステップ1: .envファイルの作成

`functions/.env`ファイルを作成し、以下の内容を記述します：

```bash
cd D:\senaa_dev\compass\compass\functions
```

`functions/.env`ファイルに以下を記述：

```env
ORG_ID=archi-prisma
```

### ステップ2: .env.exampleの更新

他の開発者のために、`functions/.env.example`ファイルも更新します：

```env
# Organization ID for Firestore data structure
ORG_ID=archi-prisma
```

### ステップ3: .gitignoreの確認

`.env`ファイルが`.gitignore`に含まれていることを確認します（既に含まれています）：

```
functions/.env
```

### ステップ4: デプロイ

`.env`ファイルを使用してデプロイします：

```bash
firebase deploy --only functions
```

Firebase CLIは自動的に`.env`ファイルを検出し、環境変数として設定します。

## 現在のデプロイ方法（暫定）

`.env`ファイルへの移行が完了するまでは、現在の方法でデプロイできます：

```bash
# 既に設定済みの環境変数を使用
firebase deploy --only functions
```

## 確認方法

デプロイ後、環境変数が正しく設定されているか確認します：

### Firebase Consoleで確認

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. プロジェクト `compass-31e9e` を選択
3. Functions → 関数を選択
4. 「設定」タブで環境変数を確認

### ログで確認

Cloud Functionsのログで `ORG_ID` の値を確認：

```bash
firebase functions:log --only api
```

## トラブルシューティング

### 環境変数が反映されない

**原因**: `.env`ファイルが正しく読み込まれていない

**解決策**:

1. `functions/.env`ファイルが存在することを確認
2. ファイルの内容が正しいことを確認
3. 再デプロイを実行：
   ```bash
   firebase deploy --only functions --force
   ```

### デプロイエラー

**エラー**: `Error: Failed to load environment variables`

**解決策**: `.env`ファイルの形式を確認：

```env
# 正しい形式
ORG_ID=archi-prisma

# 間違った形式（引用符は不要）
ORG_ID="archi-prisma"
```

## 参考資料

- [Firebase Functions環境変数の設定](https://firebase.google.com/docs/functions/config-env)
- [.envファイルへの移行ガイド](https://firebase.google.com/docs/functions/config-env#migrate-to-dotenv)

## まとめ

現在の設定（`firebase functions:config:set`）は2026年3月まで動作しますが、早めに`.env`ファイルベースの管理に移行することを推奨します。移行は簡単で、`functions/.env`ファイルを作成してデプロイするだけです。

