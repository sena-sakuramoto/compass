/**
 * ロールベースのアクセス制御（RBAC）の定義
 */

// グローバルロール
export type Role =
  | 'super_admin'     // スーパー管理者: システム全体の完全な権限
  | 'admin'           // 組織管理者: 組織全体の管理、メンバー管理
  | 'project_manager' // プロジェクトマネージャー: プロジェクト全体の管理
  | 'sales'           // 営業: 営業関連の閲覧・編集
  | 'designer'        // 設計: 設計関連の閲覧・編集
  | 'site_manager'    // 施工管理: 施工関連の閲覧・編集
  | 'worker'          // 職人: 自分のタスクのみ閲覧・編集
  | 'viewer';         // 閲覧者: 閲覧のみ

// プロジェクト内のロール
export type ProjectRole =
  | 'owner'           // オーナー: プロジェクトの所有者
  | 'manager'         // マネージャー: プロジェクトの管理者
  | 'member'          // メンバー: 通常のメンバー
  | 'viewer';         // 閲覧者: 閲覧のみ

// グローバルロールの権限
export interface RolePermissions {
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
  canManageUsers: boolean;          // ユーザーを管理（管理者のみ）
}

// プロジェクト内の権限
export interface ProjectPermissions {
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

// グローバルロールごとの権限定義
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
    canViewOwnTasks: true,
    canEditOwnTasks: true,
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
    canViewOwnTasks: true,
    canEditOwnTasks: true,
    canManageUsers: true,
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
    canManageUsers: false,
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
    canManageUsers: false,
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
    canManageUsers: false,
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
    canManageUsers: false,
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
    canManageUsers: false,
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
    canManageUsers: false,
  },
};

// プロジェクトロールごとの権限定義
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

// ロールのラベル（日本語）
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'スーパー管理者',
  admin: '組織管理者',
  project_manager: 'プロジェクトマネージャー',
  sales: '営業',
  designer: '設計',
  site_manager: '施工管理',
  worker: '職人',
  viewer: '閲覧者',
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  member: 'メンバー',
  viewer: '閲覧者',
};

// ロールの説明
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: 'システム全体の完全な権限を持ちます',
  admin: '組織全体を管理し、メンバーやゲストを招待・管理できます',
  project_manager: 'プロジェクト全体を管理し、メンバーを追加できます',
  sales: '営業関連のプロジェクトとタスクを管理できます',
  designer: '設計関連のタスクを管理できます',
  site_manager: '施工関連のタスクを管理できます',
  worker: '自分に割り当てられたタスクのみ閲覧・更新できます',
  viewer: 'プロジェクトとタスクを閲覧できます',
};

export const PROJECT_ROLE_DESCRIPTIONS: Record<ProjectRole, string> = {
  owner: 'プロジェクトの所有者として、すべての操作が可能です',
  manager: 'プロジェクトを管理し、メンバーを追加できます',
  member: 'タスクの作成・編集ができます',
  viewer: 'プロジェクトとタスクを閲覧できます',
};

// ヘルパー関数: ロールの権限を取得
export function getRolePermissions(role: Role): RolePermissions {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
}

// ヘルパー関数: プロジェクトロールの権限を取得
export function getProjectRolePermissions(role: ProjectRole): ProjectPermissions {
  return PROJECT_ROLE_PERMISSIONS[role];
}

// ヘルパー関数: ロールのラベルを取得
export function getRoleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

// ヘルパー関数: プロジェクトロールのラベルを取得
export function getProjectRoleLabel(role: ProjectRole): string {
  return PROJECT_ROLE_LABELS[role];
}

