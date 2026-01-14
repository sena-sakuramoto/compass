// Pending Overlay: 楽観的更新の状態管理
// タスク・プロジェクト編集時に即座にUIを更新し、サーバーからのACKが来るまで編集後の状態を維持

import { create } from 'zustand';
import type { Task, Project } from '../lib/types';

export interface PendingChange {
  opId: string;                     // crypto.randomUUID()
  fields: Partial<Task>;            // 変更差分
  startedAt: number;                // Date.now()
  lockUntil: number;                // startedAt + 3000ms など
}

export interface PendingProjectChange {
  opId: string;
  fields: Partial<Project>;
  startedAt: number;
  lockUntil: number;
}

export type PendingMap = Record<string, PendingChange | undefined>;
export type PendingProjectMap = Record<string, PendingProjectChange | undefined>;

// 削除済みアイテムの追跡
export interface PendingDeletion {
  opId: string;
  deletedAt: number;
  lockUntil: number;
}
export type PendingDeletionMap = Record<string, PendingDeletion | undefined>;

// 新規作成中のアイテム追跡（tempIdとrealIdのマッピング）
export interface PendingCreation {
  tempId: string;
  realId?: string;  // APIから返ってきた実際のID
  createdAt: number;
  lockUntil: number;
}
export type PendingCreationMap = Record<string, PendingCreation | undefined>;

interface PendingOverlayState {
  pending: PendingMap;
  pendingProjects: PendingProjectMap;
  deletedTasks: PendingDeletionMap;
  deletedProjects: PendingDeletionMap;
  creatingTasks: PendingCreationMap;  // 作成中のタスク

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

  // プロジェクトにpending変更を追加
  addPendingProject: (projectId: string, fields: Partial<Project>, lockDuration?: number) => string;

  // プロジェクトのACK
  ackPendingProject: (projectId: string, opId: string) => void;

  // プロジェクトのロールバック
  rollbackPendingProject: (projectId: string) => void;

  // 削除済みタスクを追加
  addDeletedTask: (taskId: string, lockDuration?: number) => string;

  // 削除済みタスクのACK
  ackDeletedTask: (taskId: string, opId: string) => void;

  // 削除済みタスクのロールバック
  rollbackDeletedTask: (taskId: string) => void;

  // タスクが削除済みかチェック
  isTaskDeleted: (taskId: string) => boolean;

  // 削除済みプロジェクトを追加
  addDeletedProject: (projectId: string, lockDuration?: number) => string;

  // 削除済みプロジェクトのACK
  ackDeletedProject: (projectId: string, opId: string) => void;

  // 削除済みプロジェクトのロールバック
  rollbackDeletedProject: (projectId: string) => void;

  // プロジェクトが削除済みかチェック
  isProjectDeleted: (projectId: string) => boolean;

  // 作成中タスクを追加（tempIdで登録）
  addCreatingTask: (tempId: string, lockDuration?: number) => void;

  // 作成中タスクにrealIdを設定（API成功時）
  setCreatingTaskRealId: (tempId: string, realId: string) => void;

  // 作成中タスクを完了（ACK）
  ackCreatingTask: (tempId: string) => void;

  // 作成中タスクをロールバック
  rollbackCreatingTask: (tempId: string) => void;

  // タスクが作成中かチェック（tempIdまたはrealIdで）
  isTaskCreating: (taskId: string) => boolean;

  // 期限切れのpendingをクリーンアップ
  cleanupExpired: () => void;
}

export const usePendingOverlay = create<PendingOverlayState>((set, get) => ({
  pending: {},
  pendingProjects: {},
  deletedTasks: {},
  deletedProjects: {},
  creatingTasks: {},

  addPending: (taskId: string, fields: Partial<Task>, lockDuration = 120000) => {
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

  // プロジェクト用
  addPendingProject: (projectId: string, fields: Partial<Project>, lockDuration = 120000) => {
    const opId = crypto.randomUUID();
    const now = Date.now();

    set((state) => ({
      pendingProjects: {
        ...state.pendingProjects,
        [projectId]: {
          opId,
          fields,
          startedAt: now,
          lockUntil: now + lockDuration,
        },
      },
    }));

    return opId;
  },

  ackPendingProject: (projectId: string, opId: string) => {
    const current = get().pendingProjects[projectId];

    if (current?.opId === opId) {
      set((state) => {
        const newPending = { ...state.pendingProjects };
        delete newPending[projectId];
        return { pendingProjects: newPending };
      });
    }
  },

  rollbackPendingProject: (projectId: string) => {
    set((state) => {
      const newPending = { ...state.pendingProjects };
      delete newPending[projectId];
      return { pendingProjects: newPending };
    });
  },

  // 削除済みタスクの追跡
  addDeletedTask: (taskId: string, lockDuration = 120000) => {
    const opId = crypto.randomUUID();
    const now = Date.now();

    set((state) => ({
      deletedTasks: {
        ...state.deletedTasks,
        [taskId]: {
          opId,
          deletedAt: now,
          lockUntil: now + lockDuration,
        },
      },
    }));

    return opId;
  },

  ackDeletedTask: (taskId: string, opId: string) => {
    const current = get().deletedTasks[taskId];
    if (current?.opId === opId) {
      set((state) => {
        const newDeleted = { ...state.deletedTasks };
        delete newDeleted[taskId];
        return { deletedTasks: newDeleted };
      });
    }
  },

  rollbackDeletedTask: (taskId: string) => {
    set((state) => {
      const newDeleted = { ...state.deletedTasks };
      delete newDeleted[taskId];
      return { deletedTasks: newDeleted };
    });
  },

  isTaskDeleted: (taskId: string) => {
    const deletion = get().deletedTasks[taskId];
    return deletion !== undefined && Date.now() < deletion.lockUntil;
  },

  // 削除済みプロジェクトの追跡
  addDeletedProject: (projectId: string, lockDuration = 120000) => {
    const opId = crypto.randomUUID();
    const now = Date.now();

    set((state) => ({
      deletedProjects: {
        ...state.deletedProjects,
        [projectId]: {
          opId,
          deletedAt: now,
          lockUntil: now + lockDuration,
        },
      },
    }));

    return opId;
  },

  ackDeletedProject: (projectId: string, opId: string) => {
    const current = get().deletedProjects[projectId];
    if (current?.opId === opId) {
      set((state) => {
        const newDeleted = { ...state.deletedProjects };
        delete newDeleted[projectId];
        return { deletedProjects: newDeleted };
      });
    }
  },

  rollbackDeletedProject: (projectId: string) => {
    set((state) => {
      const newDeleted = { ...state.deletedProjects };
      delete newDeleted[projectId];
      return { deletedProjects: newDeleted };
    });
  },

  isProjectDeleted: (projectId: string) => {
    const deletion = get().deletedProjects[projectId];
    return deletion !== undefined && Date.now() < deletion.lockUntil;
  },

  // 作成中タスクの追跡
  addCreatingTask: (tempId: string, lockDuration = 120000) => {
    const now = Date.now();
    set((state) => ({
      creatingTasks: {
        ...state.creatingTasks,
        [tempId]: {
          tempId,
          createdAt: now,
          lockUntil: now + lockDuration,
        },
      },
    }));
  },

  setCreatingTaskRealId: (tempId: string, realId: string) => {
    set((state) => {
      const existing = state.creatingTasks[tempId];
      if (!existing) return state;
      return {
        creatingTasks: {
          ...state.creatingTasks,
          [tempId]: { ...existing, realId },
        },
      };
    });
  },

  ackCreatingTask: (tempId: string) => {
    set((state) => {
      const newCreating = { ...state.creatingTasks };
      delete newCreating[tempId];
      return { creatingTasks: newCreating };
    });
  },

  rollbackCreatingTask: (tempId: string) => {
    set((state) => {
      const newCreating = { ...state.creatingTasks };
      delete newCreating[tempId];
      return { creatingTasks: newCreating };
    });
  },

  isTaskCreating: (taskId: string) => {
    const state = get();
    const now = Date.now();
    // tempIdまたはrealIdでチェック
    for (const creating of Object.values(state.creatingTasks)) {
      if (!creating) continue;
      if (now >= creating.lockUntil) continue;
      if (creating.tempId === taskId || creating.realId === taskId) {
        return true;
      }
    }
    return false;
  },

  cleanupExpired: () => {
    const now = Date.now();

    set((state) => {
      const newPending: PendingMap = {};
      const newPendingProjects: PendingProjectMap = {};
      const newDeletedTasks: PendingDeletionMap = {};
      const newDeletedProjects: PendingDeletionMap = {};
      const newCreatingTasks: PendingCreationMap = {};
      let hasChanges = false;

      Object.entries(state.pending).forEach(([taskId, change]) => {
        if (change && now < change.lockUntil) {
          newPending[taskId] = change;
        } else if (change) {
          hasChanges = true;
        }
      });

      Object.entries(state.pendingProjects).forEach(([projectId, change]) => {
        if (change && now < change.lockUntil) {
          newPendingProjects[projectId] = change;
        } else if (change) {
          hasChanges = true;
        }
      });

      Object.entries(state.deletedTasks).forEach(([taskId, deletion]) => {
        if (deletion && now < deletion.lockUntil) {
          newDeletedTasks[taskId] = deletion;
        } else if (deletion) {
          hasChanges = true;
        }
      });

      Object.entries(state.deletedProjects).forEach(([projectId, deletion]) => {
        if (deletion && now < deletion.lockUntil) {
          newDeletedProjects[projectId] = deletion;
        } else if (deletion) {
          hasChanges = true;
        }
      });

      Object.entries(state.creatingTasks).forEach(([tempId, creating]) => {
        if (creating && now < creating.lockUntil) {
          newCreatingTasks[tempId] = creating;
        } else if (creating) {
          hasChanges = true;
        }
      });

      return hasChanges
        ? {
            pending: newPending,
            pendingProjects: newPendingProjects,
            deletedTasks: newDeletedTasks,
            deletedProjects: newDeletedProjects,
            creatingTasks: newCreatingTasks,
          }
        : state;
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

// ヘルパー関数: プロジェクトにpending変更を適用
export function applyPendingToProject(project: Project, pending?: PendingProjectChange): Project {
  if (!pending) return project;

  return {
    ...project,
    ...pending.fields,
  };
}

// ヘルパー関数: プロジェクトリストにpending変更を適用
export function applyPendingToProjects(projects: Project[], pendingMap: PendingProjectMap): Project[] {
  return projects.map((project) => {
    const pending = pendingMap[project.id];
    return applyPendingToProject(project, pending);
  });
}

// 定期的に期限切れのpendingをクリーンアップ
if (typeof window !== 'undefined') {
  setInterval(() => {
    usePendingOverlay.getState().cleanupExpired();
  }, 5000); // 5秒ごと
}
