# ローカル環境への保存方法

## 概要

現在、すべての変更はサンドボックス環境にのみ保存されています。ローカル環境（`D:\senaa_dev\compass\compass`）に反映するには、以下の方法があります。

## 方法1: GitHubを経由する（推奨）

### 手順

1. **サンドボックスからGitHubにプッシュ**（既に完了）
   ```bash
   # サンドボックス環境で実行済み
   git add -A
   git commit -m "Add multi-tenant and role-based access control"
   git push origin main
   ```

2. **ローカル環境でプル**
   ```bash
   # ローカル環境（D:\senaa_dev\compass\compass）で実行
   cd D:\senaa_dev\compass\compass
   git pull origin main
   ```

### 注意事項

- GitHubリモートが設定されている必要があります
- ローカルに未コミットの変更がある場合は、先にコミットまたはstashしてください

## 方法2: ファイルを直接ダウンロード

### 手順

1. **重要なファイルをダウンロード**
   
   以下のファイルをManusのUIからダウンロードして、ローカル環境の対応する場所に配置してください。

#### バックエンド（functions/src/）
- `functions/src/lib/roles.ts`
- `functions/src/lib/auth-types.ts`
- `functions/src/lib/users.ts`
- `functions/src/lib/project-members.ts`
- `functions/src/lib/access-control.ts`
- `functions/src/lib/firestore.ts`（更新）
- `functions/src/api/users-api.ts`
- `functions/src/api/project-members-api.ts`
- `functions/src/index.ts`（更新）

#### フロントエンド（web/src/）
- `web/src/lib/auth-types.ts`
- `web/src/components/ProjectMembersDialog.tsx`
- `web/src/components/ProjectCard.tsx`（更新）
- `web/src/App.tsx`（更新）
- `web/.env`（更新）

#### その他
- `firestore.rules`（更新）
- `SYSTEM_ARCHITECTURE.mmd` / `.png`
- `DATA_FLOW.mmd` / `.png`
- `DATABASE_STRUCTURE.mmd` / `.png`
- `ROLE_PERMISSIONS.mmd` / `.png`
- `MULTI_TENANT_COMPLETE_REPORT.md`
- `MULTI_TENANT_DESIGN.md`
- `MULTI_TENANT_PHASE1-4_SUMMARY.md`

2. **依存関係のインストール**（新しいパッケージがある場合）
   ```bash
   # バックエンド
   cd functions
   npm install
   
   # フロントエンド
   cd ../web
   npm install
   ```

3. **ビルドの確認**
   ```bash
   # バックエンド
   cd functions
   npx tsc --noEmit
   
   # フロントエンド
   cd ../web
   npm run build
   ```

## 方法3: アーカイブをダウンロード

### 手順

1. **サンドボックス環境でアーカイブを作成**
   ```bash
   cd /home/ubuntu
   tar -czf compass-backup.tar.gz compass/
   ```

2. **アーカイブをダウンロード**
   - Manusのファイルブラウザから `compass-backup.tar.gz` をダウンロード

3. **ローカル環境で解凍**
   ```bash
   # Windowsの場合（7-Zipなどを使用）
   # または WSL/Git Bash で
   tar -xzf compass-backup.tar.gz
   ```

4. **必要なファイルをコピー**
   - 解凍したファイルから必要なファイルを `D:\senaa_dev\compass\compass` にコピー

## 現在のGitコミット履歴

以下のコミットがサンドボックス環境に存在します：

1. `Fix Firestore field sanitization and update ProjectEditDialog`
2. `Fix gantt chart height and add missing tasks warning`
3. `Add multi-tenant and role-based access control (Phase 1-4)`
4. `Add multi-tenant and role-based access control (Phase 5-7)`
5. `Add complete multi-tenant implementation report`
6. `Add system architecture diagrams (Mermaid)`

## 確認方法

ローカル環境に正しく保存されたか確認するには：

```bash
cd D:\senaa_dev\compass\compass
git log --oneline -10
```

最新のコミットが表示されれば成功です。

## トラブルシューティング

### GitHubリモートが設定されていない場合

```bash
# ローカル環境で実行
cd D:\senaa_dev\compass\compass
git remote add origin https://github.com/YOUR_USERNAME/compass.git
```

### ローカルに未コミットの変更がある場合

```bash
# ローカル環境で実行
git status
git stash  # 一時的に変更を退避
git pull origin main
git stash pop  # 変更を復元（必要に応じて）
```

### マージコンフリクトが発生した場合

```bash
# ローカル環境で実行
git status  # コンフリクトしているファイルを確認
# 手動でコンフリクトを解決
git add .
git commit -m "Resolve merge conflicts"
```

## 推奨される保存方法

**方法1（GitHubを経由）** を推奨します。理由：

- ✅ バージョン管理が維持される
- ✅ 変更履歴が保持される
- ✅ チーム開発に適している
- ✅ 簡単で確実

## 次のステップ

ローカル環境に保存した後：

1. **環境変数の確認**
   - `web/.env` に正しいFirebase設定が含まれているか確認

2. **ビルドの確認**
   - バックエンドとフロントエンドが正しくビルドできるか確認

3. **デプロイ**
   ```bash
   firebase deploy
   ```

4. **動作確認**
   - https://compass-31e9e.web.app/ にアクセスして動作確認

