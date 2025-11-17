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
