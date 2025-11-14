import { Timestamp } from 'firebase-admin/firestore';
import { Role, ProjectRole, ProjectPermissions, RolePermissions } from './roles';

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * ユーザー（User）
 */
export interface User {
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
  職種?: string;
  部署?: string;
  電話番号?: string;
  photoURL?: string;
}

/**
 * プロジェクトメンバー招待時の入力データ
 */
export interface ProjectMemberInput {
  email: string;
  role: ProjectRole;
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

