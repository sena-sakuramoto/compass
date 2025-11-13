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
export function calculateDateRange(
  tasks: GanttTask[],
  previousRange?: { start: Date; end: Date }
): { start: Date; end: Date } {
  const today = startOfDay(new Date());

  // 工程表なので未来重視：今日から前20日、後100日（約1/6の位置）
  let newStart = addDays(today, -20);
  let newEnd = addDays(today, 100);

  // タスクがある場合、範囲外のタスクも含めるように拡張
  if (tasks.length > 0) {
    const dates = tasks.flatMap(task => [task.startDate, task.endDate]);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // タスクが範囲外にある場合のみ、範囲を拡張
    if (minDate < newStart) {
      newStart = startOfDay(addDays(minDate, -7)); // タスク最小日の7日前
    }
    if (maxDate > newEnd) {
      newEnd = endOfDay(addDays(maxDate, 7)); // タスク最大日の7日後
    }
  }

  // 既存の範囲がある場合は、それを拡張するだけ（縮小しない）
  if (previousRange) {
    return {
      start: newStart < previousRange.start ? newStart : previousRange.start,
      end: newEnd > previousRange.end ? newEnd : previousRange.end
    };
  }

  return { start: newStart, end: newEnd };
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
  const rangeEnd = startOfDay(dateRange.end);

  // 表示列数は ticks.length と一致させるため +1 日の inclusive 幅にする
  const totalDaysInclusive = differenceInDays(rangeEnd, rangeStart) + 1;
  const dayWidth = containerWidth / totalDaysInclusive;

  const startOffset = differenceInDays(taskStart, rangeStart);
  const duration = differenceInDays(taskEnd, taskStart);

  // 日の境界線を基準にバーを配置
  // 開始日の0時（左境界）から終了日の24時（右境界）まで
  // durationが0（同日開始・終了）の場合は1日分の幅
  const left = startOffset * dayWidth;
  // 右端の1px食い込み防止: -1 で次の列に踏み出さないようにする
  const width = Math.max((duration + 1) * dayWidth - 1, 1);

  const top = rowIndex * rowHeight;

  // デバッグログ
  if (duration === 0) {
    console.log('[calculateTaskBarPosition] 1-day task:', {
      taskName: task.name,
      startDate: taskStart.toISOString().split('T')[0],
      endDate: taskEnd.toISOString().split('T')[0],
      duration,
      totalDaysInclusive,
      dayWidth,
      left,
      width,
      widthInDays: width / dayWidth
    });
  }

  return { left, width, top };
}

// ピクセル位置から日付を計算
export function pixelToDate(
  pixelX: number,
  containerWidth: number,
  dateRange: { start: Date; end: Date }
): Date {
  const rangeStart = startOfDay(dateRange.start);
  const rangeEnd = startOfDay(dateRange.end);
  // 表示列数は ticks.length と一致させるため +1 日の inclusive 幅にする
  const totalDaysInclusive = differenceInDays(rangeEnd, rangeStart) + 1;
  const ratio = pixelX / containerWidth;
  const dayOffset = Math.round(ratio * totalDaysInclusive);
  return addDays(rangeStart, dayOffset);
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
  const rangeStart = startOfDay(dateRange.start);
  const rangeEnd = startOfDay(dateRange.end);

  if (today < rangeStart || today > rangeEnd) {
    return null;
  }

  // 表示列数は ticks.length と一致させるため +1 日の inclusive 幅にする
  const totalDaysInclusive = differenceInDays(rangeEnd, rangeStart) + 1;
  const daysFromStart = differenceInDays(today, rangeStart);
  const dayWidth = containerWidth / totalDaysInclusive;

  // 本日の日付の左端（始まり）に配置
  return daysFromStart * dayWidth;
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
