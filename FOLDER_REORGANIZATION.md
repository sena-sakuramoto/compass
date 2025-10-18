# フォルダ構造の整理手順

## 現在の状況

```
D:\senaa_dev\
  └── compass\              ← 親フォルダ（不要）
      └── compass\          ← 実際のプロジェクトフォルダ
          ├── functions\
          ├── web\
          ├── firestore.rules
          └── ...
```

この重複したフォルダ構造を整理します。

## 推奨される整理方法

### オプション1: プロジェクトフォルダを一つ上に移動（推奨）

**結果**:
```
D:\senaa_dev\
  └── compass\              ← プロジェクトフォルダ
      ├── functions\
      ├── web\
      ├── firestore.rules
      └── ...
```

**手順**:

1. **コマンドプロンプトまたはPowerShellを開く**

2. **現在のフォルダ構造を確認**
   ```cmd
   cd D:\senaa_dev\compass
   dir
   ```
   
   `compass` フォルダが1つだけ表示されるはずです。

3. **内側のcompassフォルダの内容を一つ上に移動**
   ```cmd
   cd D:\senaa_dev\compass
   
   REM 一時フォルダを作成
   mkdir temp_compass
   
   REM 内側のcompassフォルダの内容を一時フォルダにコピー
   xcopy compass\* temp_compass\ /E /I /H /Y
   
   REM 内側のcompassフォルダを削除
   rmdir /S /Q compass
   
   REM 一時フォルダの内容を現在のフォルダに移動
   xcopy temp_compass\* . /E /I /H /Y
   
   REM 一時フォルダを削除
   rmdir /S /Q temp_compass
   ```

4. **Gitリモートの確認**
   ```cmd
   git remote -v
   ```
   
   正しく設定されているか確認します。

5. **GitHubから最新版をプル**
   ```cmd
   git pull origin main
   ```

### オプション2: 新しい場所にクローン（最も簡単）

**結果**:
```
D:\senaa_dev\
  ├── compass-old\          ← 古いフォルダ（後で削除）
  └── compass\              ← 新しいプロジェクトフォルダ
      ├── functions\
      ├── web\
      ├── firestore.rules
      └── ...
```

**手順**:

1. **コマンドプロンプトまたはPowerShellを開く**

2. **古いフォルダをリネーム**
   ```cmd
   cd D:\senaa_dev
   rename compass compass-old
   ```

3. **GitHubから新しくクローン**
   ```cmd
   cd D:\senaa_dev
   git clone https://github.com/sena-sakuramoto/compass.git
   ```

4. **環境変数ファイルをコピー**
   ```cmd
   copy compass-old\compass\web\.env compass\web\.env
   copy compass-old\compass\functions\.env compass\functions\.env
   ```

5. **依存関係をインストール**
   ```cmd
   cd compass\functions
   npm install
   
   cd ..\web
   npm install
   ```

6. **動作確認**
   ```cmd
   cd ..\functions
   npx tsc --noEmit
   
   cd ..\web
   npm run build
   ```

7. **問題なければ古いフォルダを削除**
   ```cmd
   cd D:\senaa_dev
   rmdir /S /Q compass-old
   ```

## 推奨される方法

**オプション2（新しい場所にクローン）** を推奨します。理由：

✅ 最も安全（古いフォルダは保持される）
✅ 最も簡単（Gitが自動的に正しい構造を作成）
✅ 確実に最新版が取得できる
✅ 問題があれば古いフォルダに戻せる

## 実行後の確認

整理後、以下を確認してください：

1. **フォルダ構造**
   ```cmd
   cd D:\senaa_dev\compass
   dir
   ```
   
   `functions`, `web`, `firestore.rules` などが直接表示されるはずです。

2. **Gitの状態**
   ```cmd
   git status
   git log --oneline -5
   ```
   
   最新のコミットが表示されるはずです。

3. **ビルド**
   ```cmd
   cd functions
   npx tsc --noEmit
   
   cd ..\web
   npm run build
   ```
   
   エラーなくビルドできるはずです。

4. **Firebase設定**
   ```cmd
   firebase projects:list
   firebase use compass-31e9e
   ```
   
   正しいプロジェクトが選択されているはずです。

## トラブルシューティング

### Gitリモートが正しく設定されていない場合

```cmd
cd D:\senaa_dev\compass
git remote remove origin
git remote add origin https://github.com/sena-sakuramoto/compass.git
git fetch origin
git branch --set-upstream-to=origin/main main
```

### 環境変数ファイルが見つからない場合

`web/.env` ファイルを手動で作成してください：

```env
VITE_FIREBASE_API_KEY=AIzaSyAGutWJF5bcTr_01Bjkizr7Sfo9HO__H78
VITE_FIREBASE_AUTH_DOMAIN=compass-31e9e.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=compass-31e9e
VITE_FIREBASE_STORAGE_BUCKET=compass-31e9e.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=70173334851
VITE_FIREBASE_APP_ID=1:70173334851:web:fc6c922a399014a10923f6
```

`functions/.env` ファイルを手動で作成してください：

```env
ORG_ID=archi-prisma
```

## 次のステップ

フォルダ構造を整理した後：

1. **デプロイ**
   ```cmd
   cd D:\senaa_dev\compass
   firebase deploy
   ```

2. **動作確認**
   - https://compass-31e9e.web.app/ にアクセス
   - メンバー管理機能が正しく動作するか確認

3. **開発の継続**
   - 今後は `D:\senaa_dev\compass` で作業
   - `D:\senaa_dev\compass\compass` は使用しない

