# データ移行ガイド: memberType削除とフィールド名英語化

## 📋 概要

**目的**: memberType/guest概念の削除とフィールド名の英語化を本番環境に安全に適用

**影響範囲**:
- `users` コレクション全体（フィールド名変更、memberType削除）
- `project_members` コレクション全体（フィールド名変更、orgId='external'の解決）
- `orgs/{orgId}/collaborators` コレクション（新規）

**所要時間**: データ量により変動（1000ドキュメントで約5-10分）

**前提条件**:
- ✅ PR #1, #2, #3 がすでにマージ済み
- ✅ バックエンドコードが新仕様に対応済み
- ✅ フロントエンドコードが新仕様に対応済み
- ✅ TypeScriptコンパイルが成功している

---

## 🔍 移行内容

### 変更1: フィールド名の英語化

| コレクション | 旧フィールド名 | 新フィールド名 |
|------------|--------------|-------------|
| users | 職種 | jobTitle |
| users | 部署 | department |
| users | 電話番号 | phoneNumber |
| project_members | 職種 | jobTitle |

### 変更2: memberType の削除

```typescript
// BEFORE:
{
  id: "user123",
  email: "user@example.com",
  memberType: "member",  // ← 削除
  職種: "PM",             // ← 削除
  部署: "設計部",         // ← 削除
}

// AFTER:
{
  id: "user123",
  email: "user@example.com",
  jobTitle: "PM",        // ← 英語に変更
  department: "設計部",   // ← 英語に変更
}
```

### 変更3: orgId='external' の解決

```typescript
// BEFORE:
{
  memberId: "pm123",
  projectId: "P-0001",
  orgId: "external",     // ← 実在組織IDに変更が必要
  email: "external@example.com",
}

// AFTER:
{
  memberId: "pm123",
  projectId: "P-0001",
  orgId: "real-org-id",  // ← ユーザーの実在組織ID
  email: "external@example.com",
}
```

---

## 📝 移行手順

### Phase 0: 準備作業 ⚠️

#### 0-1. バックアップを取得

**必須**: 本番環境で実行する前に必ずバックアップを取得してください！

```bash
# Firestore のバックアップを取得
gcloud firestore export gs://compass-backup/backup-$(date +%Y%m%d-%H%M%S)
```

または、Firebase Console から:
1. Firestore Database を開く
2. 「エクスポート」をクリック
3. バックアップ先 Cloud Storage バケットを選択

#### 0-2. Firebase 認証を確認

```bash
# Firebase にログイン
firebase login

# プロジェクトを確認
firebase projects:list

# 本番プロジェクトを選択
firebase use compass-31e9e  # または本番プロジェクトID
```

#### 0-3. 環境変数を設定

```bash
# functions ディレクトリに移動
cd functions

# サービスアカウントキーを設定（必要な場合）
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"

# または、Application Default Credentials を使用
gcloud auth application-default login
```

#### 0-4. コードをビルド

```bash
cd functions
npm run build
```

**確認事項**:
- ✅ TypeScript のビルドエラーがないこと
- ✅ `lib/auth-types.js` が正しく生成されていること
- ✅ `scripts/migrate-data.js` が存在すること

---

### Phase 1: Dry-run（読み取り専用テスト）

#### 1-1. Dry-run実行

```bash
cd functions
npx ts-node src/scripts/migrate-data.ts --dry-run > migration-report.txt
```

#### 1-2. レポートを確認

```bash
cat migration-report.txt
```

**確認項目**:
- 処理対象のユーザー数
- 処理対象のproject_members数
- orgId='external' のメンバー数
- エラーがないか

**出力例**:
```
============================================================
Data Migration Script
============================================================
Mode: DRY RUN
============================================================

=== Phase 1: Migrating users collection ===
  [DRY-RUN] Would update user user123: { jobTitle: 'PM', department: '設計部', phoneNumber: '090-1234-5678' }
  [DRY-RUN] Would update user user456: { memberType: FieldValue.delete() }
Processed 150 users, 120 need updates

=== Phase 2: Migrating project_members collection ===
  ⚠️  Member pm123 has orgId='external'
     Email: external@example.com, Display: 外部太郎
     → Manual intervention required: assign real orgId
Processed 300 members, 80 need updates
⚠️  Found 5 members with orgId='external' - manual review required

=== Migration Report ===
Users processed: 150
Users updated: 120
Project members processed: 300
Project members updated: 80
Members with orgId='external': 5

✅ No errors
```

#### 1-3. エラーがある場合

- エラーログを確認し、原因を特定
- 必要に応じてスクリプトを修正
- 再度 Dry-run を実行

---

### Phase 2: orgId='external' メンバーの解決

#### 2-1. external メンバーレポート生成

```bash
cd functions
npx ts-node src/scripts/report-external-members.ts
```

#### 2-2. CSVファイルを確認

```bash
# CSVファイルが生成される
ls -lh external-members-report.csv

# 内容を確認
cat external-members-report.csv
```

**CSVの内容例**:
```csv
Member ID,Project ID,Project Name,User ID,Email,Display Name,Role,Job Title,Status,Invited By,Invited At,Suggested Action
pm123,P-0001,プロジェクトA,user789,external@example.com,外部太郎,viewer,設計,active,admin123,2025-01-15T10:30:00Z,"Check if user exists in system with email ""external@example.com"" and assign their orgId"
pm456,P-0002,プロジェクトB,,,協力者B,viewer,,invited,pm001,2025-01-20T14:00:00Z,"Create Collaborator record or assign to default organization"
```

#### 2-3. 手動で orgId を修正

**方法1: メールアドレスでユーザーを検索して orgId を割り当て**

```typescript
// Firebase Console または Admin SDK で実行
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function fixExternalMember(memberId: string, email: string) {
  // 1. メールアドレスでユーザーを検索
  const userSnapshot = await db.collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();

  if (userSnapshot.empty) {
    console.log(`User not found for email: ${email}`);
    return;
  }

  const user = userSnapshot.docs[0].data();
  const realOrgId = user.orgId;

  // 2. プロジェクトメンバーの orgId を更新
  await db.collection('project_members').doc(memberId).update({
    orgId: realOrgId,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  console.log(`✓ Updated member ${memberId}: orgId=${realOrgId}`);
}

// CSV から抽出した情報で実行
await fixExternalMember('pm123', 'external@example.com');
await fixExternalMember('pm456', 'another@example.com');
```

**方法2: デフォルト組織に一括割り当て**

```typescript
async function assignToDefaultOrg(orgId: string) {
  const membersSnapshot = await db.collection('project_members')
    .where('orgId', '==', 'external')
    .get();

  const batch = db.batch();

  membersSnapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      orgId: orgId,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  });

  await batch.commit();
  console.log(`✓ Updated ${membersSnapshot.size} members to orgId=${orgId}`);
}

// デフォルト組織に割り当て
await assignToDefaultOrg('archi-prisma');
```

#### 2-4. 修正結果を確認

```bash
# 再度レポートを生成して確認
npx ts-node src/scripts/report-external-members.ts
```

**期待される結果**:
```
✅ No members with orgId='external' found!
```

---

### Phase 3: 本番移行実行

#### 3-1. メンテナンスウィンドウの設定

**推奨時間**: 深夜または週末（ユーザーアクセスが少ない時間帯）

**事前通知**:
- ユーザーに事前に通知（メンテナンス時間、影響範囲）
- Slackやメールで告知

#### 3-2. 移行スクリプト実行

```bash
cd functions
npx ts-node src/scripts/migrate-data.ts --execute
```

**⚠️ 安全機能**: `orgId='external'`が残っている場合、スクリプトは自動的にエラーで停止します。すべてのexternalメンバーを解決してから再実行してください。

**実行中の出力例（成功時）**:
```
============================================================
Data Migration Script
============================================================
Mode: EXECUTE
============================================================

=== Phase 1: Migrating users collection ===
  User user123: removing memberType='member'
  ✓ Updated user user123
  ✓ Updated user user456
  ...
Processed 150 users, 120 need updates

=== Phase 2: Migrating project_members collection ===
  ✓ Updated member pm001
  ✓ Updated member pm002
  ...
Processed 300 members, 80 need updates

=== Phase 3: Cleanup old fields (optional) ===
⚠️  This will permanently delete old Japanese field names
Do you want to delete old fields? (yes/no): no
Skipping cleanup phase

=== Migration Report ===
Users processed: 150
Users updated: 120
Project members processed: 300
Project members updated: 80
Members with orgId='external': 0

✅ No errors

✅ Migration completed successfully
```

**実行中の出力例（externalメンバーが残っている場合）**:
```
============================================================
Data Migration Script
============================================================
Mode: EXECUTE
============================================================

=== Phase 1: Migrating users collection ===
Processed 150 users, 120 need updates

=== Phase 2: Migrating project_members collection ===
  ⚠️  Member pm123 has orgId='external'
     Email: external@example.com, Display: 外部太郎
     → Manual intervention required: assign real orgId
Processed 300 members, 80 need updates

⚠️  IMPORTANT: Manual action required!
Found 5 project members with orgId='external'
These need to be manually assigned to real organization IDs.

❌ MIGRATION BLOCKED: Cannot proceed with --execute while orgId='external' members exist
Please run the following to generate a detailed report:
  npx ts-node src/scripts/report-external-members.ts

Then manually resolve all external members before running migration again.
```

この場合、Phase 2（orgId='external'の解決）に戻って、すべてのexternalメンバーを修正してから再実行してください。

#### 3-3. クリーンアップ（オプション）

**⚠️ 注意**: この手順は不可逆的です。実行前に必ず確認してください。

古いフィールド（職種、部署、電話番号）を完全に削除する場合:

```bash
# 再度実行し、クリーンアップを選択
npx ts-node src/scripts/migrate-data.ts --execute

# プロンプトが表示されたら "yes" と入力
Do you want to delete old fields? (yes/no): yes
```

**推奨**: クリーンアップは移行後1週間程度安定稼働を確認してから実行

---

### Phase 4: 検証とデプロイ

#### 4-1. Firestore データを確認

**Firebase Console で確認**:
1. Firestore Database を開く
2. `users/{userId}` ドキュメントを開く
3. 以下を確認:
   - ✅ `jobTitle`, `department`, `phoneNumber` フィールドが存在
   - ✅ `memberType` フィールドが削除されている
   - ✅ 古いフィールド（職種、部署、電話番号）が存在（クリーンアップ前）

#### 4-2. Functions をデプロイ

```bash
cd functions
npm run deploy
```

または、特定の関数のみ:
```bash
firebase deploy --only functions:api
```

#### 4-3. フロントエンドをデプロイ

```bash
cd web
npm run build
firebase deploy --only hosting
```

#### 4-4. 動作確認

**1. ユーザー管理画面**
- [ ] メンバー一覧が正しく表示される
- [ ] 職種、部署が正しく表示される（英語フィールド名から）
- [ ] memberTypeの選択UIが表示されない

**2. プロジェクトメンバー管理**
- [ ] プロジェクトメンバー一覧が正しく表示される
- [ ] 職種が正しく表示される
- [ ] メンバー追加時にemailが必須になっている

**3. 新規招待**
- [ ] 組織メンバー招待が正常に動作する
- [ ] memberTypeの選択UIが表示されない
- [ ] メンバー数のカウントが正しい（ゲスト数が表示されない）

**4. 既存データ**
- [ ] 既存ユーザーのデータが正しく表示される
- [ ] 既存プロジェクトメンバーが正しく表示される
- [ ] 編集・削除が正常に動作する

**5. API エンドポイント**
```bash
# ユーザー取得
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/users/me

# プロジェクトメンバー一覧
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/projects/P-0001/members

# 組織招待作成
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","role":"viewer"}' \
  https://your-domain.com/api/org-invitations
```

#### 4-5. ログを確認

```bash
# Cloud Functions のログ
firebase functions:log

# エラーログのみ
firebase functions:log --only error

# 特定の関数のログ
firebase functions:log --only api
```

---

## ✅ 移行成功の判定基準

移行が完了したかどうかは、以下の**4つの成功条件**をすべて満たしているかで判断してください：

### 1. Firestore上に`orgId='external'`が0件である

**確認方法**:
```bash
# レポートスクリプトで確認
cd functions
npx ts-node src/scripts/report-external-members.ts
```

**期待される結果**:
```
✅ No members with orgId='external' found!
```

または、Firebase Consoleで直接確認:
1. Firestore Database を開く
2. `project_members` コレクションを開く
3. フィルタ: `orgId == 'external'` で検索
4. 結果が0件であること

### 2. `users`コレクションに`memberType`フィールドが0件である

**確認方法**:
```typescript
// verify-migration.ts (新規作成して実行)
import * as admin from 'firebase-admin';
admin.initializeApp();
const db = admin.firestore();

async function verifyNoMemberType() {
  const usersSnapshot = await db.collection('users').get();

  let foundMemberType = 0;
  usersSnapshot.docs.forEach(doc => {
    if (doc.data().memberType !== undefined) {
      foundMemberType++;
      console.log(`❌ User ${doc.id} still has memberType: ${doc.data().memberType}`);
    }
  });

  if (foundMemberType === 0) {
    console.log(`✅ All ${usersSnapshot.size} users have no memberType field`);
  } else {
    console.log(`❌ Found ${foundMemberType} users with memberType field`);
  }
}

verifyNoMemberType();
```

または、Firebase Consoleでランダムに数件のユーザードキュメントを開いて、`memberType`フィールドが存在しないことを確認。

### 3. 新UIから「ゲスト」を作成できない

**確認方法**:
1. ブラウザで本番環境を開く（Ctrl+Shift+R でキャッシュクリア）
2. ユーザー管理画面を開く
3. 「メンバーを招待」ボタンをクリック
4. 招待モーダルを確認

**期待される結果**:
- ✅ "メンバー/ゲスト" のトグルボタンが表示されない
- ✅ "ゲスト数" のカウント表示がない
- ✅ メールアドレス入力欄が必須になっている

### 4. Seatカウントロジックが期待どおりに動いている

**確認方法（テスト組織で実施）**:
```bash
# APIエンドポイントで確認
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/org-invitations/stats
```

**期待される結果**:
```json
{
  "members": {
    "current": 8,
    "max": 30,
    "available": 22
  }
  // ❌ "guests" オブジェクトが存在しない
}
```

または、管理画面で確認:
1. 組織設定 → サブスクリプション画面を開く
2. メンバー数カウントが正しく表示されている
3. ゲスト数カウントが表示されていない
4. `isActive=false` のユーザーがカウントに含まれていない

---

## 📝 成功条件クイックチェック

すべてにチェックが入れば移行完了です：

- [ ] **条件1**: `orgId='external'` が0件（report-external-members.ts で確認）
- [ ] **条件2**: `memberType` フィールドが0件（verify-migration.ts で確認）
- [ ] **条件3**: 新UIからゲスト作成不可（ブラウザで確認）
- [ ] **条件4**: Seatカウントが正しい（API/管理画面で確認）
- [ ] **追加確認**: 本番環境で1時間以上エラーログなし

### 自動検証コマンド

条件1と条件2を自動でチェック：

```bash
cd functions
npx ts-node src/scripts/verify-migration.ts
```

**出力例（成功時）**:
```
=== 条件1: orgId='external' のチェック ===
✅ PASS: orgId='external' のメンバーは0件です

=== 条件2: memberType フィールドのチェック ===
✅ PASS: 全 150 ユーザーに memberType フィールドはありません

=== 追加検証: フィールド名の移行状況 ===
サンプル 10 ユーザー中:
  新フィールド (jobTitle/department/phoneNumber): 15 件
  旧フィールド (職種/部署/電話番号): 15 件
  ℹ️  旧フィールドが残っています（クリーンアップ未実行の場合は正常）

============================================================
移行検証レポート
============================================================

【検証結果サマリー】
条件1: orgId='external' = 0 件 ✅
条件2: memberType フィールド = 0 件 ✅

【データ統計】
総ユーザー数: 150
総プロジェクトメンバー数: 300

============================================================
🎉 すべての検証に合格しました！
移行は正常に完了しています。
============================================================
```

---

## 🔄 ロールバック手順

万が一問題が発生した場合の対処方法:

### 方法1: Firestoreバックアップから復元（最も安全）

```bash
# バックアップから復元
gcloud firestore import gs://compass-backup/backup-YYYYMMDD-HHMMSS

# 復元完了まで待機（大量データの場合、数時間かかる可能性）
```

**注意**: 復元後、移行後に追加されたデータは失われます。

### 方法2: フィールドを復元（部分的ロールバック）

```typescript
// 緊急時の復元スクリプト
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function rollbackUsers() {
  const usersSnapshot = await db.collection('users').get();

  const batch = db.batch();
  let count = 0;

  for (const userDoc of usersSnapshot.docs) {
    const data = userDoc.data();
    const updates: any = {};

    // 英語フィールドから日本語フィールドに戻す
    if (data.jobTitle) {
      updates['職種'] = data.jobTitle;
    }
    if (data.department) {
      updates['部署'] = data.department;
    }
    if (data.phoneNumber) {
      updates['電話番号'] = data.phoneNumber;
    }

    if (Object.keys(updates).length > 0) {
      batch.update(userDoc.ref, updates);
      count++;
    }

    // Firestoreのバッチ制限（500）を考慮
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log(`✓ Rolled back ${usersSnapshot.size} users`);
}

rollbackUsers();
```

### 方法3: コードをロールバック

```bash
# Git で以前のコミットに戻る
git log --oneline
git checkout <commit-hash>

# または、特定のブランチに戻る
git checkout main
git reset --hard <commit-hash>

# 以前のバージョンをデプロイ
cd functions
npm run build
npm run deploy

cd ../web
npm run build
firebase deploy --only hosting
```

---

## ✅ チェックリスト

### 移行前

- [ ] バックアップを取得済み
- [ ] PR #1, #2, #3 がマージ済み
- [ ] TypeScript のビルドが成功
- [ ] Firebase 認証が有効
- [ ] 本番プロジェクトを選択済み
- [ ] Dry-run を実行して問題なし
- [ ] orgId='external' メンバーを全て解決済み
- [ ] メンテナンスウィンドウを設定済み
- [ ] ユーザーに事前通知済み

### 移行中

- [ ] 移行スクリプトがエラーなく完了
- [ ] すべてのユーザーが処理された
- [ ] すべてのproject_membersが処理された
- [ ] orgId='external' が0件になった
- [ ] エラーログがない

### 移行後

- [ ] Firestore Console でデータを確認済み
- [ ] Functions をデプロイ済み
- [ ] フロントエンドをデプロイ済み
- [ ] ユーザー管理画面が正常表示
- [ ] プロジェクトメンバー管理が正常動作
- [ ] 新規招待が正常動作
- [ ] API エンドポイントが正常動作
- [ ] エラーログを確認（Cloud Functions）
- [ ] 本番環境で最低1時間監視
- [ ] ユーザーに完了通知

### クリーンアップ後（オプション）

- [ ] 本番環境で1週間以上安定稼働
- [ ] ユーザーからの問題報告なし
- [ ] クリーンアップスクリプト実行済み
- [ ] 古いフィールドが完全削除された
- [ ] 後方互換性コードを削除（migration-utils.ts など）

---

## 📊 影響を受ける機能

### ✅ 正常に動作するようになる機能

1. **ユーザー管理**
   - memberType選択UIが削除され、シンプルに
   - 英語フィールド名で検索可能

2. **プロジェクトメンバー管理**
   - email必須化により、ログインユーザーのみ追加可能
   - displayNameのみの「ゲスト」が追加できなくなる

3. **請求管理**
   - メンバー数のみのシンプルなカウント
   - ゲスト数の混乱がなくなる

### ⚠️ 注意が必要な機能

1. **既存の「ゲスト」ユーザー**
   - memberTypeは削除されるが、isActiveフラグで管理継続
   - 機能的には変わらない

2. **orgId='external' メンバー**
   - 移行前に手動で解決が必要
   - 解決しないとプロジェクトメンバーとして正常動作しない

3. **レポート・集計機能**
   - フィールド名が変更されるため、直接Firestoreをクエリしている箇所は修正が必要

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

# または、Application Default Credentials
gcloud auth application-default login
```

### 問題2: orgId='external' が残っている

**エラー**:
```
⚠️  Found 5 members with orgId='external' - manual review required
```

**解決策**:
1. `report-external-members.ts` を実行してCSVを生成
2. CSVを確認し、各メンバーの実在orgIdを特定
3. 手動でFirestoreを更新
4. 再度 Dry-run を実行して確認

### 問題3: バッチ更新が失敗する

**エラー**:
```
Error: Batch size exceeds limit (500)
```

**原因**: Firestoreのバッチサイズ制限

**解決策**:
スクリプトはバッチサイズを考慮していますが、念のため確認:
```typescript
// migrate-data.ts 内で確認
const BATCH_SIZE = 500;  // これ以下であること
```

### 問題4: 移行後もフィールド名が古いまま

**原因**:
- Functions がデプロイされていない
- ブラウザキャッシュ

**解決策**:
```bash
# Functions を再デプロイ
cd functions
npm run deploy

# ブラウザのキャッシュをクリア
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)

# または、シークレットモードで確認
```

### 問題5: 移行スクリプトが途中で止まる

**エラー**:
```
Error: DEADLINE_EXCEEDED
```

**原因**: タイムアウト（大量データ）

**解決策**:
```typescript
// スクリプトを分割実行
// migrate-data.ts を修正して、組織ごとに実行
async function migrateUsersForOrg(orgId: string, dryRun: boolean) {
  const usersSnapshot = await db.collection('users')
    .where('orgId', '==', orgId)
    .get();

  // ... 移行処理
}

// 組織ごとに実行
await migrateUsersForOrg('archi-prisma', false);
await migrateUsersForOrg('demo', false);
```

---

## 📞 サポート

問題が解決しない場合:

### 1. ログを確認

```bash
# Cloud Functions のログ
firebase functions:log --limit 100

# Firestore のログ
gcloud logging read "resource.type=datastore_database" --limit 50

# アプリケーションログ
firebase hosting:channel:list
```

### 2. 検証スクリプトを実行

```typescript
// verify-migration.ts を作成
async function verifyMigration() {
  const users = await db.collection('users').limit(10).get();

  users.docs.forEach(doc => {
    const data = doc.data();
    console.log('User:', doc.id);
    console.log('  Has jobTitle:', !!data.jobTitle);
    console.log('  Has department:', !!data.department);
    console.log('  Has phoneNumber:', !!data.phoneNumber);
    console.log('  Has memberType:', !!data.memberType);  // Should be false
    console.log('  Has 職種:', !!data['職種']);  // Should depend on cleanup
  });
}
```

### 3. 緊急連絡先

- **Slack Channel**: #compass-migration
- **Email**: dev@archi-prisma.co.jp
- **GitHub Issues**: https://github.com/your-org/compass/issues

---

## 📚 関連ドキュメント

- [PR_STRATEGY.md](./PR_STRATEGY.md) - 5段階PR戦略
- [COMPASS_PROJECT_DOCUMENTATION.md](./COMPASS_PROJECT_DOCUMENTATION.md) - プロジェクト全体のドキュメント
- [20251203指示.txt](./20251203指示.txt) - 原始要件定義
- `functions/src/scripts/migrate-data.ts` - 移行スクリプト本体
- `functions/src/scripts/report-external-members.ts` - external メンバーレポート

---

## 📅 移行タイムライン（推奨）

| Week | Phase | 作業内容 | 所要時間 |
|------|-------|---------|---------|
| Week 5 | Phase 1 | Dry-run実行、レポート確認 | 2-4時間 |
| Week 5-6 | Phase 2 | orgId='external' 手動解決 | 環境による |
| Week 6 | Phase 3 | 本番移行実行 | 30分-2時間 |
| Week 6 | Phase 4 | 検証・デプロイ | 2-4時間 |
| Week 7-8 | - | 本番環境監視 | - |
| Week 8 | Phase 5 | クリーンアップ（オプション）| 1-2時間 |

**Total**: 約2-3週間（手動対応時間を除く）

---

**作成日**: 2025-12-03
**最終更新**: 2025-12-03
**作成者**: Claude Code
**バージョン**: 1.0
