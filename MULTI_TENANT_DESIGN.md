# マルチテナント・マルチユーザー対応 設計ドキュメント

## 概要

現在のシステムを拡張し、複数の会社（組織）と複数のユーザーが利用できるようにします。プロジェクトごとに異なる会社や職種のユーザーが参加し、それぞれの権限に応じて閲覧・編集できるようにします。

## 要件

### 1. マルチテナント対応
- 複数の会社（組織）が同じシステムを使用
- 各会社のデータは完全に分離
- 会社間でプロジェクトを共有可能

### 2. ユーザー管理
- ユーザーは1つの会社に所属
- ユーザーごとにロール（役割）を設定
- 複数のプロジェクトに参加可能

### 3. ロールベースのアクセス制御（RBAC）
- ユーザーのロールに応じてアクセス権限を制御
- プロジェクトごとに異なる権限を設定可能

### 4. プロジェクトメンバー管理
- プロジェクトごとにメンバーを追加
- メンバーの権限を個別に設定
- 外部の会社（協力会社）もメンバーとして追加可能

## データベース構造

### 1. 組織（Organizations）コレクション

**パス**: `/orgs/{orgId}`

```typescript
interface Organization {
  id: string;                    // 組織ID（例: "archi-prisma"）
  name: string;                  // 組織名（例: "株式会社アーキプリズマ"）
  type: 'prime' | 'subcontractor' | 'partner'; // 組織タイプ
  domain?: string;               // メールドメイン（例: "archi-prisma.co.jp"）
  settings: {
    allowExternalMembers: boolean; // 外部メンバーの追加を許可
    defaultRole: Role;            // デフォルトのロール
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**組織タイプ**:
- `prime`: 元請け会社
- `subcontractor`: 下請け会社
- `partner`: 協力会社

### 2. ユーザー（Users）コレクション

**パス**: `/users/{userId}`

```typescript
interface User {
  id: string;                    // ユーザーID（Firebase Auth UID）
  email: string;                 // メールアドレス
  displayName: string;           // 表示名
  orgId: string;                 // 所属組織ID
  role: Role;                    // グローバルロール
  職種?: string;                 // 職種（設計、施工管理、営業、職人など）
  部署?: string;                 // 部署
  電話番号?: string;
  photoURL?: string;             // プロフィール画像URL
  isActive: boolean;             // アクティブ状態
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
}
```

### 3. ロール定義

```typescript
type Role = 
  | 'admin'           // 管理者: すべての権限
  | 'project_manager' // プロジェクトマネージャー: プロジェクト全体の管理
  | 'sales'           // 営業: 営業関連の閲覧・編集
  | 'designer'        // 設計: 設計関連の閲覧・編集
  | 'site_manager'    // 施工管理: 施工関連の閲覧・編集
  | 'worker'          // 職人: 自分のタスクのみ閲覧・編集
  | 'viewer';         // 閲覧者: 閲覧のみ

interface RolePermissions {
  canViewAllProjects: boolean;      // すべてのプロジェクトを閲覧
  canEditAllProjects: boolean;      // すべてのプロジェクトを編集
  canCreateProjects: boolean;       // プロジェクトを作成
  canDeleteProjects: boolean;       // プロジェクトを削除
  canManageMembers: boolean;        // メンバーを管理
  canViewAllTasks: boolean;         // すべてのタスクを閲覧
  canEditAllTasks: boolean;         // すべてのタスクを編集
  canCreateTasks: boolean;          // タスクを作成
  canDeleteTasks: boolean;          // タスクを削除
  canViewOwnTasks: boolean;         // 自分のタスクを閲覧
  canEditOwnTasks: boolean;         // 自分のタスクを編集
}

const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
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
    canViewOwnTasks: true,
    canEditOwnTasks: true,
  },
  project_manager: {
    canViewAllProjects: false,      // プロジェクトメンバーのみ
    canEditAllProjects: false,      // プロジェクトメンバーのみ
    canCreateProjects: true,
    canDeleteProjects: false,
    canManageMembers: true,         // 参加プロジェクトのみ
    canViewAllTasks: false,         // プロジェクトメンバーのみ
    canEditAllTasks: false,         // プロジェクトメンバーのみ
    canCreateTasks: true,
    canDeleteTasks: true,
    canViewOwnTasks: true,
    canEditOwnTasks: true,
  },
  sales: {
    canViewAllProjects: false,
    canEditAllProjects: false,
    canCreateProjects: true,
    canDeleteProjects: false,
    canManageMembers: false,
    canViewAllTasks: false,
    canEditAllTasks: false,
    canCreateTasks: true,
    canDeleteTasks: false,
    canViewOwnTasks: true,
    canEditOwnTasks: true,
  },
  designer: {
    canViewAllProjects: false,
    canEditAllProjects: false,
    canCreateProjects: false,
    canDeleteProjects: false,
    canManageMembers: false,
    canViewAllTasks: false,
    canEditAllTasks: false,
    canCreateTasks: true,
    canDeleteTasks: false,
    canViewOwnTasks: true,
    canEditOwnTasks: true,
  },
  site_manager: {
    canViewAllProjects: false,
    canEditAllProjects: false,
    canCreateProjects: false,
    canDeleteProjects: false,
    canManageMembers: false,
    canViewAllTasks: false,
    canEditAllTasks: false,
    canCreateTasks: true,
    canDeleteTasks: false,
    canViewOwnTasks: true,
    canEditOwnTasks: true,
  },
  worker: {
    canViewAllProjects: false,
    canEditAllProjects: false,
    canCreateProjects: false,
    canDeleteProjects: false,
    canManageMembers: false,
    canViewAllTasks: false,
    canEditAllTasks: false,
    canCreateTasks: false,
    canDeleteTasks: false,
    canViewOwnTasks: true,
    canEditOwnTasks: true,
  },
  viewer: {
    canViewAllProjects: false,
    canEditAllProjects: false,
    canCreateProjects: false,
    canDeleteProjects: false,
    canManageMembers: false,
    canViewAllTasks: false,
    canEditAllTasks: false,
    canCreateTasks: false,
    canDeleteTasks: false,
    canViewOwnTasks: true,
    canEditOwnTasks: false,
  },
};
```

### 4. プロジェクトメンバー（Project Members）サブコレクション

**パス**: `/orgs/{orgId}/projects/{projectId}/members/{userId}`

```typescript
interface ProjectMember {
  userId: string;                // ユーザーID
  email: string;                 // メールアドレス
  displayName: string;           // 表示名
  orgId: string;                 // 所属組織ID
  orgName: string;               // 所属組織名
  role: ProjectRole;             // プロジェクト内のロール
  職種?: string;                 // 職種
  permissions: ProjectPermissions; // プロジェクト内の権限
  invitedBy: string;             // 招待者のユーザーID
  invitedAt: Timestamp;          // 招待日時
  joinedAt?: Timestamp;          // 参加日時
  status: 'invited' | 'active' | 'inactive'; // ステータス
}

type ProjectRole = 
  | 'owner'           // オーナー: プロジェクトの所有者
  | 'manager'         // マネージャー: プロジェクトの管理者
  | 'member'          // メンバー: 通常のメンバー
  | 'viewer';         // 閲覧者: 閲覧のみ

interface ProjectPermissions {
  canEditProject: boolean;       // プロジェクト情報を編集
  canDeleteProject: boolean;     // プロジェクトを削除
  canManageMembers: boolean;     // メンバーを管理
  canViewTasks: boolean;         // タスクを閲覧
  canEditTasks: boolean;         // タスクを編集
  canCreateTasks: boolean;       // タスクを作成
  canDeleteTasks: boolean;       // タスクを削除
  canViewFiles: boolean;         // ファイルを閲覧
  canUploadFiles: boolean;       // ファイルをアップロード
}

const PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, ProjectPermissions> = {
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
  member: {
    canEditProject: false,
    canDeleteProject: false,
    canManageMembers: false,
    canViewTasks: true,
    canEditTasks: true,
    canCreateTasks: true,
    canDeleteTasks: false,
    canViewFiles: true,
    canUploadFiles: true,
  },
  viewer: {
    canEditProject: false,
    canDeleteProject: false,
    canManageMembers: false,
    canViewTasks: true,
    canEditTasks: false,
    canCreateTasks: false,
    canDeleteTasks: false,
    canViewFiles: true,
    canUploadFiles: false,
  },
};
```

### 5. プロジェクト（Projects）コレクション（更新）

**パス**: `/orgs/{orgId}/projects/{projectId}`

```typescript
interface Project {
  // 既存のフィールド
  id: string;
  ProjectID: string;
  物件名: string;
  クライアント?: string;
  所在地_現地?: string;
  フォルダURL?: string;
  LS担当者?: string;
  自社PM?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // 新規フィールド
  ownerUserId: string;           // プロジェクトオーナーのユーザーID
  ownerOrgId: string;            // プロジェクトオーナーの組織ID
  memberCount: number;           // メンバー数
  externalMemberCount: number;   // 外部メンバー数
  visibility: 'private' | 'organization' | 'members'; // 公開範囲
  // private: メンバーのみ
  // organization: 組織内全員
  // members: メンバーとして追加されたユーザーのみ
}
```

### 6. タスク（Tasks）コレクション（更新）

**パス**: `/orgs/{orgId}/tasks/{taskId}`

```typescript
interface Task {
  // 既存のフィールド
  id: string;
  TaskID: string;
  タスク名: string;
  タスク種別?: string;
  ステータス?: string;
  予定開始日?: string;
  期限?: string;
  実績開始日?: string;
  実績完了日?: string;
  進捗?: number;
  assignee?: string;
  担当者?: string;
  担当者メール?: string;
  projectId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // 新規フィールド
  createdBy: string;             // 作成者のユーザーID
  assignedTo?: string;           // 担当者のユーザーID
  watchers: string[];            // ウォッチャーのユーザーID配列
  visibility: 'project' | 'assignee' | 'custom'; // 公開範囲
  // project: プロジェクトメンバー全員
  // assignee: 担当者のみ
  // custom: カスタム（watchersで指定）
}
```

## アクセス制御ロジック

### 1. プロジェクトへのアクセス

ユーザーがプロジェクトにアクセスできる条件：

```typescript
function canAccessProject(user: User, project: Project): boolean {
  // 1. 管理者は常にアクセス可能
  if (user.role === 'admin') return true;
  
  // 2. プロジェクトオーナーは常にアクセス可能
  if (project.ownerUserId === user.id) return true;
  
  // 3. プロジェクトメンバーはアクセス可能
  const member = getProjectMember(project.id, user.id);
  if (member && member.status === 'active') return true;
  
  // 4. 組織内公開の場合、同じ組織のユーザーはアクセス可能
  if (project.visibility === 'organization' && project.ownerOrgId === user.orgId) {
    return true;
  }
  
  return false;
}
```

### 2. タスクへのアクセス

ユーザーがタスクにアクセスできる条件：

```typescript
function canAccessTask(user: User, task: Task, project: Project): boolean {
  // 1. プロジェクトにアクセスできない場合、タスクにもアクセスできない
  if (!canAccessProject(user, project)) return false;
  
  // 2. 管理者は常にアクセス可能
  if (user.role === 'admin') return true;
  
  // 3. タスクの作成者は常にアクセス可能
  if (task.createdBy === user.id) return true;
  
  // 4. タスクの担当者は常にアクセス可能
  if (task.assignedTo === user.id) return true;
  
  // 5. タスクのウォッチャーはアクセス可能
  if (task.watchers.includes(user.id)) return true;
  
  // 6. タスクの公開範囲に応じて判定
  if (task.visibility === 'project') {
    // プロジェクトメンバー全員がアクセス可能
    const member = getProjectMember(project.id, user.id);
    return member !== null && member.status === 'active';
  }
  
  if (task.visibility === 'assignee') {
    // 担当者のみアクセス可能
    return task.assignedTo === user.id;
  }
  
  return false;
}
```

### 3. 編集権限の判定

```typescript
function canEditProject(user: User, project: Project): boolean {
  if (!canAccessProject(user, project)) return false;
  
  // 管理者は常に編集可能
  if (user.role === 'admin') return true;
  
  // プロジェクトメンバーの権限を確認
  const member = getProjectMember(project.id, user.id);
  if (member && member.permissions.canEditProject) return true;
  
  return false;
}

function canEditTask(user: User, task: Task, project: Project): boolean {
  if (!canAccessTask(user, task, project)) return false;
  
  // 管理者は常に編集可能
  if (user.role === 'admin') return true;
  
  // タスクの作成者は常に編集可能
  if (task.createdBy === user.id) return true;
  
  // プロジェクトメンバーの権限を確認
  const member = getProjectMember(project.id, user.id);
  if (member && member.permissions.canEditTasks) return true;
  
  // 職人は自分のタスクのみ編集可能
  if (user.role === 'worker' && task.assignedTo === user.id) return true;
  
  return false;
}
```

## API設計

### 1. ユーザー管理API

```typescript
// ユーザー一覧取得
GET /api/users
Query: orgId, role, isActive

// ユーザー詳細取得
GET /api/users/:userId

// ユーザー作成（管理者のみ）
POST /api/users
Body: { email, displayName, orgId, role, 職種, 部署 }

// ユーザー更新
PATCH /api/users/:userId
Body: { displayName, role, 職種, 部署, isActive }
```

### 2. プロジェクトメンバー管理API

```typescript
// プロジェクトメンバー一覧取得
GET /api/projects/:projectId/members

// プロジェクトメンバー追加（招待）
POST /api/projects/:projectId/members
Body: { email, role, permissions }

// プロジェクトメンバー更新
PATCH /api/projects/:projectId/members/:userId
Body: { role, permissions }

// プロジェクトメンバー削除
DELETE /api/projects/:projectId/members/:userId
```

### 3. 権限チェックAPI

```typescript
// プロジェクトへのアクセス権限チェック
GET /api/projects/:projectId/permissions
Response: { canView, canEdit, canDelete, canManageMembers }

// タスクへのアクセス権限チェック
GET /api/tasks/:taskId/permissions
Response: { canView, canEdit, canDelete }
```

## UI設計

### 1. プロジェクト詳細画面

**新規追加要素**:
- 「メンバー」タブ
  - メンバー一覧表示
  - メンバー追加ボタン
  - メンバーごとの権限表示・編集

### 2. メンバー招待ダイアログ

**フィールド**:
- メールアドレス（必須）
- ロール（必須）: オーナー、マネージャー、メンバー、閲覧者
- 権限のカスタマイズ（オプション）
- メッセージ（オプション）

### 3. メンバー管理画面

**表示項目**:
- 名前
- メールアドレス
- 所属組織
- 職種
- ロール
- ステータス（招待中、アクティブ、非アクティブ）
- 参加日時

**操作**:
- ロール変更
- 権限編集
- メンバー削除

### 4. ユーザープロフィール画面

**表示項目**:
- 基本情報（名前、メール、所属組織、職種、部署）
- 参加プロジェクト一覧
- 担当タスク一覧

## マイグレーション計画

### フェーズ1: データベース構造の更新

1. `users` コレクションの作成
2. `projects` コレクションに新規フィールドを追加
3. `tasks` コレクションに新規フィールドを追加
4. `projects/{projectId}/members` サブコレクションの作成

### フェーズ2: 既存データのマイグレーション

1. 既存のユーザーを `users` コレクションに移行
2. 既存のプロジェクトに `ownerUserId`, `ownerOrgId` を設定
3. 既存のタスクに `createdBy`, `assignedTo` を設定
4. 既存のプロジェクトにデフォルトメンバーを追加

### フェーズ3: アクセス制御の実装

1. バックエンドAPIに権限チェックを追加
2. Firestoreセキュリティルールを更新
3. フロントエンドに権限チェックを追加

### フェーズ4: UIの更新

1. メンバー管理画面の追加
2. メンバー招待機能の追加
3. 権限表示の追加

## セキュリティ考慮事項

### 1. Firestoreセキュリティルール

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ユーザー情報の取得
    function getUser() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    
    // プロジェクトメンバーかどうか
    function isProjectMember(orgId, projectId) {
      return exists(/databases/$(database)/documents/orgs/$(orgId)/projects/$(projectId)/members/$(request.auth.uid));
    }
    
    // プロジェクトメンバーの権限取得
    function getProjectMemberPermissions(orgId, projectId) {
      return get(/databases/$(database)/documents/orgs/$(orgId)/projects/$(projectId)/members/$(request.auth.uid)).data.permissions;
    }
    
    // ユーザーコレクション
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId || getUser().role == 'admin';
    }
    
    // 組織コレクション
    match /orgs/{orgId} {
      // プロジェクトコレクション
      match /projects/{projectId} {
        allow read: if request.auth != null && (
          getUser().role == 'admin' ||
          resource.data.ownerUserId == request.auth.uid ||
          isProjectMember(orgId, projectId)
        );
        
        allow create: if request.auth != null && (
          getUser().role == 'admin' ||
          getUser().role == 'project_manager' ||
          getUser().role == 'sales'
        );
        
        allow update: if request.auth != null && (
          getUser().role == 'admin' ||
          resource.data.ownerUserId == request.auth.uid ||
          (isProjectMember(orgId, projectId) && getProjectMemberPermissions(orgId, projectId).canEditProject)
        );
        
        allow delete: if request.auth != null && (
          getUser().role == 'admin' ||
          resource.data.ownerUserId == request.auth.uid
        );
        
        // プロジェクトメンバーサブコレクション
        match /members/{memberId} {
          allow read: if request.auth != null && isProjectMember(orgId, projectId);
          
          allow create, update, delete: if request.auth != null && (
            getUser().role == 'admin' ||
            resource.data.ownerUserId == request.auth.uid ||
            (isProjectMember(orgId, projectId) && getProjectMemberPermissions(orgId, projectId).canManageMembers)
          );
        }
      }
      
      // タスクコレクション
      match /tasks/{taskId} {
        allow read: if request.auth != null && (
          getUser().role == 'admin' ||
          resource.data.createdBy == request.auth.uid ||
          resource.data.assignedTo == request.auth.uid ||
          request.auth.uid in resource.data.watchers ||
          isProjectMember(orgId, resource.data.projectId)
        );
        
        allow create: if request.auth != null && (
          getUser().role == 'admin' ||
          isProjectMember(orgId, request.resource.data.projectId)
        );
        
        allow update: if request.auth != null && (
          getUser().role == 'admin' ||
          resource.data.createdBy == request.auth.uid ||
          (isProjectMember(orgId, resource.data.projectId) && getProjectMemberPermissions(orgId, resource.data.projectId).canEditTasks)
        );
        
        allow delete: if request.auth != null && (
          getUser().role == 'admin' ||
          resource.data.createdBy == request.auth.uid ||
          (isProjectMember(orgId, resource.data.projectId) && getProjectMemberPermissions(orgId, resource.data.projectId).canDeleteTasks)
        );
      }
    }
  }
}
```

### 2. バックエンドでの権限チェック

すべてのAPIエンドポイントで、リクエストを処理する前に権限をチェックします。

```typescript
// ミドルウェア
async function checkProjectAccess(req: Request, res: Response, next: NextFunction) {
  const { projectId } = req.params;
  const user = req.user; // 認証ミドルウェアで設定
  
  const canAccess = await canAccessProject(user, projectId);
  if (!canAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  next();
}
```

## 実装の優先順位

### 最優先（Phase 1）

1. ユーザーコレクションの作成
2. プロジェクトメンバーサブコレクションの作成
3. 基本的なアクセス制御ロジックの実装

### 高優先度（Phase 2）

4. メンバー管理APIの実装
5. メンバー招待機能の実装
6. UIの更新（メンバー管理画面）

### 中優先度（Phase 3）

7. 詳細な権限管理の実装
8. Firestoreセキュリティルールの更新
9. 既存データのマイグレーション

### 低優先度（Phase 4）

10. 通知機能（メンバー招待時）
11. 監査ログ（アクセス履歴）
12. レポート機能（メンバーごとの活動状況）

## まとめ

この設計により、以下が実現されます：

1. **マルチテナント対応**: 複数の会社が同じシステムを使用
2. **柔軟な権限管理**: ロールとプロジェクトメンバーの権限を組み合わせた細かい制御
3. **外部メンバーの招待**: 協力会社のメンバーをプロジェクトに招待
4. **セキュリティ**: Firestoreセキュリティルールとバックエンドでの二重チェック
5. **スケーラビリティ**: 将来的な機能拡張に対応できる設計

