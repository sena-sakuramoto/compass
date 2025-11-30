# 管理者向け クイックセットアップガイド

## 現在の状態

✅ 全機能デプロイ済み
✅ メンバー管理統合完了
✅ クライアントリスト機能動作中
✅ Google連携なしでも通常入力可能

## 必須作業

### 1. 動作確認（5分）

1. https://compass-31e9e.web.app にアクセス
2. プロジェクト編集画面を開く
3. 以下を確認：
   - メンバー管理が画面内でできるか
   - クライアント選択ができるか
   - 所在地/現地が入力できるか
   - フォルダURLが入力できるか

✅ **ここまでで基本機能は全て利用可能です**

---

## 任意作業（Google連携を有効化する場合）

Google連携を有効にすると：
- 住所入力時に自動補完される
- Google Driveからフォルダを直接選択できる

**必要なければスキップしてOKです**（通常入力で十分使えます）

### 2. Google Maps API設定（10分）

住所の自動補完機能を有効化します。

#### Step 1: Google Cloud Consoleでプロジェクト作成

1. https://console.cloud.google.com/ にアクセス
2. 「プロジェクトを作成」
3. プロジェクト名: `Compass`（任意）
4. 「作成」をクリック

#### Step 2: Maps JavaScript APIを有効化

1. 左メニュー → **APIとサービス** → **ライブラリ**
2. 検索: `Maps JavaScript API`
3. **有効にする** をクリック
4. 同様に `Places API` も有効化

#### Step 3: APIキーを作成

1. **APIとサービス** → **認証情報**
2. **+ 認証情報を作成** → **APIキー**
3. APIキーが表示される（後で使うのでコピー）
4. **キーを制限** をクリック：
   - **アプリケーションの制限**: HTTPリファラー
   - **ウェブサイトの制限**に追加:
     ```
     https://compass-31e9e.web.app/*
     https://compass-31e9e.firebaseapp.com/*
     http://localhost:*
     ```
   - **API の制限**: キーを制限
     - Maps JavaScript API にチェック
     - Places API にチェック
   - **保存**

#### Step 4: 環境変数に設定

1. Compassプロジェクトフォルダを開く
2. `web/.env.local` ファイルを作成（なければ）
3. 以下を追加:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=AIza....（先ほどコピーしたAPIキー）
   ```

#### Step 5: 再デプロイ

```bash
cd web
npm run build
cd ..
firebase deploy --only hosting
```

✅ **完了！** 住所入力時に自動補完が表示されます

---

### 3. Google Drive API設定（15分）

フォルダピッカー機能を有効化します。

#### Step 1: Google Drive APIを有効化

1. Google Cloud Console → **APIとサービス** → **ライブラリ**
2. 検索: `Google Drive API`
3. **有効にする**
4. 同様に `Google Picker API` も有効化

#### Step 2: OAuth同意画面の設定（初回のみ）

1. **APIとサービス** → **OAuth同意画面**
2. User Type: **外部** を選択 → **作成**
3. アプリ情報:
   - アプリ名: `Compass`
   - ユーザーサポートメール: あなたのメールアドレス
   - デベロッパーの連絡先: あなたのメールアドレス
4. **保存して次へ**
5. スコープ:
   - **スコープを追加または削除**
   - `https://www.googleapis.com/auth/drive.readonly` を追加
   - **更新** → **保存して次へ**
6. テストユーザー:
   - **+ ADD USERS**
   - 使用するGoogleアカウントのメールアドレスを追加
   - **保存して次へ**
7. **ダッシュボードに戻る**

#### Step 3: OAuth クライアントIDを作成

1. **APIとサービス** → **認証情報**
2. **+ 認証情報を作成** → **OAuth クライアント ID**
3. アプリケーションの種類: **ウェブアプリケーション**
4. 名前: `Compass Web Client`
5. **承認済みのJavaScript生成元**に追加:
   ```
   https://compass-31e9e.web.app
   https://compass-31e9e.firebaseapp.com
   http://localhost:5173
   ```
6. **承認済みのリダイレクトURI**に追加:
   ```
   https://compass-31e9e.web.app
   https://compass-31e9e.firebaseapp.com
   http://localhost:5173
   ```
7. **作成**
8. **クライアントID** をコピー

#### Step 4: App IDを取得

1. Google Cloud Console → **ダッシュボード**
2. **プロジェクト番号**をコピー（これがApp ID）

#### Step 5: APIキーを作成

1. **APIとサービス** → **認証情報**
2. **+ 認証情報を作成** → **APIキー**
3. APIキーをコピー
4. **キーを制限**:
   - **アプリケーションの制限**: HTTPリファラー
   - **ウェブサイトの制限**に追加:
     ```
     https://compass-31e9e.web.app/*
     https://compass-31e9e.firebaseapp.com/*
     http://localhost:*
     ```
   - **API の制限**: キーを制限
     - Google Drive API にチェック
     - Google Picker API にチェック
   - **保存**

#### Step 6: 環境変数に設定

`web/.env.local` ファイルに追加:

```env
# Google Drive API
VITE_GOOGLE_API_KEY=AIza....（Step 5で作成したAPIキー）
VITE_GOOGLE_CLIENT_ID=123456789...apps.googleusercontent.com（Step 3のクライアントID）
VITE_GOOGLE_APP_ID=123456789（Step 4のプロジェクト番号）
```

#### Step 7: 再デプロイ

```bash
cd web
npm run build
cd ..
firebase deploy --only hosting
```

✅ **完了！** フォルダURLの「選択」ボタンでGoogle Driveから選択できます

---

## 完成形の `.env.local` ファイル

```env
# Firebase設定（既に設定済み）
VITE_FIREBASE_API_KEY=your_actual_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=compass-31e9e.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=compass-31e9e
VITE_FIREBASE_STORAGE_BUCKET=compass-31e9e.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_actual_sender_id
VITE_FIREBASE_APP_ID=your_actual_app_id
VITE_API_BASE=/api

# Google Maps API（住所自動補完）
VITE_GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Google Drive API（フォルダピッカー）
VITE_GOOGLE_API_KEY=AIzaSyYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
VITE_GOOGLE_CLIENT_ID=123456789012-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
VITE_GOOGLE_APP_ID=123456789012
```

---

## トラブルシューティング

### 再デプロイ後も変更が反映されない

1. ブラウザのキャッシュをクリア（Ctrl+Shift+Delete）
2. シークレットモードで開く
3. 数分待ってから再度アクセス

### 「Google Maps APIキーが設定されていません」と表示

1. `.env.local` ファイルの場所を確認
   - 正しい場所: `D:\senaa_dev\compass\web\.env.local`
2. ファイル名を確認（`.env.local.txt` になっていないか）
3. 再ビルド・再デプロイ

### Google Driveの「選択」ボタンが表示されない

APIキーが設定されていません。`.env.local` を確認してください。

### Google Driveピッカーでエラーが出る

1. OAuth同意画面の「テストユーザー」に自分のメールアドレスが追加されているか確認
2. クライアントIDとApp IDが正しいか確認
3. 承認済みのJavaScript生成元に本番URLが追加されているか確認

---

## 費用について

**心配不要です：**

- Google Maps API: 月28,000リクエストまで無料
  - 通常の使用では無料枠内で収まります

- Google Drive API: 基本的に無料
  - クエリ制限あり（通常の使用では問題なし）

大規模な使用でなければ費用はかかりません。

---

## まとめ

### すぐにできること（設定不要）
✅ メンバー管理（画面内で完結）
✅ クライアント選択（新規追加も可能）
✅ 所在地/現地の入力（通常入力）
✅ フォルダURLの入力（通常入力）

### Google連携を設定すると便利になること
📍 住所入力時の自動補完
📁 Google Driveから直接フォルダ選択

**どちらも任意です。必要に応じて設定してください。**
