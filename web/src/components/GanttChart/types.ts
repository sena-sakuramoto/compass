// ガントチャートの型定義

export type TaskStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'overdue';
export type ViewMode = 'day' | 'week' | 'month';

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
