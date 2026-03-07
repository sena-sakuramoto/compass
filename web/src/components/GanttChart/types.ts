import type { TaskNotificationSettings as BaseTaskNotificationSettings } from '../../lib/types';

export type TaskStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'overdue';
export type ViewMode = 'day' | 'week' | 'month';

export type TaskNotificationSettings = BaseTaskNotificationSettings;

export interface GanttTask {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  assignee: string;
  assigneeAvatar?: string;
  progress: number;
  status: TaskStatus;
  projectId: string;
  projectName: string;
  dependencies?: string[];
  milestone?: boolean;
  description?: string;
  estimatedHours?: number;
  priority?: string;
  notificationSettings?: TaskNotificationSettings;
  isPending?: boolean;
  type?: 'stage' | 'task';
  parentId?: string | null;
  ballHolder?: string | null;
  responseDeadline?: string | null;
  ballNote?: string | null;
  ballFollowUpOn?: string | null;
  parentStageId?: string;
  isDimmed?: boolean;
}

export interface GanttViewState {
  tasks: GanttTask[];
  viewMode: ViewMode;
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
  isHoliday?: boolean;
}

export interface TaskBarPosition {
  left: number;
  width: number;
  top: number;
}

export type StageStatus = 'not_started' | 'in_progress' | 'done' | 'delayed';

export interface GanttStage {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  assignee: string;
  assigneeAvatar?: string;
  progressPct: number;
  status: StageStatus;
  projectId: string;
  projectName: string;
  tasks: GanttTask[];
  orderIndex?: number;
}

export function calculateStageProgress(tasks: GanttTask[]): number {
  if (tasks.length === 0) return 0;
  const completedTasks = tasks.filter((task) => task.status === 'completed').length;
  return Math.round((completedTasks / tasks.length) * 100);
}

export function calculateStageStatus(stage: GanttStage, tasks: GanttTask[]): StageStatus {
  if (tasks.length === 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (stage.endDate < today) {
      return 'done';
    }

    if (stage.startDate <= today && today <= stage.endDate) {
      return 'in_progress';
    }

    return 'not_started';
  }

  const allCompleted = tasks.every((task) => task.status === 'completed');
  if (allCompleted) return 'done';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isDelayed = stage.endDate < today && !allCompleted;
  if (isDelayed) return 'delayed';

  const anyStarted = tasks.some((task) => task.status !== 'not_started');
  if (anyStarted) return 'in_progress';

  if (stage.startDate <= today) return 'in_progress';

  return 'not_started';
}
