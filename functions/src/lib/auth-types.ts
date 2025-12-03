import { Timestamp } from 'firebase-admin/firestore';
import { Role, ProjectRole, ProjectPermissions, RolePermissions } from './roles';

/**
 * サブスクリプションプラン
 */
export type SubscriptionPlan = 'starter' | 'business' | 'enterprise';

/**
 * プラン別の料金と上限設定
 */
export const PLAN_LIMITS = {
  starter: {
    price: 5000,        // ¥5,000/月
    members: 5,         // 正式メンバー上限
    guests: 10,         // ゲスト上限
  },
  business: {
    price: 30000,       // ¥30,000/月
    members: 30,        // 正式メンバー上限
    guests: 100,        // ゲスト上限
  },
  enterprise: {
    price: null,        // カスタム料金
    members: 999999,    // 実質無制限
    guests: 999999,     // 実質無制限
  },
} as const;

/**
 * 組織の利用上限
 */
export interface OrganizationLimits {
  maxMembers: number;   // メンバー上限
  maxGuests: number;    // ゲスト上限
}

/**
 * 組織の現在の利用状況
 */
export interface OrganizationUsage {
  members: number;      // 現在の正式メンバー数
  guests: number;       // 現在のゲストユーザー数
}

/**
 * 組織（Organization）
 */
export interface Organization {
  id: string;                    // 組織ID（例: "archi-prisma"）
  name: string;                  // 組織名（例: "株式会社アーキプリズマ"）
  type: 'prime' | 'subcontractor' | 'partner'; // 組織タイプ
  domain?: string;               // メールドメイン（例: "archi-prisma.co.jp"）
  settings: {
    allowExternalMembers: boolean; // 外部メンバーの追加を許可
    defaultRole: Role;            // デフォルトのロール
  };
  // プラン関連（新規追加）
  plan?: SubscriptionPlan;       // サブスクリプションプラン（未設定の場合はstarter扱い）
  limits?: OrganizationLimits;   // カスタム上限（未設定の場合はプランのデフォルト値を使用）
  usage?: OrganizationUsage;     // 現在の利用状況
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * メンバー区分
 */
export type MemberType = 'member' | 'guest';

/**
 * ゲストユーザーの権限
 */
export interface GuestPermissions {
  viewProject: boolean;          // プロジェクト閲覧
  createOwnTasks: boolean;       // 自分のタスク作成
  editOwnTasks: boolean;         // 自分のタスク編集
  deleteOwnTasks: boolean;       // 自分のタスク削除
  assignTasksToOthers: boolean;  // 他人へのタスク割当
  editOtherTasks: boolean;       // 他人のタスク編集
  createProjects: boolean;       // プロジェクト作成
}

/**
 * デフォルトのゲスト権限（協力会社向け）
 */
export const DEFAULT_GUEST_PERMISSIONS: GuestPermissions = {
  viewProject: true,           // プロジェクト閲覧可能
  createOwnTasks: true,        // 自分のタスク作成可能
  editOwnTasks: true,          // 自分のタスク編集可能
  deleteOwnTasks: true,        // 自分のタスク削除可能
  assignTasksToOthers: false,  // 他人へのタスク割当不可
  editOtherTasks: false,       // 他人のタスク編集不可
  createProjects: false,       // プロジェクト作成不可
};

/**
 * ユーザー（User）
 */
export interface User {
  id: string;                    // ユーザーID（Firebase Auth UID）
  email: string;                 // メールアドレス
  displayName: string;           // 表示名
  orgId: string;                 // 所属組織ID
  role: Role;                    // グローバルロール
  memberType: MemberType;        // メンバー区分（member: 正社員/正規メンバー、guest: 外部協力者）
  職種?: string;                 // 職種（設計、施工管理、営業、職人など）
  部署?: string;                 // 部署
  電話番号?: string;
  photoURL?: string;             // プロフィール画像URL
  isActive: boolean;             // アクティブ状態
  // ゲスト権限（memberType === 'guest'の場合のみ使用）
  guestPermissions?: GuestPermissions; // カスタムゲスト権限（未設定の場合はDEFAULT_GUEST_PERMISSIONSを使用）
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
}

/**
 * プロジェクトメンバー（Project Member）
 */
export interface ProjectMember {
  id: string;                    // メンバーID（composite: {projectId}_{userId}）
  projectId: string;             // プロジェクトID
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
  createdAt: Timestamp;          // 作成日時
  updatedAt: Timestamp;          // 更新日時
}

/**
 * ユーザー作成時の入力データ
 */
export interface UserInput {
  email: string;
  displayName: string;
  orgId: string;
  role: Role;
  memberType: MemberType;
  職種?: string;
  部署?: string;
  電話番号?: string;
  photoURL?: string;
}

/**
 * 職種の選択肢
 */
export type 職種Type =
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
 * プロジェクトメンバー招待時の入力データ
 */
export interface ProjectMemberInput {
  email?: string;                // メールアドレス（システム登録ユーザーの場合）
  displayName?: string;          // 表示名（システム未登録ユーザーの場合）
  role: ProjectRole;
  職種?: 職種Type | string;     // 職種（オプション）
  permissions?: Partial<ProjectPermissions>; // カスタム権限（オプション）
  message?: string;              // 招待メッセージ（オプション）
}

/**
 * 認証済みユーザーのコンテキスト
 */
export interface AuthContext {
  user: User;
  permissions: {
    global: RolePermissions;
    projects: Map<string, ProjectPermissions>; // プロジェクトIDごとの権限
  };
}

