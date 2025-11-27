import type { Task } from './types';
import type { QuickFilters, GroupByOption } from '../components/Filters';

/**
 * クイックフィルタを適用してタスクをフィルタリング
 */
export function applyQuickFilters(tasks: Task[], filters: QuickFilters): Task[] {
  let filtered = [...tasks];

  // 優先度フィルタ
  if (filters.priority) {
    filtered = filtered.filter(task => task.優先度 === filters.priority);
  }

  // スプリントフィルタ
  if (filters.sprint) {
    filtered = filtered.filter(task => task.スプリント === filters.sprint);
  }

  // 期限超過フィルタ
  if (filters.overdue) {
    const today = new Date().toISOString().split('T')[0];
    filtered = filtered.filter(task => {
      if (!task.期限 || task.ステータス === '完了') return false;
      return task.期限 < today;
    });
  }

  // 期限7日以内フィルタ
  if (filters.dueSoon) {
    const now = new Date();
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    filtered = filtered.filter(task => {
      if (!task.期限 || task.ステータス === '完了') return false;
      const dueDate = new Date(task.期限);
      return dueDate >= now && dueDate <= sevenDaysLater;
    });
  }

  return filtered;
}

/**
 * タスクをグループ化
 */
export function groupTasks(tasks: Task[], groupBy: GroupByOption): Record<string, Task[]> {
  if (!groupBy) {
    return { '全て': tasks };
  }

  const grouped: Record<string, Task[]> = {};

  tasks.forEach(task => {
    let key: string;
    switch (groupBy) {
      case 'project':
        key = task.projectId || '未割り当て';
        break;
      case 'assignee':
        key = task.assignee || task.担当者 || '未割り当て';
        break;
      case 'status':
        key = task.ステータス || '未着手';
        break;
      case 'priority':
        key = task.優先度 || '未設定';
        break;
      case 'sprint':
        key = task.スプリント || '未設定';
        break;
      default:
        key = '全て';
    }

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(task);
  });

  return grouped;
}

/**
 * ユニークなスプリント一覧を取得
 */
export function getUniqueSprints(tasks: Task[]): string[] {
  const sprints = new Set<string>();
  tasks.forEach(task => {
    if (task.スプリント) {
      sprints.add(task.スプリント);
    }
  });
  return Array.from(sprints).sort();
}
