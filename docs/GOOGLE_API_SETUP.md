# Google API連携セットアップガイド

Compassでは、以下のGoogle APIを利用できます：
- **Google Maps API**: 住所の自動補完
- **Google Drive API**: フォルダピッカー

## 1. Google Cloud Consoleでプロジェクトを作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成（または既存のプロジェクトを選択）
3. プロジェクト名: 例「Compass」

## 2. Google Maps API の有効化

### APIの有効化

1. Google Cloud Console → **APIs & Services** → **Library**
2. 「Maps JavaScript API」を検索
3. **Enable（有効にする）**をクリック
4. 「Places API」も同様に有効化

### APIキーの作成

1. **APIs & Services** → **Credentials**
2. **+ CREATE CREDENTIALS** → **API key**
3. 作成されたAPIキーをコピー
4. **制限を設定**（推奨）:
   - **Application restrictions**: HTTP referrers (web sites)
   - **Website restrictions** に以下を追加:
     - `https://compass-31e9e.web.app/*`
     - `https://compass-31e9e.firebaseapp.com/*`
     - ローカル開発用: `http://localhost:*`
   - **API restrictions**: Restrict key
     - Maps JavaScript API
     - Places API

### 環境変数に設定

`.env.local` ファイルに追加:
```env
VITE_GOOGLE_MAPS_API_KEY=AIza...（作成したAPIキー）
```

## 3. Google Drive API の有効化

### APIの有効化

1. Google Cloud Console → **APIs & Services** → **Library**
2. 「Google Drive API」を検索
3. **Enable（有効にする）**をクリック
4. 「Google Picker API」も同様に有効化

### OAuth 2.0 クライアントIDの作成

1. **APIs & Services** → **Credentials**
2. **OAuth consent screen**（初回のみ）:
   - User Type: **External**（外部）
   - App name: Compass
   - User support email: あなたのメールアドレス
   - Developer contact information: あなたのメールアドレス
   - **Scopes**: `https://www.googleapis.com/auth/drive.readonly` を追加
   - Test users: 使用するGoogleアカウントを追加（本番公開前は必須）
   - **Save and Continue**

3. **+ CREATE CREDENTIALS** → **OAuth client ID**
4. Application type: **Web application**
5. Name: Compass Web Client
6. **Authorized JavaScript origins** に以下を追加:
   - `https://compass-31e9e.web.app`
   - `https://compass-31e9e.firebaseapp.com`
   - ローカル開発用: `http://localhost:5173`
7. **Authorized redirect URIs** に以下を追加:
   - `https://compass-31e9e.web.app`
   - `https://compass-31e9e.firebaseapp.com`
   - ローカル開発用: `http://localhost:5173`

8. **CREATE** をクリック
9. **Client ID** と **API key** をコピー

### App IDの取得

1. Google Cloud Console → **ダッシュボード**
2. **Project number**（プロジェクト番号）をコピー
   - これが `VITE_GOOGLE_APP_ID` になります

### 環境変数に設定

`.env.local` ファイルに追加:
```env
VITE_GOOGLE_API_KEY=AIza...（作成したAPIキー）
VITE_GOOGLE_CLIENT_ID=123456789...apps.googleusercontent.com（Client ID）
VITE_GOOGLE_APP_ID=123456789（Project number）
```

## 4. 環境変数ファイルの完成形

`.env.local` ファイル（`.gitignore`で除外されているため安全）:

```env
# Firebase設定
VITE_FIREBASE_API_KEY=your_actual_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=compass-31e9e.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=compass-31e9e
VITE_FIREBASE_STORAGE_BUCKET=compass-31e9e.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_actual_sender_id
VITE_FIREBASE_APP_ID=your_actual_app_id
VITE_API_BASE=/api

# Google Maps API
VITE_GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Google Drive API
VITE_GOOGLE_API_KEY=AIzaSyYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
VITE_GOOGLE_CLIENT_ID=123456789012-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
VITE_GOOGLE_APP_ID=123456789012
```

## 5. 本番環境への反映

### Firebase Hostingの環境変数設定

Firebase Hostingでは、ビルド時に環境変数が埋め込まれます。

1. `.env.local` に実際の値を設定
2. ビルド:
   ```bash
   cd web
   npm run build
   ```
3. デプロイ:
   ```bash
   firebase deploy --only hosting
   ```

**注意**: 環境変数はビルド時に静的ファイルに埋め込まれるため、変更後は必ず再ビルド・再デプロイが必要です。

## 6. 動作確認

### Google Maps（住所自動補完）
1. プロジェクト編集画面を開く
2. 「所在地/現地」フィールドに「東京都」と入力
3. 住所候補が表示されればOK

### Google Drive（フォルダピッカー）
1. プロジェクト編集画面を開く
2. 「フォルダURL」の「選択」ボタンをクリック
3. Googleアカウントでログインを求められる
4. 許可を与えるとフォルダピッカーが開く
5. フォルダを選択するとURLが自動入力される

## トラブルシューティング

### 「Google Maps APIキーが設定されていません」と表示される
- `.env.local` ファイルが正しい場所にあるか確認
- ファイル名が正確に `.env.local` か確認（`.env.local.txt` などになっていないか）
- 再ビルド・再起動が必要

### Google Driveの「選択」ボタンが表示されない
- APIキーが設定されていない
- `.env.local` を確認してください

### Google Driveピッカーが開かない
- OAuth consent screenの設定が完了しているか確認
- Test usersに使用するGoogleアカウントが追加されているか確認
- Client IDとApp IDが正しいか確認

### CORS エラーが発生する
- OAuth client IDの「Authorized JavaScript origins」に本番URLが追加されているか確認
- キャッシュをクリアして再度試す

## セキュリティ上の注意

1. **APIキーは公開リポジトリにコミットしない**
   - `.env.local` は `.gitignore` に含まれています
   - `.env` ファイルはサンプルのみで、実際の値は含めない

2. **APIキーに制限を設定する**
   - HTTP referrer制限を必ず設定
   - 使用するAPIのみに制限

3. **OAuth consent screenは慎重に設定**
   - 必要最小限のスコープのみ許可
   - 本番公開前はTest usersのみに制限

## 費用について

- **Google Maps API**:
  - 月28,000リクエストまで無料
  - 通常の使用では無料枠内で収まります

- **Google Drive API**:
  - 基本的に無料
  - クエリ制限: 1ユーザーあたり1秒に10リクエスト

詳細は [Google Cloud Platform料金](https://cloud.google.com/pricing) を参照してください。
