// ガントチャートのユーティリティ関数

import { differenceInDays, addDays, format, startOfDay, endOfDay, isWeekend as isFnsWeekend } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { GanttTask, ViewMode, DateTick, TaskBarPosition, TaskStatus } from './types';

// ステータス別の色定義
export const STATUS_COLORS: Record<TaskStatus, string> = {
  not_started: '#94a3b8',  // グレー
  in_progress: '#2563eb',  // 青
  on_hold: '#f97316',      // オレンジ
  completed: '#0f766e',    // 緑
  overdue: '#dc2626',      // 赤
};

// 日付範囲の計算
export function calculateDateRange(tasks: GanttTask[]): { start: Date; end: Date } {
  if (tasks.length === 0) {
    const today = new Date();
    return { start: startOfDay(today), end: endOfDay(addDays(today, 30)) };
  }

  const dates = tasks.flatMap(task => [task.startDate, task.endDate]);
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

  // 前後に余裕を持たせる
  return {
    start: startOfDay(addDays(minDate, -7)),
    end: endOfDay(addDays(maxDate, 7))
  };
}

// 日付軸のティックを計算
export function calculateDateTicks(
  startDate: Date,
  endDate: Date,
  viewMode: ViewMode
): DateTick[] {
  const ticks: DateTick[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const date = new Date(current);
    const isWeekend = isFnsWeekend(date);

    let label = '';
    if (viewMode === 'day') {
      label = format(date, 'M/d', { locale: ja });
    } else if (viewMode === 'week') {
      label = format(date, 'M/d', { locale: ja });
    } else {
      label = format(date, 'M月', { locale: ja });
    }

    ticks.push({ date, label, isWeekend });

    // 次の日付へ
    if (viewMode === 'day') {
      current.setDate(current.getDate() + 1);
    } else if (viewMode === 'week') {
      current.setDate(current.getDate() + 7);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }

  return ticks;
}

// タスクバーの位置を計算
export function calculateTaskBarPosition(
  task: GanttTask,
  dateRange: { start: Date; end: Date },
  containerWidth: number,
  rowHeight: number,
  rowIndex: number
): TaskBarPosition {
  // 日付を正規化（時刻を0時0分0秒にリセット）
  const taskStart = startOfDay(task.startDate);
  const taskEnd = startOfDay(task.endDate);
  const rangeStart = startOfDay(dateRange.start);

  const totalDays = differenceInDays(dateRange.end, dateRange.start);
  const startOffset = differenceInDays(taskStart, rangeStart);
  const duration = differenceInDays(taskEnd, taskStart) + 1;

  const dayWidth = containerWidth / totalDays;

  // タスクバーの余白（左右に少し空けるためのパディング）
  const padding = 4; // 4pxの余白

  // 開始日の左端（少し余白を空ける）から終了日の右端までの範囲
  const left = startOffset * dayWidth + padding;
  const width = duration * dayWidth - padding * 2;

  const top = rowIndex * rowHeight;

  return { left, width, top };
}

// ピクセル位置から日付を計算
export function pixelToDate(
  pixelX: number,
  containerWidth: number,
  dateRange: { start: Date; end: Date }
): Date {
  const totalDays = differenceInDays(dateRange.end, dateRange.start);
  const ratio = pixelX / containerWidth;
  const dayOffset = Math.round(ratio * totalDays);
  return addDays(dateRange.start, dayOffset);
}

// 日付から曜日を取得
export function getWeekday(date: Date): string {
  return format(date, 'EEE', { locale: ja });
}

// 日付をフォーマット
export function formatDate(date: Date): string {
  return format(date, 'yyyy/MM/dd (EEE)', { locale: ja });
}

// ステータスに応じた色を取得
export function getStatusColor(status: TaskStatus): string {
  return STATUS_COLORS[status] || STATUS_COLORS.not_started;
}

// 今日の位置を計算
export function calculateTodayPosition(
  dateRange: { start: Date; end: Date },
  containerWidth: number
): number | null {
  const today = startOfDay(new Date());
  if (today < dateRange.start || today > dateRange.end) {
    return null;
  }

  const totalDays = differenceInDays(dateRange.end, dateRange.start);
  const daysFromStart = differenceInDays(today, dateRange.start);
  return (daysFromStart / totalDays) * containerWidth;
}

// 期限超過かどうかを判定
export function isOverdue(task: GanttTask): boolean {
  if (task.status === 'completed') return false;
  const today = startOfDay(new Date());
  return task.endDate < today;
}

// 依存関係の解決
export interface DependencyConnection {
  from: GanttTask;
  to: GanttTask;
}

// タスクの依存関係を解決
export function resolveDependencies(tasks: GanttTask[]): DependencyConnection[] {
  const connections: DependencyConnection[] = [];
  const taskMap = new Map<string, GanttTask>();

  // タスクマップを作成
  tasks.forEach(task => taskMap.set(task.id, task));

  // 各タスクの依存関係をチェック
  tasks.forEach(task => {
    if (task.dependencies && task.dependencies.length > 0) {
      task.dependencies.forEach(depId => {
        const depTask = taskMap.get(depId);
        if (depTask) {
          connections.push({
            from: depTask,
            to: task
          });
        }
      });
    }
  });

  return connections;
}

// 循環参照のチェック
export function hasCyclicDependency(
  taskId: string,
  dependencies: string[],
  allTasks: GanttTask[]
): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const taskMap = new Map<string, GanttTask>();
  allTasks.forEach(task => taskMap.set(task.id, task));

  function dfs(currentId: string): boolean {
    visited.add(currentId);
    recursionStack.add(currentId);

    const currentTask = taskMap.get(currentId);
    if (currentTask && currentTask.dependencies) {
      for (const depId of currentTask.dependencies) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recursionStack.has(depId)) {
          return true; // 循環検出
        }
      }
    }

    recursionStack.delete(currentId);
    return false;
  }

  return dfs(taskId);
}
