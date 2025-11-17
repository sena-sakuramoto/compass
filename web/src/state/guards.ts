// サーバー更新のガード関数
// 楽観的更新中のタスクに対するサーバー更新の適用を制御

import type { Task } from '../lib/types';
import type { PendingChange } from './pendingOverlay';

/**
 * ネストされたオブジェクトのパスから値を取得
 * 例: getPath(obj, 'a.b.c') → obj.a.b.c
 */
function getPath(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * フィールド単位で回帰（編集前の値に戻る）をチェック
 * ネストされたフィールドにも対応
 */
function regresses(incoming: Task, pending: PendingChange, local: Task): boolean {
  for (const [path, pendingValue] of Object.entries(pending.fields)) {
    const incomingValue = getPath(incoming, path);
    const localValue = getPath(local, path);

    // pendingで変更したが、incomingが元の値（編集前）に戻そうとしている
    if (incomingValue !== pendingValue && incomingValue === localValue) {
      console.log('[guards] Field regression detected', {
        path,
        pendingValue,
        incomingValue,
        localValue,
      });
      return true;
    }
  }
  return false;
}

/**
 * サーバーからの更新を適用すべきかどうかを判定（厳格版）
 *
 * @param local ローカルのタスク（現在のUI上のタスク）
 * @param incoming サーバーから受信したタスク
 * @param pending pending中の変更
 * @returns true: 適用する, false: 破棄する
 */
export function shouldApplyServerUpdate(
  local: Task | undefined,
  incoming: Task & { opId?: string },
  pending?: PendingChange
): boolean {
  const taskId = incoming.id;

  // ローカルタスクがない場合は常に適用
  if (!local) {
    console.log('[guards] Accepting server update: no local task', { taskId });
    return true;
  }

  // 1. version による厳格比較（version があれば最優先）
  if (local.version !== undefined && incoming.version !== undefined) {
    if (incoming.version < local.version) {
      console.log('[guards] ❌ Rejecting server update: older version', {
        taskId,
        localVersion: local.version,
        incomingVersion: incoming.version,
      });
      return false;
    }
    if (incoming.version > local.version) {
      console.log('[guards] ✅ Accepting server update: newer version', {
        taskId,
        localVersion: local.version,
        incomingVersion: incoming.version,
      });
      return true;
    }
    // version が同じ場合は opId ACK のみ許可
    if (incoming.version === local.version) {
      const isAck = pending && incoming.opId && pending.opId === incoming.opId;
      if (isAck) {
        console.log('[guards] ✅ Accepting server update: ACK with matching opId', {
          taskId,
          opId: incoming.opId,
        });
        return true;
      } else {
        console.log('[guards] ❌ Rejecting server update: same version without ACK', {
          taskId,
          version: incoming.version,
          incomingOpId: incoming.opId,
          pendingOpId: pending?.opId,
        });
        return false;
      }
    }
  }

  // 2. updatedAt による後勝ち判定
  if (local.updatedAt && incoming.updatedAt) {
    const localTime = new Date(local.updatedAt).getTime();
    const incomingTime = new Date(incoming.updatedAt).getTime();

    if (incomingTime < localTime) {
      console.log('[guards] ❌ Rejecting server update: older updatedAt', {
        taskId,
        localUpdatedAt: local.updatedAt,
        incomingUpdatedAt: incoming.updatedAt,
      });
      return false;
    }

    // updatedAt が同点の場合は拒否（同一時刻の競合を避ける）
    if (incomingTime === localTime) {
      const isAck = pending && incoming.opId && pending.opId === incoming.opId;
      if (!isAck) {
        console.log('[guards] ❌ Rejecting server update: same updatedAt without ACK', {
          taskId,
          updatedAt: incoming.updatedAt,
          incomingOpId: incoming.opId,
          pendingOpId: pending?.opId,
        });
        return false;
      }
    }
  }

  // 3. pending が生きている間は、フィールド単位の回帰を禁止
  if (pending && Date.now() < pending.lockUntil) {
    if (regresses(incoming, pending, local)) {
      console.log('[guards] ❌ Rejecting server update: field regression during pending', {
        taskId,
        pendingOpId: pending.opId,
        lockUntil: new Date(pending.lockUntil).toISOString(),
        remainingMs: pending.lockUntil - Date.now(),
      });
      return false;
    }
  }

  console.log('[guards] ✅ Accepting server update: all checks passed', { taskId });
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
