// サーバー更新のガード関数
// 楽観的更新中のタスクに対するサーバー更新の適用を制御

import type { Task } from '../lib/types';
import type { PendingChange } from './pendingOverlay';

/**
 * サーバーからの更新を適用すべきかどうかを判定
 *
 * @param local ローカルのタスク（現在のUI上のタスク）
 * @param incoming サーバーから受信したタスク
 * @param pending pending中の変更
 * @returns true: 適用する, false: 破棄する
 */
export function shouldApplyServerUpdate(
  local: Task | undefined,
  incoming: Task,
  pending?: PendingChange
): boolean {
  // ローカルタスクがない場合は常に適用
  if (!local) return true;

  // 1. updatedAt で後勝ち判定
  if (local.updatedAt && incoming.updatedAt) {
    const localTime = new Date(local.updatedAt).getTime();
    const incomingTime = new Date(incoming.updatedAt).getTime();

    // サーバーの更新が古い場合は破棄
    if (incomingTime < localTime) {
      console.log('[guards] Rejecting server update: older updatedAt', {
        taskId: incoming.id,
        localUpdatedAt: local.updatedAt,
        incomingUpdatedAt: incoming.updatedAt,
      });
      return false;
    }
  }

  // 2. pending が生きている間は、同一フィールドが"編集前に戻る"回帰を禁止
  if (pending && Date.now() < pending.lockUntil) {
    // pending.fields に含まれるフィールドをチェック
    const regressingFields: string[] = [];

    Object.entries(pending.fields).forEach(([key, pendingValue]) => {
      const incomingValue = (incoming as any)[key];
      const localValue = (local as any)[key];

      // pendingで変更したフィールドが、サーバー更新で元の値に戻ろうとしている
      if (incomingValue !== pendingValue && incomingValue === localValue) {
        regressingFields.push(key);
      }
    });

    if (regressingFields.length > 0) {
      console.log('[guards] Rejecting server update: regression detected', {
        taskId: incoming.id,
        regressingFields,
        pendingOpId: pending.opId,
        lockUntil: new Date(pending.lockUntil).toISOString(),
      });
      return false;
    }
  }

  return true;
}

/**
 * サーバーから受信したタスクをローカルのタスクリストに適用
 *
 * @param tasks 現在のタスクリスト
 * @param serverTask サーバーから受信したタスク
 * @param pending pending中の変更マップ
 * @returns 更新されたタスクリスト
 */
export function applyServerTask(
  tasks: Task[] | undefined,
  serverTask: Task,
  pending?: PendingChange
): Task[] {
  if (!tasks) return [serverTask];

  const existingIndex = tasks.findIndex((t) => t.id === serverTask.id);

  // タスクが存在しない場合は追加
  if (existingIndex === -1) {
    return [...tasks, serverTask];
  }

  // タスクが存在する場合は、shouldApplyServerUpdate で判定
  const localTask = tasks[existingIndex];

  if (!shouldApplyServerUpdate(localTask, serverTask, pending)) {
    // サーバー更新を破棄
    return tasks;
  }

  // サーバー更新を適用
  const newTasks = [...tasks];
  newTasks[existingIndex] = serverTask;
  return newTasks;
}

/**
 * 日付フィールドの回帰をチェック
 * 特定のフィールド（開始日・終了日など）が編集前の値に戻ろうとしているかを判定
 */
export function checkDateRegression(
  incoming: Task,
  pending: PendingChange
): boolean {
  const dateFields = ['予定開始日', '期限', 'start', 'end'];

  for (const field of dateFields) {
    const pendingValue = (pending.fields as any)[field];
    const incomingValue = (incoming as any)[field];

    // pendingで変更したが、サーバーから異なる値が来た
    if (pendingValue !== undefined && incomingValue !== pendingValue) {
      return true;
    }
  }

  return false;
}
