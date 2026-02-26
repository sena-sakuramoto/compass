# Compass プロジェクト完全ドキュメント

## 目次
1. [プロジェクト概要](#プロジェクト概要)
2. [アーキテクチャ](#アーキテクチャ)
3. [権限システム](#権限システム)
4. [データモデル](#データモデル)
5. [APIエンドポイント](#apiエンドポイント)
6. [主要機能](#主要機能)
7. [ファイル構造](#ファイル構造)
8. [開発ワークフロー](#開発ワークフロー)

---

## プロジェクト概要

**Compass**は、建設・設計業界向けのプロジェクト管理システムです。

### 主な機能
- プロジェクト管理（複数物件の進捗管理）
- タスク管理（ガントチャート、カンバンボード）
- 人員管理（社内メンバー、協力会社、クライアント）
- 権限管理（ロールベース、プロジェクトメンバー）
- スケジュール管理
- アクティビティログ

### 技術スタック
- **バックエンド**: Firebase Functions (Node.js + TypeScript)
- **フロントエンド**: React + TypeScript + Vite
- **データベース**: Cloud Firestore
- **認証**: Firebase Authentication
- **ホスティング**: Firebase Hosting

---

## アーキテクチャ

### システム構成図

```
┌─────────────────────────────────────────────────────┐
│                  ユーザー（ブラウザ）                    │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS
                     ↓
┌─────────────────────────────────────────────────────┐
│         Firebase Hosting (React SPA)                 │
│  ・App.tsx (ルーティング)                              │
│  ・Components (UI)                                   │
│  ・API Client (lib/api.ts)                          │
└────────────────────┬────────────────────────────────┘
                     │ REST API
                     ↓
┌─────────────────────────────────────────────────────┐
│       Firebase Functions (API Server)                │
│  ・Express.js ルーター                                │
│  ・認証ミドルウェア                                      │
│  ・アクセス制御                                         │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│              Cloud Firestore (DB)                    │
│  Collections:                                        │
│  ・orgs/{orgId}/projects                            │
│  ・orgs/{orgId}/tasks                               │
│  ・orgs/{orgId}/projectMembers                      │
│  ・orgs/{orgId}/clients                             │
│  ・orgs/{orgId}/collaborators                       │
│  ・users                                            │
└─────────────────────────────────────────────────────┘
```

### データフロー

1. **ユーザーログイン**
   ```
   User → Firebase Auth → IDトークン取得 → localStorage保存
   ```

2. **API呼び出し**
   ```
   Component → api.ts → IDトークン付与 → Functions API
                                         ↓
                                    認証ミドルウェア
                                         ↓
                                    アクセス制御
                                         ↓
                                    Firestore操作
                                         ↓
                                    レスポンス返却
   ```

3. **権限チェック**
   ```
   リクエスト → 認証 → ユーザー取得 → グローバルロール確認
                                    ↓
                              プロジェクトロール確認
                                    ↓
                              権限に応じた処理
   ```

---

## 権限システム

### グローバルロール（Role）

システム全体に適用される権限レベル:

| ロール | 説明 | 主な権限 |
|--------|------|---------|
| `super_admin` | スーパー管理者 | システム全体の完全な権限 |
| `admin` | 組織管理者 | 組織全体の管理、メンバー管理 |
| `project_manager` | PMプロジェクトマネージャー | プロジェクト管理、メンバー追加 |
| `sales` | 営業 | 営業関連のプロジェクト管理 |
| `designer` | 設計 | 設計関連のタスク管理 |
| `site_manager` | 施工管理 | 施工関連のタスク管理 |
| `worker` | 職人 | 自分のタスクのみ |
| `viewer` | 閲覧者 | 閲覧のみ |

### プロジェクトロール（ProjectRole）

プロジェクト単位で付与される権限:

| ロール | 説明 | 主な権限 |
|--------|------|---------|
| `owner` | オーナー | プロジェクトの所有者、すべての操作可能 |
| `manager` | マネージャー | プロジェクト管理、メンバー追加 |
| `member` | メンバー | タスク作成・編集 |
| `viewer` | 閲覧者 | 閲覧のみ |

### 権限マトリックス

#### グローバルロール権限

```typescript
// functions/src/lib/roles.ts より

export const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
  super_admin: {
    canViewAllProjects: true,
    canEditAllProjects: true,
    canCreateProjects: true,
    canDeleteProjects: true,
    canManageMembers: true,
    canViewAllTasks: true,
    canEditAllTasks: true,
    canCreateTasks: true,
    canDeleteTasks: true,
    canManageUsers: true,
  },
  admin: {
    canViewAllProjects: true,
    canEditAllProjects: true,
    canCreateProjects: true,
    canDeleteProjects: true,
    canManageMembers: true,
    canViewAllTasks: true,
    canEditAllTasks: true,
    canCreateTasks: true,
    canDeleteTasks: true,
    canManageUsers: true,
  },
  project_manager: {
    canViewAllProjects: false,      // プロジェクトメンバーのみ
    canEditAllProjects: false,
    canCreateProjects: true,
    canDeleteProjects: false,
    canManageMembers: true,         // 参加プロジェクトのみ
    canViewAllTasks: false,
    canEditAllTasks: false,
    canCreateTasks: true,
    canDeleteTasks: true,
    canManageUsers: false,
  },
  // ... 他のロール
};
```

#### プロジェクトロール権限

```typescript
export const PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, ProjectPermissions> = {
  owner: {
    canEditProject: true,
    canDeleteProject: true,
    canManageMembers: true,
    canViewTasks: true,
    canEditTasks: true,
    canCreateTasks: true,
    canDeleteTasks: true,
    canViewFiles: true,
    canUploadFiles: true,
  },
  manager: {
    canEditProject: true,
    canDeleteProject: false,
    canManageMembers: true,
    canViewTasks: true,
    canEditTasks: true,
    canCreateTasks: true,
    canDeleteTasks: true,
    canViewFiles: true,
    canUploadFiles: true,
  },
  // ... 他のロール
};
```

### 権限チェックの優先順位

**重要**: 組織レベルの権限がプロジェクトレベルの権限よりも優先されます。

```typescript
// functions/src/lib/access-control.ts より

export async function canManageProjectMembers(
  user: User,
  project: Project,
  orgId: string
): Promise<boolean> {
  // 1. 組織レベルの権限が最優先
  if (user.role === 'super_admin') return true;
  if (user.role === 'admin') return true;
  if (user.role === 'project_manager') return true;

  // 2. プロジェクトオーナーは常に管理可能
  if (project.ownerUserId === user.id) return true;

  // 3. プロジェクトメンバーの権限を確認
  const permissions = await getProjectMemberPermissions(orgId, project.id, user.id);
  if (permissions?.canManageMembers) return true;

  return false;
}
```

### メンバー区分（MemberType）

| 区分 | 説明 | 制約 |
|-----|------|-----|
| `member` | 正社員/正規メンバー | プラン上限に制限される |
| `guest` | 外部協力者/ゲスト | プラン上限に制限される、権限制限あり |

---

## データモデル

### Firestoreコレクション構造

```
firestore/
├── orgs/{orgId}/
│   ├── projects/{projectId}         # プロジェクト
│   ├── tasks/{taskId}               # タスク
│   ├── projectMembers/{memberId}    # プロジェクトメンバー
│   ├── clients/{clientId}           # クライアント
│   ├── collaborators/{collaboratorId} # 協力者
│   ├── invitations/{invitationId}   # 招待
│   └── activityLogs/{logId}         # アクティビティログ
│
└── users/{userId}                   # ユーザー（グローバル）
```

### 主要データ型

#### User（ユーザー）

```typescript
export interface User {
  id: string;                    // ユーザーID（Firebase Auth UID）
  email: string;                 // メールアドレス
  displayName: string;           // 表示名
  orgId: string;                 // 所属組織ID
  role: Role;                    // グローバルロール
  memberType: MemberType;        // メンバー区分（member/guest）
  職種?: string;                 // 職種
  部署?: string;                 // 部署
  電話番号?: string;
  photoURL?: string;
  isActive: boolean;
  guestPermissions?: GuestPermissions; // ゲスト権限（guest時のみ）
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
}
```

#### Project（プロジェクト）

```typescript
export interface Project {
  id: string;                    // プロジェクトID
  物件名: string;                // プロジェクト名
  クライアント?: string;          // クライアント名
  ownerUserId: string;           // オーナーのユーザーID
  ownerOrgId: string;            // オーナーの組織ID
  visibility: 'private' | 'organization'; // 公開範囲
  予定開始日?: string;
  予定終了日?: string;
  status: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Timestamp;         // ソフトデリート
}
```

#### ProjectMember（プロジェクトメンバー）

```typescript
export interface ProjectMember {
  id: string;                    // メンバーID
  projectId: string;             // プロジェクトID
  userId: string;                // ユーザーID
  email: string;                 // メールアドレス
  displayName: string;           // 表示名
  orgId: string;                 // 所属組織ID
  orgName: string;               // 所属組織名
  role: ProjectRole;             // プロジェクト内のロール
  職種?: string;
  permissions: ProjectPermissions; // プロジェクト内の権限
  invitedBy: string;
  invitedAt: Timestamp;
  joinedAt?: Timestamp;
  status: 'invited' | 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### Task（タスク）

```typescript
export interface Task {
  id: string;
  projectId: string;
  タスク名: string;
  予定開始日?: string;
  期限?: string;
  実績開始日?: string;
  実績完了日?: string;
  assignedTo?: string;           // 担当者のユーザーID
  assignedToEmail?: string;
  status: string;
  priority?: string;
  進捗率?: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Timestamp;
}
```

#### Client（クライアント）

```typescript
export interface Client {
  id: string;
  name: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}
```

#### Collaborator（協力者）

```typescript
export interface Collaborator {
  id: string;
  name: string;                  // 協力者名（メールなし）
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}
```

---

## APIエンドポイント

### エンドポイント一覧

```typescript
// functions/src/index.ts より

app.use('/api/projects', projectsRouter);              // プロジェクト管理
app.use('/api/tasks', tasksRouter);                    // タスク管理
app.use('/api/people', peopleRouter);                  // 人員管理
app.use('/api/users', usersRouter);                    // ユーザー管理
app.use('/api/clients', clientsRouter);                // クライアント管理
app.use('/api/collaborators', collaboratorsRouter);    // 協力者管理
app.use('/api', projectMembersRouter);                 // プロジェクトメンバー
app.use('/api/invitations', invitationsRouter);        // プロジェクト招待
app.use('/api/org-invitations', orgInvitationsRouter); // 組織招待
app.use('/api/notifications', notificationsRouter);    // 通知
app.use('/api', activityLogsRouter);                   // アクティビティログ
app.use('/api/schedule', scheduleRouter);              // スケジュール
app.use('/api/calendar', calendarRouter);              // カレンダー
app.use('/api/jobs', jobsRouter);                      // ジョブ管理
app.use('/api/settings', settingsRouter);              // 設定
app.use('/api/organizations', organizationsRouter);    // 組織管理
app.use('/api', excelRouter);                          // Excel インポート/エクスポート
app.use('/api/admin', adminCleanupRouter);             // 管理者機能
```

### 主要エンドポイント詳細

#### プロジェクト管理

```
GET    /api/projects                    # プロジェクト一覧取得
POST   /api/projects                    # プロジェクト作成
GET    /api/projects/:id                # プロジェクト詳細取得
PATCH  /api/projects/:id                # プロジェクト更新
DELETE /api/projects/:id                # プロジェクト削除
```

#### タスク管理

```
GET    /api/tasks                       # タスク一覧取得
POST   /api/tasks                       # タスク作成
GET    /api/tasks/:id                   # タスク詳細取得
PATCH  /api/tasks/:id                   # タスク更新
DELETE /api/tasks/:id                   # タスク削除
POST   /api/tasks/:id/complete          # タスク完了
POST   /api/tasks/:id/move              # タスク日付移動
```

#### プロジェクトメンバー管理

```
GET    /api/projects/:projectId/members              # メンバー一覧
POST   /api/projects/:projectId/members              # メンバー追加（招待）
GET    /api/projects/:projectId/manageable-users     # 招待候補ユーザー一覧
PATCH  /api/projects/:projectId/members/:userId      # メンバー更新
DELETE /api/projects/:projectId/members/:userId      # メンバー削除
POST   /api/projects/:projectId/members/:userId/accept # 招待承認
```

#### ユーザー管理

```
GET    /api/users                       # ユーザー一覧取得
GET    /api/users/me                    # 現在のユーザー情報
GET    /api/users/:id                   # ユーザー詳細取得
POST   /api/users                       # ユーザー作成
PATCH  /api/users/:id                   # ユーザー更新
DELETE /api/users/:id                   # ユーザー削除
POST   /api/users/:id/activate          # ユーザー有効化
POST   /api/users/:id/deactivate        # ユーザー無効化
```

#### クライアント管理

```
GET    /api/clients                     # クライアント一覧取得
POST   /api/clients                     # クライアント作成
PATCH  /api/clients/:id                 # クライアント更新
DELETE /api/clients/:id                 # クライアント削除
```

#### 協力者管理

```
GET    /api/collaborators               # 協力者一覧取得
POST   /api/collaborators               # 協力者作成
PATCH  /api/collaborators/:id           # 協力者更新
DELETE /api/collaborators/:id           # 協力者削除
```

#### 組織招待

```
GET    /api/org-invitations             # 招待一覧取得
POST   /api/org-invitations             # 組織メンバー招待
GET    /api/org-invitations/stats       # 現在のメンバー数と上限
DELETE /api/org-invitations/:id         # 招待取り消し
```

---

## 主要機能

### 1. プロジェクト管理

- プロジェクト作成・編集・削除
- プロジェクト一覧表示（フィルター、検索）
- プロジェクト詳細（ガントチャート、タスク一覧）
- 公開範囲設定（private/organization）
- ソフトデリート（削除済みプロジェクトは30日後に完全削除）

### 2. タスク管理

- タスク作成・編集・削除
- ガントチャート表示
- カンバンボード
- タスクのドラッグ&ドロップ
- 担当者割り当て
- 進捗率管理
- ステータス管理

### 3. 人員管理

#### 社内メンバー管理
- ユーザー一覧表示
- ユーザー追加・編集・削除
- ロール変更
- メンバー区分設定（member/guest）
- 職種・部署設定

#### クライアント管理
- クライアント一覧表示
- クライアント追加・編集・削除
- クライアント名のインライン編集

#### 協力者管理
- 協力者一覧表示
- 協力者追加・編集・削除
- 協力者名のインライン編集
- プロジェクトメンバーとして協力者を追加可能

### 4. プロジェクトメンバー管理

- プロジェクトメンバー一覧表示
- メンバー追加（招待）
  - 社内メンバーから選択
  - 協力者から選択
  - メールアドレスで直接招待
- プロジェクトロール設定
- 招待承認/辞退
- メンバー削除

### 5. 権限管理

- ロールベースアクセス制御（RBAC）
- グローバルロール（システム全体）
- プロジェクトロール（プロジェクト単位）
- 組織レベル権限の優先
- きめ細かい権限設定

### 6. 組織招待

- 組織メンバー招待
- ゲストユーザー招待
- 招待一覧管理
- 招待取り消し
- メンバー数制限（プラン別）

### 7. アクティビティログ

- プロジェクト操作履歴
- タスク操作履歴
- メンバー操作履歴
- 変更内容の記録

---

## ファイル構造

### 重要ファイルの完全パス

```
D:\senaa_dev\compass\
│
├── 📂 functions/                              # バックエンド
│   ├── package.json
│   ├── tsconfig.json
│   └── 📂 src/
│       ├── 📄 index.ts                       ⭐ APIエントリーポイント
│       │
│       ├── 📂 api/                           # 各APIエンドポイント
│       │   ├── projects.ts
│       │   ├── tasks.ts
│       │   ├── project-members-api.ts
│       │   ├── collaborators-api.ts          # 協力者API
│       │   ├── clients-api.ts                # クライアントAPI
│       │   ├── org-invitations.ts            # 組織招待API
│       │   ├── users-api.ts
│       │   └── ...
│       │
│       └── 📂 lib/                           # 共通ライブラリ
│           ├── 📄 auth-types.ts             ⭐ 型定義（ロール、権限）
│           ├── 📄 roles.ts                  ⭐ 権限マトリックス
│           ├── 📄 access-control.ts         ⭐ アクセス制御ロジック
│           ├── 📄 types.ts                  ⭐ データモデル定義
│           ├── auth.ts                      # 認証ミドルウェア
│           ├── project-members.ts           # プロジェクトメンバー処理
│           ├── users.ts                     # ユーザー処理
│           ├── firestore.ts                 # Firestore操作
│           ├── gmail.ts                     # メール送信
│           └── validation.ts                # バリデーション
│
├── 📂 web/                                   # フロントエンド
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── 📂 src/
│       ├── 📄 App.tsx                       ⭐ ルーティング
│       ├── main.tsx
│       │
│       ├── 📂 pages/                        # ページコンポーネント
│       │   ├── DashboardPage.tsx
│       │   ├── ProjectsPage.tsx
│       │   ├── ProjectDetailPage.tsx
│       │   ├── AdminPage.tsx
│       │   └── ...
│       │
│       ├── 📂 components/                   # UIコンポーネント
│       │   ├── ProjectMembersDialog.tsx     # プロジェクトメンバー管理
│       │   ├── UserManagement.tsx           # 人員管理
│       │   ├── ProjectEditDialog.tsx
│       │   ├── TaskEditDialog.tsx
│       │   └── ...
│       │
│       └── 📂 lib/                          # ユーティリティ
│           ├── 📄 api.ts                    ⭐ APIクライアント
│           ├── 📄 auth-types.ts             ⭐ 型定義（フロント側）
│           ├── 📄 types.ts                  ⭐ データモデル（フロント側）
│           ├── firebaseClient.ts
│           ├── auth.tsx
│           └── utils.ts
│
├── 📄 firebase.json                          ⭐ Firebase設定
├── 📄 firestore.rules                        ⭐ Firestoreセキュリティルール
├── 📄 firestore.indexes.json                 # Firestoreインデックス
├── 📄 .firebaserc                            # Firebaseプロジェクト設定
└── 📄 TASK_MEMO.md                           # 作業メモ
```

---

## 開発ワークフロー

### ビルド＆デプロイ

#### 全体デプロイ
```bash
firebase deploy
```

#### Functionsのみデプロイ
```bash
cd functions
npm run build
firebase deploy --only functions
```

#### Hostingのみデプロイ
```bash
cd web
npm run build
cd ..
firebase deploy --only hosting
```

#### 強制デプロイ（変更が検出されない場合）
```bash
cd functions
npm run build
firebase deploy --only functions --force
```

#### バージョン更新してデプロイ
```bash
# functions/package.json のバージョンを更新
# 例: "version": "0.1.0" → "0.1.1"
cd functions
npm run build
firebase deploy --only functions --force
```

### ローカル開発

#### Functions
```bash
cd functions
npm run serve
```

#### Web
```bash
cd web
npm run dev
```

#### Emulator
```bash
firebase emulators:start
```

### トラブルシューティング

#### デプロイがスキップされる場合
```bash
# クリーンビルド
cd functions
rm -rf lib
npx tsc

# または
cd web
rm -rf dist node_modules/.vite
npm run build
```

#### キャッシュクリア
```bash
# ブラウザ: Ctrl+Shift+R (ハードリロード)
# または: 開発者ツール → Application → Clear storage
```

---

## コード例

### APIクライアント使用例

```typescript
// web/src/lib/api.ts より

// プロジェクト一覧取得
const { projects } = await listProjects();

// タスク作成
const { id } = await createTask({
  projectId: 'P-0001',
  タスク名: '設計図作成',
  予定開始日: '2025-01-01',
  期限: '2025-01-15',
  assignedTo: 'user123',
  status: 'todo'
});

// プロジェクトメンバー追加
const response = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(token),
  },
  body: JSON.stringify({
    email: 'user@example.com',
    role: 'member',
    職種: '設計',
  }),
});

// 協力者一覧取得
const { collaborators } = await listCollaborators();

// クライアント作成
const client = await createClient('株式会社サンプル');
```

### 権限チェック例

```typescript
// functions/src/lib/access-control.ts より

// プロジェクトへのアクセス権限チェック
const canAccess = await canAccessProject(user, project, orgId);

// プロジェクト編集権限チェック
const canEdit = await canEditProject(user, project, orgId);

// プロジェクトメンバー管理権限チェック
const canManage = await canManageProjectMembers(user, project, orgId);

// タスク作成権限チェック
const canCreateTask = await canCreateTask(user, project, orgId);
```

---

## 現在の課題と未解決事項

### プロジェクトメンバーに協力者を追加する機能

**状況**: コード実装済み、デプロイ済み、しかし動作していない

**実装内容**:
1. `functions/src/api/collaborators-api.ts` - 協力者API実装
2. `web/src/components/ProjectMembersDialog.tsx` - 協力者選択UI実装
3. `web/src/components/UserManagement.tsx` - 協力者管理UI実装

**問題**:
- プロジェクトメンバー追加ダイアログで協力者セクションが表示されない
- ブラウザコンソールに `[ProjectMembers]` のログが出ない
- デバッグログも追加済みだが出力されない

**デバッグ機能**:
```typescript
// ProjectMembersDialog.tsx に追加済み
console.log('[ProjectMembersDialog] Component mounted');
console.log('[ProjectMembersDialog] Rendering - showInviteForm:', showInviteForm);
console.log('[ProjectMembers] showInviteForm changed:', showInviteForm);
console.log('[ProjectMembers] Loading data...');
console.log('[ProjectMembers] Loading collaborators...');
console.log('[ProjectMembers] Collaborators loaded:', data);
```

**次の調査ポイント**:
1. ProjectMembersDialogがどこから開かれているか特定
2. ユーザーが正しい画面を見ているか確認
3. 協力者データがFirestoreに存在するか確認

**参考**: 詳細は `TASK_MEMO.md` を参照

---

## 補足情報

### Firestoreセキュリティルール

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ユーザー認証チェック
    function isAuthenticated() {
      return request.auth != null;
    }

    // プロジェクトアクセス権限チェック
    // ... 詳細はfirestore.rulesを参照
  }
}
```

### 環境変数

```bash
# functions/.env
APP_URL=https://compass-31e9e.web.app
CORS_ORIGIN=https://compass-31e9e.web.app,https://compass-31e9e.firebaseapp.com
TASK_REMINDER_ENABLED=true
TASK_REMINDER_CRON=0 9 * * *
TASK_REMINDER_TIMEZONE=Asia/Tokyo
```

### プラン制限

```typescript
export const PLAN_LIMITS = {
  small: {
    price: 5000,        // ¥5,000/月（〜5名）
    members: 5,
  },
  standard: {
    price: 15000,       // ¥15,000/月（〜15名）
    members: 15,
  },
  business: {
    price: 35000,       // ¥35,000/月（〜40名）
    members: 40,
  },
  enterprise: {
    price: null,        // カスタム料金
    members: 999999,    // 実質無制限
  },
};
```

---

## まとめ

Compassは、建設・設計業界向けの包括的なプロジェクト管理システムです。Firebase技術スタックを活用し、React + TypeScriptで構築されています。

**主な特徴**:
- ロールベースの細かい権限管理
- プロジェクト・タスク・人員の一元管理
- 協力会社やクライアントを含む柔軟なメンバー管理
- ガントチャートによる視覚的なスケジュール管理
- リアルタイムな進捗共有

**技術的特徴**:
- TypeScriptによる型安全な開発
- Firebase Functionsによるサーバーレスアーキテクチャ
- Cloud Firestoreによるリアルタイムデータベース
- Firebase Authenticationによる安全な認証

このドキュメントは、プロジェクトの理解を深めるための包括的なリファレンスとして作成されました。
