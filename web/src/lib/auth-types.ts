/**
 * ロール（役割）
 */
export type Role = 
  | 'admin'           // 管理者
  | 'project_manager' // プロジェクトマネージャー
  | 'sales'           // 営業
  | 'designer'        // 設計
  | 'site_manager'    // 施工管理
  | 'worker'          // 職人
  | 'viewer';         // 閲覧者

/**
 * プロジェクトロール
 */
export type ProjectRole = 
  | 'owner'    // オーナー
  | 'manager'  // マネージャー
  | 'member'   // メンバー
  | 'viewer';  // 閲覧者

/**
 * ロールの表示名
 */
export const ROLE_LABELS: Record<Role, string> = {
  admin: '管理者',
  project_manager: 'プロジェクトマネージャー',
  sales: '営業',
  designer: '設計',
  site_manager: '施工管理',
  worker: '職人',
  viewer: '閲覧者',
};

/**
 * プロジェクトロールの表示名
 */
export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  member: 'メンバー',
  viewer: '閲覧者',
};

/**
 * プロジェクト権限
 */
export interface ProjectPermissions {
  canEditProject: boolean;
  canDeleteProject: boolean;
  canManageMembers: boolean;
  canViewTasks: boolean;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canViewFiles: boolean;
  canUploadFiles: boolean;
}

/**
 * ユーザー
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  orgId: string;
  role: Role;
  職種?: string;
  部署?: string;
  電話番号?: string;
  photoURL?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

/**
 * プロジェクトメンバー
 */
export interface ProjectMember {
  id: string;                    // メンバーID（composite: {projectId}_{userId}）
  projectId: string;             // プロジェクトID
  userId: string;
  email: string;
  displayName: string;
  orgId: string;
  orgName: string;
  role: ProjectRole;
  職種?: string;
  permissions: ProjectPermissions;
  invitedBy: string;
  invitedAt: string;
  joinedAt?: string;
  status: 'invited' | 'active' | 'inactive';
  createdAt: string;             // 作成日時
  updatedAt: string;             // 更新日時
}

/**
 * プロジェクトメンバー招待の入力データ
 */
export interface ProjectMemberInput {
  email: string;
  role: ProjectRole;
  permissions?: Partial<ProjectPermissions>;
  message?: string;
}

/**
 * ユーザー作成の入力データ
 */
export interface UserInput {
  email: string;
  displayName: string;
  orgId: string;
  role: Role;
  職種?: string;
  部署?: string;
  電話番号?: string;
  photoURL?: string;
}

