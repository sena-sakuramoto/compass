import { Timestamp } from 'firebase-admin/firestore';
import { Role, ProjectRole, ProjectPermissions, RolePermissions } from './roles';

/**
 * サブスクリプションプラン
 * 将来的に Circle系、AI heavy、省エネ連携プランなどを追加可能
 */
export type SubscriptionPlan =
  | 'starter'
  | 'business'
  | 'enterprise';
  // 将来の拡張例:
  // | 'circle_basic'
  // | 'circle_premium'
  // | 'ai_heavy'

/**
 * プラン別の料金と上限設定
 * ゲスト機能廃止により、メンバー数のみ管理
 */
export const PLAN_LIMITS = {
  starter: {
    price: 5000,        // ¥5,000/月
    members: 5,         // 組織メンバー上限
  },
  business: {
    price: 30000,       // ¥30,000/月
    members: 30,        // 組織メンバー上限
  },
  enterprise: {
    price: null,        // カスタム料金
    members: 999999,    // 実質無制限
  },
} as const;

/**
 * 組織の利用上限
 */
export interface OrganizationLimits {
  maxMembers: number;   // 組織メンバー上限（isActive=trueのユーザー数でカウント）
}

/**
 * 組織の現在の利用状況
 */
export interface OrganizationUsage {
  members: number;      // 現在の組織メンバー数（isActive=trueのユーザー数）
}

/**
 * 組織設定
 * NOTE: レガシーデータにはsettingsが存在しない可能性があるため、optional
 */
export interface OrganizationSettings {
  allowExternalMembers: boolean; // 外部組織メンバーの追加を許可
  defaultRole: Role;             // デフォルトのロール
}

/**
 * 組織タイプ
 * prime: 元請け・設計事務所
 * subcontractor: 協力業者・下請け
 * partner: パートナー企業
 */
export type OrganizationType = 'prime' | 'subcontractor' | 'partner';

/**
 * 組織（Organization）
 */
export interface Organization {
  id: string;                    // 組織ID（例: "archi-prisma"）
  name: string;                  // 組織名（例: "株式会社アーキプリズマ"）
  type: OrganizationType;        // 組織タイプ
  domain?: string;               // メールドメイン（例: "archi-prisma.co.jp"）
  settings?: OrganizationSettings; // 組織設定（レガシーデータ対応でoptional）
  plan?: SubscriptionPlan;       // サブスクリプションプラン（未設定の場合はstarter扱い）
  limits?: OrganizationLimits;   // カスタム上限（未設定の場合はプランのデフォルト値を使用）
  usage?: OrganizationUsage;     // 現在の利用状況
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * メンバータイプ
 * internal: 社内メンバー（自組織の正社員・従業員）
 * partner: パートナー企業（協力会社のPM・担当者）
 * external: 外部メンバー（一時的な参加者）
 */
export type MemberType = 'internal' | 'partner' | 'external';

/**
 * ユーザー（組織メンバー）
 * ログイン可能な課金対象ユーザー
 *
 * 【重要な変更】
 * - memberType を削除（すべてのログインユーザーは組織メンバー）
 * - guestPermissions を削除（ゲスト機能の廃止）
 * - 日本語フィールド名を英語に変更
 */
export interface User {
  id: string;                    // ユーザーID（Firebase Auth UID）
  email: string;                 // メールアドレス
  displayName: string;           // 表示名
  orgId: string;                 // 所属組織ID（必須、v1では1組織のみ所属）
  role: Role;                    // グローバルロール
  memberType?: MemberType;       // メンバータイプ（ロールから自動設定）
  jobTitle?: string;             // 職種（設計、施工管理、営業など）
  department?: string;           // 部署
  phoneNumber?: string;          // 電話番号
  photoURL?: string;             // プロフィール画像URL
  isActive: boolean;             // アクティブ状態（課金seat対象の判定に使用）
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
}

/**
 * 協力者（Collaborator）
 * ログイン不可、タスクの担当者表示用のみ
 * 外部の職人・業者などの名前を記録するためのエンティティ
 */
export interface Collaborator {
  id: string;                    // 協力者ID
  orgId: string;                 // 登録した組織ID
  name: string;                  // 協力者名
  company?: string;              // 所属会社名（任意）
  jobTitle?: string;             // 職種（任意）
  phoneNumber?: string;          // 電話番号（任意）
  notes?: string;                // 備考・メモ（任意）
  createdAt: Timestamp;
  createdBy: string;             // 登録したユーザーID
  updatedAt: Timestamp;
}

/**
 * プロジェクトメンバー（Project Member）
 *
 * 【重要な変更】
 * - orgId は実際の組織ID（'external' は廃止）
 * - 外部組織のメンバーも実 orgId で管理
 */
export interface ProjectMember {
  id: string;                    // メンバーID（composite: {projectId}_{userId}）
  projectId: string;             // プロジェクトID
  userId: string;                // ユーザーID
  email: string;                 // メールアドレス
  displayName: string;           // 表示名
  orgId: string;                 // 【重要】ユーザーの所属組織ID（実orgId、'external'は使わない）
  orgName: string;               // 所属組織名
  memberType?: MemberType;       // メンバータイプ（ユーザーから継承）
  role: ProjectRole;             // プロジェクト内のロール
  jobTitle?: string;             // 職種
  permissions: ProjectPermissions; // プロジェクト内の権限
  invitedBy: string;             // 招待者のユーザーID
  invitedAt: Timestamp;          // 招待日時
  joinedAt?: Timestamp;          // 参加日時
  status: 'invited' | 'active' | 'inactive'; // ステータス
  message?: string;              // 招待メッセージ
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * タスクの担当者参照
 * userId（ログイン可能なユーザー）または collaboratorId（ログイン不可の協力者）のいずれか
 */
export interface TaskAssignee {
  type: 'user' | 'collaborator';
  userId?: string;               // type='user'の場合に使用
  collaboratorId?: string;       // type='collaborator'の場合に使用
  displayName: string;           // 表示名（キャッシュ用）
}

/**
 * ユーザー作成時の入力データ
 */
export interface UserInput {
  email: string;
  displayName: string;
  orgId: string;
  role: Role;
  memberType?: MemberType;       // 省略時はロールから自動設定
  jobTitle?: string;
  department?: string;
  phoneNumber?: string;
  photoURL?: string;
}

/**
 * 職種の選択肢
 * NOTE: UI側のラベルは日本語、内部値は英語に統一
 */
export type JobTitleType =
  | 'sales'           // 営業
  | 'pm'              // PM
  | 'designer'        // 設計
  | 'site_manager'    // 施工管理
  | 'plumbing'        // 設備（給排水）
  | 'electrical'      // 設備（電気）
  | 'kitchen'         // 厨房
  | 'signage'         // 看板
  | 'furniture'       // 家具
  | 'other';          // その他

/**
 * プロジェクトメンバー招待時の入力データ
 * ログイン可能なユーザー（組織メンバー）のみを対象
 *
 * 【重要】協力者（Collaborator）はプロジェクトメンバーにはならない。
 * 協力者はタスクレベルで TaskAssignee として参照される。
 */
export interface ProjectMemberInput {
  email: string;                 // 必須：組織メンバーまたは外部組織メンバーのメールアドレス
  role: ProjectRole;             // プロジェクト内のロール
  jobTitle?: JobTitleType | string; // 職種（オプション）
  permissions?: Partial<ProjectPermissions>; // カスタム権限（オプション）
  message?: string;              // 招待メッセージ（オプション）
}

/**
 * 協力者作成時の入力データ
 * ログイン不可、名前のみ記録
 */
export interface CollaboratorInput {
  name: string;                  // 必須：協力者名
  company?: string;              // 所属会社名（任意）
  jobTitle?: string;             // 職種（任意）
  phoneNumber?: string;          // 電話番号（任意）
  notes?: string;                // 備考・メモ（任意）
}

/**
 * 組織メンバー招待時の入力データ
 */
export interface OrgInvitationInput {
  email: string;
  displayName?: string;
  role: Role;
  message?: string;
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
