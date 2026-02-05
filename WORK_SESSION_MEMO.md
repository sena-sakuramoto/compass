# 作業セッションメモ - 2025-12-04

## 追記（2026-01-26）

### 2025-12-04以降の主要実装（コミット）

#### 課金・認証基盤（計5件）
- 2026-01-05 b4d3f55: 認証・課金管理・メンバー管理機能の追加
- 2026-01-21 9a6dc08: デモログイン不要化 & Firebaseコスト最適化
- 2026-01-21 09b9025: デモモード用Google認証 & リード獲得機能追加
- 2026-01-22 142c20c: 請求・メンバー管理機能強化 & UI改善
- 2026-01-24 1324096: トライアル終了時の閲覧のみモード & 自動展開修正
- 2026-01-26 fc62461: checkout.tsデプロイ完了（/api/public/checkout, /api/public/checkout/plans）

#### プロジェクト・タスク機能
- 2025-12-10 dade413: Collaborator編集・外部メール招待対応
- 2025-12-10 5825a3d: プロジェクト招待通知
- 2026-01-14 e4f78b7: クロスオーガナイゼーション対応（タスク作成API）
- 2026-01-15 d8ce01d: マイルストーンベースの自動ステータス計算
- 2026-01-16 4344d17: プロジェクト種別機能 & フィルター折畳/展開
- 2026-01-17 c5d8ba8: マイルストーン・タスクの工程ドラッグ機能
- 2026-01-25 19dea1d: 打合せ機能追加 & 工程の即時反映改善

#### UX改善
- 2026-01-14 97ff272: IndexedDBキャッシュをProject Membersに適用
- 2026-01-17 bf32b58: ログインユーザーのプロジェクトに初期フォーカス & 他人タスク薄表示
- 2026-01-18 dec06ac: 自分参加PJのみフィルター追加 & リマインダーをログインユーザーに限定
- 2026-01-18 4fa500f: 進捗スライダー追加 & UI改善
- 2026-01-19 3925218: 期限3日前から黄色警告表示 & 失注ステータスをグレーに変更

### 当時の保留事項の更新
- タスク可視性の問題: 2026-01-14 にタスク作成APIのクロスオーガナイゼーション修正（e4f78b7）。表示/一覧側は要確認。
- クロスオーガナイゼーション招待UI: 外部メール招待サポート追加（2025-12-10 dade413）。画面仕様の最終確認は未実施。
- Collaborator機能: 編集・メール招待まで実装（2025-12-10 dade413）。タスク割り当ては未確認。

## 📊 本日の作業サマリー

### ✅ 完了した作業

#### 1. memberType削除とフィールド名英語化の移行（完了）
- ✅ バックエンド（functions/src/）: 8ファイル修正
- ✅ フロントエンド（web/src/）: 8ファイル修正
- ✅ データ移行実行: 5ユーザー、45プロジェクトメンバー
- ✅ 検証完了: すべてのチェック合格
- ✅ デプロイ完了: Functions + Hosting

**移行結果**:
```
条件1: orgId='external' = 0 件 ✅
条件2: memberType フィールド = 0 件 ✅
総ユーザー数: 5
総プロジェクトメンバー数: 45
```

#### 2. マルチ組織バグの発見と修正

**発見した問題**:
1. ❌ 別組織なのに他組織のメンバーが見える
2. ❌ メンバー数カウントが常に0になる（制限チェックが機能しない）
3. ❌ プロジェクトメンバー招待候補に全組織のユーザーが表示される
4. ❌ super_adminが全プロジェクトに表示される
5. ❌ isActive=falseのユーザーでもログイン可能

**修正したファイル**:
- ✅ `functions/src/lib/member-limits.ts` (line 15-19)
- ✅ `functions/src/api/users-api.ts` (line 90-94)
- ✅ `functions/src/api/project-members-api.ts` (line 117-120)
- ✅ `functions/src/lib/auth.ts` (line 156-160)

#### 3. 作成したスクリプト

- ✅ `functions/src/scripts/verify-migration.ts` - 移行検証
- ✅ `functions/src/scripts/report-external-members.ts` - external メンバーレポート
- ✅ `functions/src/scripts/migrate-data.ts` - データ移行
- ✅ `functions/src/scripts/check-member-count.ts` - メンバー数確認
- ✅ `functions/src/scripts/check-collaborators.ts` - Collaborator確認
- ✅ `functions/src/scripts/check-super-admin-memberships.ts` - super_admin参加状況
- ✅ `functions/src/scripts/delete-external-members.ts` - external メンバー削除
- ✅ `functions/src/scripts/fix-external-members.ts` - external メンバー修正

#### 4. 作成したドキュメント

- ✅ `MIGRATION_GUIDE.md` (791行) - 完全な移行ガイド
- ✅ `PR_STRATEGY.md` (295行) - 5段階PR戦略
- ✅ `WORK_SESSION_MEMO.md` (このファイル)

---

## 🐛 修正した具体的なバグ

### バグ1: メンバー数カウントの誤り

**問題**:
```typescript
// member-limits.ts (修正前)
const usersSnapshot = await db
  .collection('orgs')
  .doc(orgId)
  .collection('users')  // ← 存在しないサブコレクション
  .get();
```

**修正**:
```typescript
// member-limits.ts (修正後)
const usersSnapshot = await db
  .collection('users')  // ← トップレベルコレクション
  .where('orgId', '==', orgId)
  .get();
```

**影響**: メンバー数が常に0→制限チェックが機能しない→制限超えて招待できてしまう

---

### バグ2: ユーザー一覧で全組織のユーザーが返される

**問題**:
```typescript
// users-api.ts (修正前)
const { orgId, role, isActive } = req.query;
const users = await listUsers({
  orgId,  // ← クエリパラメータで指定しないと undefined
  role,
  isActive
});
```

**修正**:
```typescript
// users-api.ts (修正後)
// orgIdは必須：ログインユーザーの組織のみ取得
const targetOrgId = req.query.orgId && req.user.role === 'super_admin'
  ? req.query.orgId
  : req.user.orgId;

const users = await listUsers({
  orgId: targetOrgId,  // ← 必ずorgIdを指定
  role,
  isActive
});
```

**影響**: 別組織のメンバーが見える

---

### バグ3: プロジェクトメンバー招待候補に全ユーザー表示

**問題**:
```typescript
// project-members-api.ts (修正前)
listUsers({ isActive: true })  // ← orgIdフィルタなし
```

**修正**:
```typescript
// project-members-api.ts (修正後)
listUsers({
  orgId: req.user.orgId,  // ← 自組織のみ
  isActive: true
})
```

**影響**: 別組織のユーザーがプロジェクトメンバー候補に表示される

---

### バグ4: isActive=falseでもログイン可能

**問題**:
```typescript
// auth.ts (修正前)
const userDoc = await db.collection('users').doc(uid).get();
if (userDoc.exists) {
  return userDoc.data();  // ← isActiveチェックなし
}
```

**修正**:
```typescript
// auth.ts (修正後)
const userDoc = await db.collection('users').doc(uid).get();
if (userDoc.exists) {
  const userData = userDoc.data();

  // isActiveチェック
  if (userData && userData.isActive === false) {
    console.warn('[Auth] User is inactive:', email);
    throw new Error('User account is inactive. Please contact your administrator.');
  }

  return userData;
}
```

**影響**: 課金停止したユーザーでもアクセス可能

---

## ⏸️ 未完了・保留事項

### 1. 本日の修正をデプロイしていない

以下のファイルを修正したが、まだデプロイしていません：

```bash
# 修正済みだがデプロイ待ち
- functions/src/lib/member-limits.ts
- functions/src/api/users-api.ts
- functions/src/api/project-members-api.ts
- functions/src/lib/auth.ts
- functions/src/scripts/check-member-count.ts
```

**次回の作業**: 再デプロイが必要

```bash
cd D:\senaa_dev\compass\functions
npm run build
npm run deploy
```

---

### 2. タスクが見えない問題（未調査）

**ユーザーからの報告**:
> 「別組織でPJ作ってメンバー追加して、タスク割り当てしてもそのメンバーのcompassでは見れないです」

**考えられる原因**:
1. タスク一覧取得APIがorgIdでフィルタリングしている
2. クロスオーガナイゼーションのタスクアクセス権が考慮されていない
3. プロジェクトメンバーシップとタスク可視性の紐付けが不完全

**次回の作業**:
- タスク一覧取得ロジックを確認
- プロジェクトメンバーがタスクを見れる条件を確認
- 必要に応じて修正

---

### 3. クロスオーガナイゼーションの招待フロー

**当時の現状（2025-12-04時点）**:
- バックエンド: メールアドレスで他組織のユーザーを招待可能 ✅
- フロントエンド: 自組織のユーザーのみドロップダウンに表示 ⚠️

**ユーザーの質問**:
> 「別組織の人をPJに追加したいときどうするんやっけ」

**回答**:
- メールアドレスを教えてもらって手動入力で招待
- バックエンドは対応済み、フロントエンドにメール入力欄が必要（未実装）

**選択肢**:
1. メール入力欄を追加（推奨）
2. ドロップダウンを全ユーザーに戻す（セキュリティ的に非推奨）

**次回の作業**: フロントエンドにメール入力欄を追加するか検討（※現在の状況は冒頭の追記参照）

---

### 4. Collaborator機能の実装状況

**当時の現状（2025-12-04時点）**:
- データ構造: `/orgs/{orgId}/collaborators/` に3名存在 ✅
- バックエンドAPI: 未実装（CRUD操作なし）
- フロントエンドUI: 未実装
- タスク割り当て: 未実装

**次回の作業**:
- Collaborator CRUD APIの実装
- フロントエンドでCollaborator管理画面の実装
- タスク割り当てでCollaboratorを選択可能にする

---

### 5. 1週間後のクリーンアップ

**保留中の作業**:
```bash
# 古いフィールド（職種、部署、電話番号）を完全削除
npx ts-node src/scripts/migrate-data.ts --execute
# プロンプトで "yes" を入力
```

**実行タイミング**: 本番環境で1週間以上安定稼働を確認してから

---

## 📁 ファイル変更サマリー

### 修正したファイル（本日）

```
functions/src/
├── lib/
│   ├── member-limits.ts       ✏️ 修正（ユーザー取得場所）
│   ├── auth.ts                ✏️ 修正（isActiveチェック追加）
├── api/
│   ├── users-api.ts           ✏️ 修正（orgIdフィルタ必須化）
│   ├── project-members-api.ts ✏️ 修正（招待候補をorgIdフィルタ）
├── scripts/
│   ├── check-member-count.ts            ✏️ 修正（パス修正）
│   ├── verify-migration.ts              ✨ 新規作成
│   ├── report-external-members.ts       ✨ 新規作成
│   ├── migrate-data.ts                  ✨ 新規作成
│   ├── check-collaborators.ts           ✨ 新規作成
│   ├── check-super-admin-memberships.ts ✨ 新規作成
│   ├── delete-external-members.ts       ✨ 新規作成
│   └── fix-external-members.ts          ✨ 新規作成

ドキュメント/
├── MIGRATION_GUIDE.md       ✨ 新規作成（791行）
├── PR_STRATEGY.md           ✨ 新規作成（295行）
└── WORK_SESSION_MEMO.md     ✨ 新規作成（このファイル）
```

---

## 🎯 次回の作業ステップ

### ステップ1: デプロイ（必須）

```bash
cd D:\senaa_dev\compass\functions
npm run build
npm run deploy
```

### ステップ2: 動作確認

1. **別組織を作成してテスト**:
   - ✅ ユーザー管理: 自組織のメンバーのみ表示される
   - ✅ メンバー招待: 自組織のメンバーのみ候補に出る
   - ✅ メンバー数カウント: 正しい数字が表示される
   - ✅ 制限チェック: 上限に達したら招待がブロックされる

2. **isActiveチェック**:
   - ユーザーをisActive=falseに設定
   - ログインを試みる
   - エラーメッセージが表示されることを確認

### ステップ3: タスク可視性の問題を調査

```bash
# タスク取得ロジックを確認
grep -r "listTasks" functions/src/
```

- プロジェクトメンバーがタスクを見れる条件を確認
- 必要に応じて修正

### ステップ4: クロスオーガナイゼーション招待UIの検討

- メール入力欄を追加するか
- ドロップダウンを全ユーザーに戻すか
- ユーザーと相談して決定

### ステップ5: 変更をコミット

```bash
git add .
git commit -m "fix: Multi-tenancy bugs and isActive enforcement

## Issues Fixed
1. Member count always returns 0 (wrong collection path)
2. Users list shows all orgs (missing orgId filter)
3. Project member candidates show all orgs (missing orgId filter)
4. Inactive users can still login (no isActive check)

## Changes
- member-limits.ts: Fixed user collection path
- users-api.ts: Enforce orgId filtering
- project-members-api.ts: Filter candidates by orgId
- auth.ts: Add isActive check during authentication

## Scripts Created
- verify-migration.ts: Verify migration success
- check-member-count.ts: Diagnostic for member counting
- check-collaborators.ts: Check collaborator structure

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin main
```

---

## 📊 現在の状態

### データベース
```
Users: 5
  - archi-prisma: 6人（うち1人がsuper_admin）
  - 他組織: 数人

Project Members: 45
  - orgId='external': 0件 ✅
  - memberTypeフィールド: 0件 ✅

Collaborators: 3
  - archi-prisma組織に3名
```

### コード
```
Backend: ビルド成功 ✅
Frontend: ビルド成功 ✅
Functions: デプロイ済み（古いバージョン）⚠️
Hosting: デプロイ済み ✅
```

### 未デプロイの修正
```
⚠️ 本日の4つのバグ修正がまだデプロイされていません
   次回セッション開始時に必ずデプロイしてください
```

---

## 🔍 重要なポイント

### マルチテナンシーの原則

1. **ユーザーは1つの組織に所属**
   - `user.orgId` で管理
   - 課金はこの組織で発生

2. **プロジェクトは1つの組織が所有**
   - `project.ownerOrgId` で管理
   - 他組織のメンバーも参加可能

3. **プロジェクトメンバーは自分のorgIdを保持**
   - `projectMember.orgId` = ユーザーの所属組織
   - プロジェクトの所有組織ではない

4. **課金は所属組織で発生**
   - 組織Aのユーザーが組織Bのプロジェクトに参加
   - 課金は組織Aで発生
   - 組織Bは課金されない

### セキュリティ原則

1. **orgIdフィルタリングは必須**
   - すべてのリスト取得APIでorgIdを明示的に指定
   - デフォルトで自組織のみ表示

2. **isActiveチェックは認証時に実施**
   - 非アクティブユーザーはログイン不可
   - すべてのプロジェクトにアクセス不可

3. **super_adminの特権**
   - 全組織のデータを参照可能（管理目的）
   - ただし、自動的に全プロジェクトのメンバーにはならない

---

## 📞 連絡事項

### 確認が必要な事項

1. **タスク可視性の問題**: 次回セッションで調査予定
2. **クロスオーガナイゼーション招待**: UI実装方針を決定必要
3. **Collaborator機能**: いつ実装するか検討

### 次回までの宿題

なし（デプロイのみ実行してください）

---

**作成日**: 2025-12-04
**次回セッション**: デプロイから開始
**所要時間**: デプロイ5分 + 動作確認15分 = 計20分

---

## 🎉 本日の成果

- ✅ 大規模リファクタリング完了（memberType削除、フィールド名英語化）
- ✅ データ移行成功（5ユーザー、45プロジェクトメンバー）
- ✅ 4つの重大なマルチテナンシーバグを発見・修正
- ✅ 8つの診断スクリプト作成
- ✅ 包括的なドキュメント作成（1000行以上）

お疲れ様でした！🚀

---

## 🧹 2026-02-05 変更整理メモ

- 依存関係更新（web/package.json + web/package-lock.json）は差分が大きいため、機能変更と分離して単独コミットにする。
- 課金/組織セットアップ周り（billing/org-setup/stripe）は関連が強く差分が大きいので、バックエンドの独立コミットに分割。
- プロジェクトメンバー/権限/協力会社関連は密結合なので、まとめて機能単位のバックエンドコミットに分割。
- 管理系API（admin/impersonation）と projects/tasks/firestore は運用系の小規模変更が多いので、misc admin系として1コミットに集約。
- フロントの課金/セットアップ導線（BillingGate/Trial/DemoLogin/SetupPage）は同じユーザーフローなので1コミットに集約。
- フロント全体のUI/ガント/モーダル/フック/各種libは相互依存が多く差分も広範囲なので、1つのフロントコアコミットに集約。
- ドキュメント類（docs + TODO + session memo）は内容整理の一環として独立コミットに分割。
- ローカル/ツール系ファイルと単体テキスト（.claude設定/メモ/バッチなど）は最後にmiscとしてまとめてコミット。
