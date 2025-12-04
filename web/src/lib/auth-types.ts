/**
 * ロール（役割）
 */
export type Role =
  | 'super_admin'     // スーパー管理者
  | 'admin'           // 管理者
  | 'project_manager' // プロジェクトマネージャー
  | 'sales'           // 営業
  | 'designer'        // 設計
  | 'site_manager'    // 施工管理
  | 'worker'          // 職人
  | 'viewer';         // 閲覧者

/**
 * メンバータイプ
 * internal: 社内メンバー（自組織の正社員・従業員）
 * partner: パートナー企業（協力会社のPM・担当者）
 * external: 外部メンバー（一時的な参加者）
 */
export type MemberType = 'internal' | 'partner' | 'external';

/**
 * プロジェクトロール
 */
export type ProjectRole =
  | 'owner'    // オーナー
  | 'manager'  // マネージャー
  | 'member'   // メンバー
  | 'viewer';  // 閲覧者

/**
 * 職種
 */
export type JobTitleType =
  | '営業'
  | 'PM'
  | '設計'
  | '施工管理'
  | '設備（給排水）'
  | '設備（電気）'
  | '厨房'
  | '看板'
  | '家具'
  | 'その他';

/**
 * ロールの表示名
 */
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'スーパー管理者',
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
 * 組織設定
 */
export interface OrganizationSettings {
  allowExternalMembers: boolean;
  defaultRole: Role;
}

/**
 * ユーザー (組織メンバー - ログイン可能)
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  orgId: string;
  role: Role;
  memberType?: MemberType;  // メンバータイプ（ロールから自動設定）
  jobTitle?: string;      // Changed from 職種
  department?: string;    // Changed from 部署
  phoneNumber?: string;   // Changed from 電話番号
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
  orgId: string;                 // Real organization ID, never 'external'
  orgName: string;
  memberType?: MemberType;       // メンバータイプ（ユーザーから継承）
  role: ProjectRole;
  jobTitle?: string;             // Changed from 職種
  permissions: ProjectPermissions;
  invitedBy: string;
  invitedAt: string;
  joinedAt?: string;
  status: 'invited' | 'active' | 'inactive';
  createdAt: string;             // 作成日時
  updatedAt: string;             // 更新日時
}

/**
 * プロジェクトメンバー招待の入力データ (組織メンバーのみ)
 */
export interface ProjectMemberInput {
  email: string;                            // Required - organization members only
  role: ProjectRole;
  jobTitle?: JobTitleType | string;         // Changed from 職種
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
  memberType?: MemberType;  // 省略時はロールから自動設定
  jobTitle?: string;      // Changed from 職種
  department?: string;    // Changed from 部署
  phoneNumber?: string;   // Changed from 電話番号
  photoURL?: string;
}

/**
 * 協力者 (ログイン不可、表示のみ)
 */
export interface Collaborator {
  id: string;
  orgId: string;
  name: string;
  company?: string;
  jobTitle?: string;
  phoneNumber?: string;
  notes?: string;
  createdAt: any;
  createdBy: string;
  updatedAt: any;
}

/**
 * 協力者入力データ
 */
export interface CollaboratorInput {
  name: string;           // Required
  company?: string;
  jobTitle?: string;
  phoneNumber?: string;
  notes?: string;
}

/**
 * タスク担当者 (ユーザーまたは協力者)
 */
export interface TaskAssignee {
  type: 'user' | 'collaborator';
  userId?: string;
  collaboratorId?: string;
  displayName: string;
}
