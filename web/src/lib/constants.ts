// マイルストーンベースの自動計算ステータスに対応した進捗
export const STATUS_PROGRESS: Record<string, number> = {
  未着手: 0,
  計画中: 0.05,
  現地調査済: 0.1,
  'レイアウト確定': 0.2,
  基本設計完了: 0.3,
  設計施工現調済: 0.4,
  見積確定: 0.5,
  施工中: 0.6,
  中間検査済: 0.8,
  竣工済: 0.95,
  引渡し完了: 1,
  保留: 0.2,
  失注: 0,
};

// 完了済み・アーカイブ対象のステータス
export const ARCHIVED_PROJECT_STATUSES: readonly string[] = ['引渡し完了', '失注'];
export const CLOSED_PROJECT_STATUSES: readonly string[] = ['引渡し完了', '竣工済', '失注'];

export const isArchivedProjectStatus = (status?: string | null): boolean =>
  status ? ARCHIVED_PROJECT_STATUSES.includes(status) : false;

export const isClosedProjectStatus = (status?: string | null): boolean =>
  status ? CLOSED_PROJECT_STATUSES.includes(status) : false;
