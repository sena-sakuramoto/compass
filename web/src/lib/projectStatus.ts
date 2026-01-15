// プロジェクトのマイルストーンから自動でステータスを計算する

import type { Project } from './types';

// マイルストーンの順序と対応するステータス
const MILESTONE_STATUS_MAP: { field: keyof Project; status: string }[] = [
  { field: '引渡し予定日', status: '引渡し完了' },
  { field: '竣工予定日', status: '竣工済' },
  { field: '中間検査日', status: '中間検査済' },
  { field: '着工日', status: '施工中' },
  { field: '見積確定日', status: '見積確定' },
  { field: '設計施工現調日', status: '設計施工現調済' },
  { field: '基本設計完了日', status: '基本設計完了' },
  { field: 'レイアウト確定日', status: 'レイアウト確定' },
  { field: '現地調査日', status: '現地調査済' },
];

// 手動で設定するステータス（自動計算をオーバーライド）
const MANUAL_STATUSES = ['保留', '失注'];

/**
 * プロジェクトのマイルストーンから自動でステータスを計算
 * @param project プロジェクト
 * @returns 計算されたステータス
 */
export function calculateProjectStatus(project: Project): string {
  // 手動ステータスが設定されている場合はそれを優先
  if (project.ステータス && MANUAL_STATUSES.includes(project.ステータス)) {
    return project.ステータス;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // マイルストーンを逆順（最新→最古）でチェック
  for (const { field, status } of MILESTONE_STATUS_MAP) {
    const dateStr = project[field] as string | undefined;
    if (dateStr) {
      const date = new Date(dateStr);
      date.setHours(0, 0, 0, 0);
      if (date <= today) {
        return status;
      }
    }
  }

  // どのマイルストーンも過ぎていない場合
  // 開始日が設定されていて過ぎていれば「計画中」
  if (project.開始日) {
    const startDate = new Date(project.開始日);
    startDate.setHours(0, 0, 0, 0);
    if (startDate <= today) {
      return '計画中';
    }
  }

  return '未着手';
}

/**
 * ステータスに対応する色を取得
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case '未着手':
      return 'bg-gray-100 text-gray-700';
    case '計画中':
      return 'bg-blue-100 text-blue-700';
    case '現地調査済':
      return 'bg-cyan-100 text-cyan-700';
    case 'レイアウト確定':
      return 'bg-teal-100 text-teal-700';
    case '基本設計完了':
      return 'bg-green-100 text-green-700';
    case '設計施工現調済':
      return 'bg-lime-100 text-lime-700';
    case '見積確定':
      return 'bg-yellow-100 text-yellow-700';
    case '施工中':
      return 'bg-orange-100 text-orange-700';
    case '中間検査済':
      return 'bg-amber-100 text-amber-700';
    case '竣工済':
      return 'bg-emerald-100 text-emerald-700';
    case '引渡し完了':
      return 'bg-green-200 text-green-800';
    case '保留':
      return 'bg-purple-100 text-purple-700';
    case '失注':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

/**
 * 全てのステータスオプション（手動設定用）
 */
export const ALL_STATUS_OPTIONS = [
  '未着手',
  '計画中',
  '現地調査済',
  'レイアウト確定',
  '基本設計完了',
  '設計施工現調済',
  '見積確定',
  '施工中',
  '中間検査済',
  '竣工済',
  '引渡し完了',
  '保留',
  '失注',
];
