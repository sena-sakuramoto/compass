// タスクのソート関数（Pending Overlay対応）

import type { Task } from '../lib/types';
import type { PendingChange } from '../state/pendingOverlay';

/**
 * タスクの有効なキーを取得（pending変更を優先）
 * @param task タスク
 * @param pending pending変更
 * @param field フィールド名
 */
function getEffectiveValue<K extends keyof Task>(
  task: Task,
  pending: PendingChange | undefined,
  field: K
): Task[K] {
  // pending変更があればそちらを優先
  if (pending?.fields[field] !== undefined) {
    return pending.fields[field] as Task[K];
  }

  return task[field];
}

/**
 * タスクを開始日でソート（pending変更を加味）
 */
export function sortTasksByStartDate(
  tasks: Task[],
  pendingMap: Record<string, PendingChange | undefined>,
  order: 'asc' | 'desc' = 'asc'
): Task[] {
  return [...tasks].sort((a, b) => {
    const aPending = pendingMap[a.id];
    const bPending = pendingMap[b.id];

    // 有効な開始日を取得（pending優先）
    const aStart =
      getEffectiveValue(a, aPending, '予定開始日') ||
      getEffectiveValue(a, aPending, 'start') ||
      '';
    const bStart =
      getEffectiveValue(b, bPending, '予定開始日') ||
      getEffectiveValue(b, bPending, 'start') ||
      '';

    if (aStart < bStart) return order === 'asc' ? -1 : 1;
    if (aStart > bStart) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * タスクを終了日でソート（pending変更を加味）
 */
export function sortTasksByEndDate(
  tasks: Task[],
  pendingMap: Record<string, PendingChange | undefined>,
  order: 'asc' | 'desc' = 'asc'
): Task[] {
  return [...tasks].sort((a, b) => {
    const aPending = pendingMap[a.id];
    const bPending = pendingMap[b.id];

    // 有効な終了日を取得（pending優先）
    const aEnd =
      getEffectiveValue(a, aPending, '期限') ||
      getEffectiveValue(a, aPending, 'end') ||
      '';
    const bEnd =
      getEffectiveValue(b, bPending, '期限') ||
      getEffectiveValue(b, bPending, 'end') ||
      '';

    if (aEnd < bEnd) return order === 'asc' ? -1 : 1;
    if (aEnd > bEnd) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * タスクを更新日でソート（pending変更を加味）
 */
export function sortTasksByUpdatedAt(
  tasks: Task[],
  pendingMap: Record<string, PendingChange | undefined>,
  order: 'asc' | 'desc' = 'desc'
): Task[] {
  return [...tasks].sort((a, b) => {
    const aPending = pendingMap[a.id];
    const bPending = pendingMap[b.id];

    // 有効な更新日を取得（pending優先）
    const aUpdated = getEffectiveValue(a, aPending, 'updatedAt') || '';
    const bUpdated = getEffectiveValue(b, bPending, 'updatedAt') || '';

    if (aUpdated < bUpdated) return order === 'asc' ? -1 : 1;
    if (aUpdated > bUpdated) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * タスクをプロジェクトIDでグループ化してソート
 */
export function groupTasksByProject(
  tasks: Task[],
  pendingMap: Record<string, PendingChange | undefined>
): Record<string, Task[]> {
  const grouped: Record<string, Task[]> = {};

  tasks.forEach((task) => {
    const projectId = task.projectId;
    if (!grouped[projectId]) {
      grouped[projectId] = [];
    }
    grouped[projectId].push(task);
  });

  // 各グループ内を開始日でソート
  Object.keys(grouped).forEach((projectId) => {
    grouped[projectId] = sortTasksByStartDate(grouped[projectId], pendingMap);
  });

  return grouped;
}

/**
 * タスクの安定したキーを生成（仮想リスト用）
 * IDを使用して、並び替えやpending変更に関わらず一貫性を保つ
 */
export function getStableTaskKey(task: Task): string {
  return task.id;
}
