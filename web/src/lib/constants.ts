export const STATUS_PROGRESS: Record<string, number> = {
  未着手: 0,
  進行中: 0.5,
  確認待ち: 0.6,
  保留: 0.2,
  完了: 1,
};

export const ARCHIVED_PROJECT_STATUSES: readonly string[] = ['完了', '失注', '完了（引渡し済）'];
export const CLOSED_PROJECT_STATUSES: readonly string[] = ARCHIVED_PROJECT_STATUSES;

export const isArchivedProjectStatus = (status?: string | null): boolean =>
  status ? ARCHIVED_PROJECT_STATUSES.includes(status) : false;

export const isClosedProjectStatus = (status?: string | null): boolean =>
  status ? CLOSED_PROJECT_STATUSES.includes(status) : false;
