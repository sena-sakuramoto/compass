// Pending Overlay: 楽観的更新の状態管理
// タスク編集時に即座にUIを更新し、サーバーからのACKが来るまで編集後の状態を維持

import { create } from 'zustand';
import type { Task } from '../lib/types';

export interface PendingChange {
  opId: string;                     // crypto.randomUUID()
  fields: Partial<Task>;            // 変更差分
  startedAt: number;                // Date.now()
  lockUntil: number;                // startedAt + 3000ms など
}

export type PendingMap = Record<string, PendingChange | undefined>;

interface PendingOverlayState {
  pending: PendingMap;

  // タスクにpending変更を追加
  addPending: (taskId: string, fields: Partial<Task>, lockDuration?: number) => string;

  // opIdによるACK（確認）- pending解除
  ackPending: (taskId: string, opId: string) => void;

  // タスクのpending変更をロールバック
  rollbackPending: (taskId: string) => void;

  // タスクのpending変更を取得
  getPending: (taskId: string) => PendingChange | undefined;

  // タスクにpendingがあるかチェック
  hasPending: (taskId: string) => boolean;

  // 期限切れのpendingをクリーンアップ
  cleanupExpired: () => void;
}

export const usePendingOverlay = create<PendingOverlayState>((set, get) => ({
  pending: {},

  addPending: (taskId: string, fields: Partial<Task>, lockDuration = 30000) => {
    const opId = crypto.randomUUID();
    const now = Date.now();

    set((state) => ({
      pending: {
        ...state.pending,
        [taskId]: {
          opId,
          fields,
          startedAt: now,
          lockUntil: now + lockDuration,
        },
      },
    }));

    return opId;
  },

  ackPending: (taskId: string, opId: string) => {
    const current = get().pending[taskId];

    // opIdが一致する場合のみACK
    if (current?.opId === opId) {
      set((state) => {
        const newPending = { ...state.pending };
        delete newPending[taskId];
        return { pending: newPending };
      });
    }
  },

  rollbackPending: (taskId: string) => {
    set((state) => {
      const newPending = { ...state.pending };
      delete newPending[taskId];
      return { pending: newPending };
    });
  },

  getPending: (taskId: string) => {
    return get().pending[taskId];
  },

  hasPending: (taskId: string) => {
    return !!get().pending[taskId];
  },

  cleanupExpired: () => {
    const now = Date.now();

    set((state) => {
      const newPending: PendingMap = {};
      let hasChanges = false;

      Object.entries(state.pending).forEach(([taskId, change]) => {
        if (change && now < change.lockUntil) {
          newPending[taskId] = change;
        } else if (change) {
          hasChanges = true;
        }
      });

      return hasChanges ? { pending: newPending } : state;
    });
  },
}));

// ヘルパー関数: タスクにpending変更を適用
export function applyPendingToTask(task: Task, pending?: PendingChange): Task {
  if (!pending) return task;

  return {
    ...task,
    ...pending.fields,
  };
}

// ヘルパー関数: タスクリストにpending変更を適用
export function applyPendingToTasks(tasks: Task[], pendingMap: PendingMap): Task[] {
  return tasks.map((task) => {
    const pending = pendingMap[task.id];
    return applyPendingToTask(task, pending);
  });
}

// 定期的に期限切れのpendingをクリーンアップ
if (typeof window !== 'undefined') {
  setInterval(() => {
    usePendingOverlay.getState().cleanupExpired();
  }, 5000); // 5秒ごと
}
