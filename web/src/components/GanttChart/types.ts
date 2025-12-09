// ガントチャートの型定義

export type TaskStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'overdue';
export type ViewMode = 'day' | 'week' | 'month';

export interface TaskNotificationSettings {
  開始日: boolean;
  期限前日: boolean;
  期限当日: boolean;
  超過: boolean;
}

export interface GanttTask {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  assignee: string;
  assigneeAvatar?: string;
  progress: number; // 0-100
  status: TaskStatus;
  projectId: string;
  projectName: string;
  dependencies?: string[]; // タスクIDの配列
  milestone?: boolean;
  description?: string;
  estimatedHours?: number;
  priority?: string; // 優先度
  notificationSettings?: TaskNotificationSettings;
  isPending?: boolean; // 楽観的更新中かどうか
  type?: 'stage' | 'task'; // 工程かタスクかを区別
  parentStageId?: string; // 親工程のID（タスクの場合のみ）
}

export interface GanttViewState {
  tasks: GanttTask[];
  viewMode: ViewMode; // ズームレベル
  dateRange: { start: Date; end: Date };
  selectedTaskIds: string[];
  filters: {
    projectIds: string[];
    assignees: string[];
    statuses: string[];
  };
  sidebarCollapsed: boolean;
}

export interface DateTick {
  date: Date;
  label: string;
  isWeekend: boolean;
}

export interface TaskBarPosition {
  left: number;
  width: number;
  top: number;
}

// ========================================
// Stage ベースのガントチャート用の型定義
// ========================================

// 工程のステータス
export type StageStatus = 'not_started' | 'in_progress' | 'done' | 'delayed';

// 工程（Stage）の型定義
export interface GanttStage {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  assignee: string;
  assigneeAvatar?: string;
  progressPct: number; // 0-100（配下タスクから自動計算）
  status: StageStatus;
  projectId: string;
  projectName: string;
  tasks: GanttTask[]; // 配下のタスク
  orderIndex?: number; // 表示順序
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * 工程の進捗率を計算（配下タスクの完了割合）
 * @param tasks 配下のタスク配列
 * @returns 進捗率（0-100）
 */
export function calculateStageProgress(tasks: GanttTask[]): number {
  if (tasks.length === 0) return 0;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  return Math.round((completedTasks / tasks.length) * 100);
}

/**
 * 工程のステータスを計算
 * @param stage 工程
 * @param tasks 配下のタスク配列
 * @returns ステータス
 */
export function calculateStageStatus(stage: GanttStage, tasks: GanttTask[]): StageStatus {
  if (tasks.length === 0) {
    // タスクがない場合は、工程の期間で判定
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (stage.endDate < today) {
      return 'delayed'; // 終了日を過ぎている
    }

    if (stage.startDate <= today && today <= stage.endDate) {
      return 'in_progress'; // 期間内
    }

    return 'not_started'; // 開始前
  }

  const allCompleted = tasks.every(t => t.status === 'completed');
  if (allCompleted) return 'done';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isDelayed = stage.endDate < today && !allCompleted;
  if (isDelayed) return 'delayed';

  const anyStarted = tasks.some(t => t.status !== 'not_started');
  if (anyStarted) return 'in_progress';

  // 工程の開始日を過ぎていれば進行中扱い
  if (stage.startDate <= today) return 'in_progress';

  return 'not_started';
}
