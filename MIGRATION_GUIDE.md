# データ移行ガイド: タスクに orgId を追加

## 📋 概要

**目的**: すべてのタスクに `orgId` フィールドを追加して、タスクからプロジェクト情報を正しく取得できるようにする

**影響範囲**:
- `/orgs/{orgId}/tasks/{taskId}` の全ドキュメント
- タスク一覧画面でプロジェクト名が表示されるようになる

**所要時間**: タスク数により変動（1000タスクで約1-2分）

---

## 🔍 現在の問題

### ❌ タスクにプロジェクト名が表示されない

```javascript
// タスク取得
const tasks = await listTasks({ orgId: user.orgId });

// 各タスクのプロジェクト名を表示しようとすると...
for (const task of tasks) {
  // タスクには projectId しかない
  // どの組織のプロジェクトかわからない！
  const project = await getProject(???, task.projectId);  // orgId が不明
}
```

### ✅ 解決策

タスクに `orgId` フィールドを追加:

```javascript
// タスクに orgId があれば...
const task = {
  id: "T001",
  projectId: "P-0001",
  orgId: "archi-prisma",  // ← これを追加!
  タスク名: "設計作業"
};

// プロジェクトを取得できる
const project = await getProject(task.orgId, task.projectId);
console.log(project.物件名);  // "プロジェクトA"
```

---

## 📝 移行手順

### ステップ1: バックアップを取得 ⚠️

**本番環境で実行する前に必ずバックアップを取得してください！**

```bash
# Firestore のバックアップを取得
gcloud firestore export gs://your-bucket/backup-$(date +%Y%m%d-%H%M%S)
```

または、Firebase Console から:
1. Firestore Database を開く
2. 「エクスポート」をクリック
3. バックアップ先を選択

### ステップ2: コードをビルド

```bash
cd functions
npm run build
```

**確認項目**:
- ✅ TypeScript のビルドエラーがないこと
- ✅ `lib/types.js` に `orgId` フィールドが含まれていること

### ステップ3: Firebase 認証を確認

```bash
# Firebase にログインしているか確認
firebase login

# プロジェクトを確認
firebase projects:list

# 使用するプロジェクトを選択
firebase use <project-id>
```

### ステップ4: 移行スクリプトを実行

```bash
cd functions
node scripts/add-orgid-to-tasks.js
```

**出力例**:
```
========================================
タスクに orgId フィールドを追加する移行スクリプト
========================================

Found 3 organizations

[archi-prisma] Processing organization...
  Found 150 tasks
  + Task T001: Adding orgId=archi-prisma
  + Task T002: Adding orgId=archi-prisma
  ...
  Committed batch of 150 updates
[archi-prisma] ✅ Completed

[demo] Processing organization...
  Found 5 tasks
  + Task T001: Adding orgId=demo
  ...
  Committed batch of 5 updates
[demo] ✅ Completed

========================================
移行完了
========================================
Total tasks: 155
Updated: 155
Skipped (already had orgId): 0
========================================
```

### ステップ5: 移行結果を確認

#### Firebase Console で確認

1. Firestore Database を開く
2. `/orgs/{orgId}/tasks/{taskId}` を開く
3. `orgId` フィールドが追加されていることを確認

#### スクリプトで確認

```javascript
// 確認スクリプト（functions/scripts/verify-task-orgid.js を作成）
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function verify() {
  const orgs = await db.collection('orgs').get();

  for (const orgDoc of orgs.docs) {
    const orgId = orgDoc.id;
    const tasks = await db.collection('orgs').doc(orgId).collection('tasks').get();

    let withOrgId = 0;
    let withoutOrgId = 0;

    tasks.docs.forEach(task => {
      if (task.data().orgId) {
        withOrgId++;
      } else {
        withoutOrgId++;
        console.log(`❌ Task ${task.id} in org ${orgId} is missing orgId`);
      }
    });

    console.log(`[${orgId}] Total: ${tasks.size}, With orgId: ${withOrgId}, Without orgId: ${withoutOrgId}`);
  }
}

verify();
```

### ステップ6: Functions をデプロイ

```bash
cd functions
npm run deploy
```

または、特定の関数のみデプロイ:

```bash
firebase deploy --only functions:api
```

### ステップ7: 動作確認

1. **タスク一覧画面を開く**
   - プロジェクト名が正しく表示されることを確認

2. **新しいタスクを作成**
   - `orgId` が自動的に保存されることを確認

3. **既存タスクを編集**
   - 問題なく編集できることを確認

---

## 🔄 ロールバック手順

万が一問題が発生した場合:

### 方法1: バックアップから復元

```bash
# Firestore のバックアップから復元
gcloud firestore import gs://your-bucket/backup-YYYYMMDD-HHMMSS
```

### 方法2: orgId フィールドを削除

```javascript
// ロールバックスクリプト
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function rollback() {
  const orgs = await db.collection('orgs').get();

  for (const orgDoc of orgs.docs) {
    const orgId = orgDoc.id;
    const tasks = await db.collection('orgs').doc(orgId).collection('tasks').get();

    const batch = db.batch();
    tasks.docs.forEach(task => {
      batch.update(task.ref, {
        orgId: admin.firestore.FieldValue.delete()
      });
    });
    await batch.commit();
    console.log(`[${orgId}] Removed orgId from ${tasks.size} tasks`);
  }
}

rollback();
```

### 方法3: 以前のバージョンをデプロイ

```bash
# Git で以前のコミットに戻る
git log --oneline
git checkout <commit-hash>

# 以前のバージョンをデプロイ
cd functions
npm run build
npm run deploy
```

---

## ✅ チェックリスト

### 移行前

- [ ] バックアップを取得済み
- [ ] TypeScript のビルドが成功
- [ ] Firebase 認証が有効
- [ ] 本番環境のプロジェクトを選択済み
- [ ] スクリプトの内容を確認済み

### 移行中

- [ ] スクリプトがエラーなく完了
- [ ] すべてのタスクが更新された（スキップされたタスクを除く）
- [ ] Firebase Console で orgId フィールドを確認

### 移行後

- [ ] Functions を本番環境にデプロイ済み
- [ ] タスク一覧画面でプロジェクト名が表示される
- [ ] 新しいタスクに orgId が自動保存される
- [ ] 既存タスクの編集・削除が正常動作
- [ ] エラーログを確認（Cloud Functions のログ）

---

## 📊 影響を受ける機能

### ✅ 正常に動作するようになる機能

1. **タスク一覧画面**
   - プロジェクト名が正しく表示される
   - プロジェクトでフィルタリングできる

2. **クロスオーガナイゼーション**
   - 他の組織のプロジェクトに招待されても、タスクが見れる
   - タスクのプロジェクト名が正しく取得できる

3. **タスク作成・編集**
   - 自動的に orgId が保存される
   - 権限チェックが正しく動作する

### ⚠️ 注意が必要な機能

1. **タスクAPI**
   - `orgId` がない古いタスクは、移行スクリプト実行まで表示されない可能性がある
   - 移行後は問題なし

2. **レポート・集計機能**
   - タスクデータを直接クエリしている場合、`orgId` フィールドの考慮が必要

---

## 🐛 トラブルシューティング

### 問題1: 認証エラーが出る

**エラー**:
```
Error initializing Firebase Admin: Could not load default credentials
```

**解決策**:
```bash
# Firebase にログイン
firebase login

# または、サービスアカウントキーを設定
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
```

### 問題2: タスクが見つからない

**エラー**:
```
Found 0 tasks
```

**原因**:
- Firebase プロジェクトが間違っている
- 組織IDが間違っている

**解決策**:
```bash
# 正しいプロジェクトを選択
firebase use <project-id>

# Firestore のデータを確認
firebase firestore:get orgs
```

### 問題3: バッチ更新が失敗する

**エラー**:
```
Error: Batch size exceeds limit
```

**解決策**:
スクリプト内の `BATCH_SIZE` を減らす（現在500）:

```javascript
const BATCH_SIZE = 250;  // 500 → 250 に変更
```

### 問題4: 移行後もプロジェクト名が表示されない

**原因**:
- Functions がデプロイされていない
- フロントエンドのキャッシュ

**解決策**:
```bash
# Functions を再デプロイ
cd functions
npm run deploy

# ブラウザのキャッシュをクリア
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

---

## 📞 サポート

問題が解決しない場合:

1. **ログを確認**
   ```bash
   # Cloud Functions のログ
   firebase functions:log

   # Firestore のログ
   gcloud logging read "resource.type=datastore_database"
   ```

2. **検証スクリプトを実行**
   ```bash
   node scripts/verify-task-orgid.js
   ```

3. **GitHub Issue を作成**
   - エラーメッセージ
   - ログの出力
   - 環境情報（Node.js バージョン、Firebase CLI バージョン）

---

## 📚 関連ドキュメント

- [FIRESTORE_SCHEMA.md](./FIRESTORE_SCHEMA.md) - Firestore のデータ構造
- [PROJECT_MEMBERSHIP_MIGRATION_COMPLETE.md](./PROJECT_MEMBERSHIP_MIGRATION_COMPLETE.md) - プロジェクトメンバーシップ移行
- `functions/scripts/add-orgid-to-tasks.js` - 移行スクリプト

---

**作成日**: 2025-01-XX
**最終更新**: 2025-01-XX
**作成者**: Claude Code
