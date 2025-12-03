# Compass システム概要・権限・課金まとめ

**作成日:** 2025-12-02
**システム:** Compass（建築プロジェクト管理システム）

---

## 📊 課金プラン体系

### プラン別料金・上限

| プラン | 月額料金 | メンバー上限 | ゲスト上限 | 用途 |
|--------|---------|------------|-----------|------|
| **Starter** | ¥5,000 | 5人 | 10人 | 小規模組織向け |
| **Business** | ¥30,000 | 30人 | 100人 | 中規模組織向け |
| **Enterprise** | カスタム | 実質無制限 | 実質無制限 | 大規模組織向け |

**実装場所:** `functions/src/lib/auth-types.ts:12-28`

### 課金単位
- **組織（Organization）ごとに課金**
- 各組織は独立したプラン・上限を持つ
- 組織間でメンバー数はカウントされない

### カスタム上限設定
- 組織ドキュメントに `limits` フィールドを設定可能
- カスタム上限が未設定の場合、プランのデフォルト値を使用

```typescript
// Firestore: orgs/{orgId}
{
  id: "archi-prisma",
  name: "株式会社アーキプリズマ",
  plan: "business",  // starter | business | enterprise
  limits: {          // カスタム上限（オプション）
    maxMembers: 50,
    maxGuests: 200
  }
}
```

---

## 👥 組織構造

### 組織タイプ

```typescript
type OrganizationType = 'prime' | 'subcontractor' | 'partner';
```

| タイプ | 説明 | 例 |
|--------|------|-----|
| **prime** | 元請け会社 | 設計事務所、ゼネコン |
| **subcontractor** | 協力会社 | 設備業者、施工会社 |
| **partner** | パートナー企業 | コンサルティング会社 |

### 組織の独立性
- **完全に独立した別エンティティ**
- 各組織は自分のメンバー・プロジェクト・タスクのみ管理
- super_admin のみ複数組織を横断管理可能

---

## 🔐 グローバルロール（組織内の役割）

### ロール一覧

| ロール | 権限レベル | 主な権限 |
|--------|----------|---------|
| **super_admin** | システム全体 | 全組織を管理、組織作成、全権限 |
| **admin** | 組織全体 | 自組織の全管理、メンバー招待・管理 |
| **project_manager** | プロジェクト管理 | プロジェクト作成・管理、メンバー追加 |
| **sales** | 営業 | プロジェクト作成、営業タスク管理 |
| **designer** | 設計 | 設計タスク管理 |
| **site_manager** | 施工管理 | 施工タスク管理 |
| **worker** | 職人 | 自分のタスクのみ |
| **viewer** | 閲覧者 | 閲覧のみ |

**実装場所:** `functions/src/lib/roles.ts:6-14`

### 役割ごとの主要権限

#### super_admin（スーパー管理者）
```typescript
✅ 全組織を表示・管理
✅ 組織の作成・削除
✅ 別組織へのユーザー招待
✅ 組織の課金プラン・上限設定
✅ すべてのプロジェクト・タスクの閲覧・編集
✅ システム全体の設定
```

#### admin（組織管理者）
```typescript
✅ 自組織のメンバー・ゲスト招待
✅ 自組織のユーザー管理（有効化・無効化）
✅ 自組織の全プロジェクト・タスクの閲覧・編集
✅ プロジェクト作成・削除
❌ 別組織への招待不可
❌ 組織設定の変更不可
```

#### project_manager（プロジェクトマネージャー）
```typescript
✅ プロジェクト作成
✅ 参加プロジェクトのメンバー管理
✅ 参加プロジェクトのタスク管理
✅ メンバー・ゲスト招待
❌ 組織全体のプロジェクト閲覧不可（参加プロジェクトのみ）
❌ プロジェクト削除不可
```

#### その他のロール（sales, designer, site_manager, worker, viewer）
```typescript
✅ 参加プロジェクトのタスク管理（職種に応じて）
❌ メンバー管理不可
❌ プロジェクト削除不可
```

---

## 👔 メンバータイプ（雇用形態）

### member（正式メンバー）

```typescript
memberType: 'member'
```

- **正社員・正規雇用のメンバー**
- システムにログイン可能（要メールアドレス）
- 組織のメンバー上限にカウントされる
- グローバルロールに基づいた権限
- 課金対象

**例:**
- 自社の社員
- 正式な契約社員

### guest（ゲストユーザー）

```typescript
memberType: 'guest'
```

- **外部協力者・臨時メンバー**
- システムにログイン可能（要メールアドレス）
- 組織のゲスト上限にカウントされる
- 制限された権限（カスタマイズ可能）
- 課金対象（ゲスト料金）

**デフォルトのゲスト権限:**
```typescript
{
  viewProject: true,           // ✅ プロジェクト閲覧
  createOwnTasks: true,        // ✅ 自分のタスク作成
  editOwnTasks: true,          // ✅ 自分のタスク編集
  deleteOwnTasks: true,        // ✅ 自分のタスク削除
  assignTasksToOthers: false,  // ❌ 他人へのタスク割当不可
  editOtherTasks: false,       // ❌ 他人のタスク編集不可
  createProjects: false,       // ❌ プロジェクト作成不可
}
```

**例:**
- 協力会社の担当者
- 外部コンサルタント
- 一時的な協力者

### 協力者（Collaborator）- システム登録なし

```typescript
// プロジェクトメンバーとして名前のみ記録
{
  displayName: "山田太郎",
  orgId: "external",
  // email なし - ログイン不可
}
```

- **名前だけのリスト**
- システムにログイン不可
- 組織のメンバー・ゲスト上限にカウントされない
- 課金対象外
- 招待メール送信なし

**例:**
- 職人（システム不要）
- 単発の協力者
- 記録のみ必要な人

---

## 🎯 プロジェクトロール（プロジェクト内の役割）

| ロール | 権限 |
|--------|------|
| **owner** | プロジェクト所有者、全権限 |
| **manager** | プロジェクト管理、メンバー追加、削除不可 |
| **member** | タスク作成・編集、メンバー管理不可 |
| **viewer** | 閲覧のみ |

**実装場所:** `functions/src/lib/roles.ts:16-21`

---

## 🔒 現在の問題点と解決策

### 問題：人員管理ページで全組織が混在

**現象:**
- `/users` ページで archi-prisma と archisoft のユーザーが混ざって表示される
- 組織ごとの分離ができていない

**根本原因:**
```typescript
// functions/src/api/users-api.ts:86-94
router.get('/', authenticate, async (req: any, res) => {
  const { orgId, role, isActive } = req.query;
  const users = await listUsers({ orgId, role, isActive });
  // ↑ orgId がオプショナルで、指定なしの場合は全ユーザーが返る
```

**解決策:**

### 提案1: 自動的に自組織でフィルタリング（推奨）

#### バックエンド修正
```typescript
// functions/src/api/users-api.ts
router.get('/', authenticate, async (req: any, res) => {
  const { orgId, role, isActive } = req.query;

  // super_admin 以外は自分の組織のみ表示
  const targetOrgId = req.user.role === 'super_admin' && orgId
    ? orgId
    : req.user.orgId;

  const users = await listUsers({
    orgId: targetOrgId,  // 必須にする
    role,
    isActive
  });
```

#### フロントエンド
- **一般ユーザー**: `/users` で自組織のみ表示
- **super_admin**: `/admin` で組織選択ドロップダウン追加

### 提案2: /admin ページの拡張

#### 組織選択UI追加
```typescript
// /admin ページ
<select value={selectedOrgId} onChange={...}>
  <option value="archi-prisma">株式会社アーキプリズマ</option>
  <option value="archisoft">株式会社アーキソフト</option>
</select>

// 選択した組織のユーザー・プロジェクト・統計を表示
```

---

## 📂 データ構造

### Firestore Collections

```
orgs/
  {orgId}/
    ├── name: "株式会社アーキプリズマ"
    ├── plan: "business"
    ├── limits: { maxMembers: 30, maxGuests: 100 }
    ├── type: "prime"
    └── users/
        {userId}/
          ├── email: "user@example.com"
          ├── displayName: "山田太郎"
          ├── role: "admin"
          ├── memberType: "member"
          ├── isActive: true
          └── ...

users/
  {userId}/
    ├── email: "user@example.com"
    ├── displayName: "山田太郎"
    ├── orgId: "archi-prisma"  ← 所属組織
    ├── role: "admin"
    ├── memberType: "member"
    └── ...

project_members/
  {projectId}_{userId}/
    ├── projectId: "proj-123"
    ├── userId: "user-456"
    ├── orgId: "archi-prisma" または "external"
    ├── role: "member"
    ├── status: "active"
    └── ...

collaborators/
  {orgId}_{collaboratorId}/
    ├── orgId: "archi-prisma"
    ├── name: "山田太郎"
    ├── company: "〇〇建設"
    └── ...
```

---

## 🚀 実装推奨順序

### 1. 組織分離の修正（最優先）

**理由:** 現在、データが混在して表示されるセキュリティ問題

**作業内容:**
1. `users-api.ts` を修正してデフォルトで自組織のみ取得
2. super_admin 用の組織選択機能を追加
3. テスト・デプロイ

**推定時間:** 1-2時間

### 2. /admin ページの拡張

**理由:** super_admin が複数組織を管理しやすくする

**作業内容:**
1. 組織選択ドロップダウン追加
2. 選択した組織の統計表示（メンバー数/ゲスト数/上限）
3. 組織の課金プラン表示・変更機能

**推定時間:** 2-3時間

### 3. 組織管理機能の追加

**理由:** ビジネス拡大に対応

**作業内容:**
1. 組織の課金プラン変更UI
2. カスタム上限設定UI
3. 組織の利用統計ダッシュボード

**推定時間:** 3-4時間

---

## 📝 まとめ

### 現在の課金・権限の考え方

```
組織
 ├── 課金プラン（Starter/Business/Enterprise）
 ├── メンバー上限（プランによる）
 ├── ゲスト上限（プランによる）
 └── ユーザー
      ├── member（正式メンバー）- 上限にカウント、課金対象
      ├── guest（ゲスト）- 上限にカウント、課金対象
      └── 協力者（名前のみ）- カウント外、課金対象外
```

### 権限の階層

```
super_admin
 └── 全組織を管理
      └── 組織の作成・削除
           └── 課金プラン設定

admin
 └── 自組織のみ管理
      └── メンバー・ゲスト招待
           └── プロジェクト管理

project_manager
 └── 参加プロジェクトのみ管理
      └── メンバー追加
           └── タスク管理

その他
 └── 参加プロジェクトのタスクのみ
```

### ビジネスモデル

- **組織単位で課金**
- **プランで上限が決まる**
- **メンバーとゲストで料金が異なる可能性**
- **協力者（名前のみ）は無料**
- **super_admin は全組織を管理**
- **組織間は完全に独立**

---

## 🔧 技術実装ファイル

| ファイル | 内容 |
|---------|------|
| `functions/src/lib/auth-types.ts` | 組織・ユーザー・権限の型定義、プラン定義 |
| `functions/src/lib/roles.ts` | ロール・権限の定義 |
| `functions/src/lib/member-limits.ts` | メンバー数制限チェック |
| `functions/src/api/users-api.ts` | ユーザー一覧API（要修正） |
| `functions/src/api/org-invitations.ts` | 組織招待API |
| `web/src/components/UserManagement.tsx` | 人員管理UI |
| `web/src/pages/AdminPage.tsx` | 管理者ページ |

---

**次のアクション:**
1. 組織分離の修正を実装
2. super_admin 用の組織選択機能を追加
3. 課金プラン・上限管理UIの実装
