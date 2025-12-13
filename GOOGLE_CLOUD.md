# Google Cloud Source Repositories 連携ガイド

## 概要

APDW Compassは、**Google Cloud Source Repositories**をメインのコード管理リポジトリとして使用しています。GitHubはバックアップおよび外部共有用のサブリポジトリとして位置づけられています。

---

## リポジトリ構成

### メインリポジトリ（Google Cloud Source Repositories）

- **プロジェクトID**: `compass-31e9e`
- **リポジトリ名**: `compass`
- **URL**: https://source.developers.google.com/p/compass-31e9e/r/compass
- **用途**: 本番環境への反映、開発作業のメインブランチ管理

### サブリポジトリ（GitHub）

- **リポジトリ**: https://github.com/sena-sakuramoto/compass
- **用途**: バックアップ、外部共有、オープンソース公開（将来）

---

## Google Cloud Source Repositories のセットアップ

### 1. gcloud CLI のインストール

#### macOS

```bash
# Homebrewを使用
brew install --cask google-cloud-sdk
```

#### Linux

```bash
# Debian/Ubuntu
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
sudo apt-get update && sudo apt-get install google-cloud-sdk
```

#### Windows

https://cloud.google.com/sdk/docs/install からインストーラーをダウンロード

### 2. gcloud 認証

```bash
# Google アカウントでログイン
gcloud auth login

# プロジェクトを設定
gcloud config set project compass-31e9e
```

### 3. Git 認証ヘルパーの設定

```bash
# Git に gcloud 認証ヘルパーを設定
git config --global credential.https://source.developers.google.com.helper gcloud.sh
```

---

## リポジトリのクローン

### Google Cloud Source Repositories からクローン

```bash
# 方法1: gcloud コマンドを使用（推奨）
gcloud source repos clone compass --project=compass-31e9e

# 方法2: git clone を直接使用
git clone https://source.developers.google.com/p/compass-31e9e/r/compass
```

### 既存のローカルリポジトリに Google Cloud リモートを追加

```bash
cd compass

# Google Cloud リモートを追加
git remote add google https://source.developers.google.com/p/compass-31e9e/r/compass

# リモートを確認
git remote -v
```

出力例:
```
google  https://source.developers.google.com/p/compass-31e9e/r/compass (fetch)
google  https://source.developers.google.com/p/compass-31e9e/r/compass (push)
origin  https://github.com/sena-sakuramoto/compass.git (fetch)
origin  https://github.com/sena-sakuramoto/compass.git (push)
```

---

## 開発ワークフロー

### 通常の開発フロー

```bash
# 1. 最新コードを取得
git pull google main

# 2. ブランチを作成（機能開発の場合）
git checkout -b feature/new-feature

# 3. コードを編集
# ... 開発作業 ...

# 4. コミット
git add .
git commit -m "feat: 新機能を追加"

# 5. Google Cloud にプッシュ
git push google feature/new-feature

# 6. メインブランチにマージ（レビュー後）
git checkout main
git merge feature/new-feature
git push google main

# 7. GitHub にもバックアップ（オプション）
git push origin main
```

### 本番反映フロー

```bash
# 1. main ブランチの最新を取得
git checkout main
git pull google main

# 2. ビルド確認
cd functions && npm run build && cd ..
cd web && npm run build && cd ..

# 3. Firebase にデプロイ
firebase deploy --only functions
firebase deploy --only hosting

# 4. 動作確認
# https://compass-31e9e.web.app/ にアクセス
```

---

## Google Cloud Console での操作

### リポジトリの確認

https://source.cloud.google.com/compass-31e9e/compass

以下の操作が可能:
- コミット履歴の確認
- ブランチの管理
- ファイルの閲覧
- 差分の確認

### Cloud Build との連携（CI/CD）

Google Cloud Source Repositories は Cloud Build と連携できます。

#### トリガーの設定例

1. Cloud Build コンソールにアクセス: https://console.cloud.google.com/cloud-build/triggers?project=compass-31e9e
2. 「トリガーを作成」をクリック
3. 以下を設定:
   - **イベント**: ブランチへのプッシュ
   - **ソース**: `compass-31e9e/compass`
   - **ブランチ**: `^main$`
   - **ビルド構成**: Cloud Build 構成ファイル（`cloudbuild.yaml`）

#### cloudbuild.yaml の例

```yaml
steps:
  # Functions のビルド
  - name: 'node:20'
    dir: 'functions'
    entrypoint: 'npm'
    args: ['install']
  
  - name: 'node:20'
    dir: 'functions'
    entrypoint: 'npm'
    args: ['run', 'build']
  
  # Web のビルド
  - name: 'node:20'
    dir: 'web'
    entrypoint: 'npm'
    args: ['install']
  
  - name: 'node:20'
    dir: 'web'
    entrypoint: 'npm'
    args: ['run', 'build']
  
  # Firebase デプロイ
  - name: 'gcr.io/compass-31e9e/firebase'
    args: ['deploy', '--only', 'functions,hosting']

timeout: '1200s'
```

---

## GitHub との同期

Google Cloud Source Repositories がメインですが、GitHub にもバックアップを保持します。

### 両方のリモートにプッシュ

```bash
# Google Cloud にプッシュ（メイン）
git push google main

# GitHub にもプッシュ（バックアップ）
git push origin main
```

### 自動同期スクリプト

```bash
#!/bin/bash
# sync-repos.sh

# メインリポジトリにプッシュ
git push google main

# バックアップリポジトリにもプッシュ
git push origin main

echo "✅ Google Cloud と GitHub の両方に同期しました"
```

使用方法:
```bash
chmod +x sync-repos.sh
./sync-repos.sh
```

---

## トラブルシューティング

### 認証エラー

```
fatal: could not read Username for 'https://source.developers.google.com'
```

**対処法**:
```bash
# gcloud で再認証
gcloud auth login

# Git 認証ヘルパーを再設定
git config --global credential.https://source.developers.google.com.helper gcloud.sh
```

### プッシュエラー

```
error: failed to push some refs
```

**対処法**:
```bash
# リモートの最新を取得
git pull google main --rebase

# 再度プッシュ
git push google main
```

### 権限エラー

```
Permission denied
```

**対処法**:
1. Google Cloud Console で IAM 権限を確認: https://console.cloud.google.com/iam-admin/iam?project=compass-31e9e
2. 自分のアカウントに「Source Repository Writer」ロールがあることを確認
3. ない場合は、プロジェクトオーナーに権限付与を依頼

---

## セキュリティ

### アクセス制御

Google Cloud Source Repositories は、Google Cloud IAM で厳密にアクセス制御されています。

**推奨ロール**:
- **開発者**: Source Repository Writer
- **閲覧者**: Source Repository Reader
- **管理者**: Source Repository Administrator

### 監査ログ

すべてのリポジトリ操作は Cloud Audit Logs に記録されます。

確認方法: https://console.cloud.google.com/logs/query?project=compass-31e9e

---

## 参考リンク

- **Google Cloud Source Repositories ドキュメント**: https://cloud.google.com/source-repositories/docs
- **gcloud CLI リファレンス**: https://cloud.google.com/sdk/gcloud/reference/source/repos
- **Cloud Build ドキュメント**: https://cloud.google.com/build/docs
- **Firebase CLI リファレンス**: https://firebase.google.com/docs/cli

---

**最終更新日**: 2025年10月17日

