/**
 * バリデーションユーティリティ
 */

import { ProjectRole } from './roles';

/**
 * メールアドレスの形式を検証
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;

  // RFC 5322準拠の簡易版正規表現
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * プロジェクトロールの妥当性を検証
 */
export function isValidProjectRole(role: string): role is ProjectRole {
  const validRoles: ProjectRole[] = ['owner', 'manager', 'member', 'viewer'];
  return validRoles.includes(role as ProjectRole);
}

/**
 * メールアドレスのバリデーションエラーメッセージを取得
 */
export function validateEmail(email: string): string | null {
  if (!email) {
    return 'メールアドレスが必要です';
  }

  if (typeof email !== 'string') {
    return 'メールアドレスは文字列である必要があります';
  }

  const trimmed = email.trim();
  if (!trimmed) {
    return 'メールアドレスが空です';
  }

  if (!isValidEmail(trimmed)) {
    return '有効なメールアドレスの形式ではありません';
  }

  if (trimmed.length > 254) {
    return 'メールアドレスが長すぎます（最大254文字）';
  }

  return null;
}

/**
 * プロジェクトロールのバリデーションエラーメッセージを取得
 */
export function validateProjectRole(role: string): string | null {
  if (!role) {
    return 'ロールが必要です';
  }

  if (typeof role !== 'string') {
    return 'ロールは文字列である必要があります';
  }

  if (!isValidProjectRole(role)) {
    return `無効なロールです。有効なロール: owner, manager, member, viewer`;
  }

  return null;
}
