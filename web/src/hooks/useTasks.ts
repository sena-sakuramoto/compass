// タスク取得・更新のカスタムフック（React Query + 楽観的更新）

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useCallback } from 'react';
import { listTasks, updateTask, moveTaskDates, type ListTasksParams } from '../lib/api';
import type { Task } from '../lib/types';
import { usePendingOverlay, applyPendingToTasks } from '../state/pendingOverlay';
import { applyServerTask } from '../state/guards';
import { toast } from '../lib/toast';
import { debounce } from '../lib/debounce';

/**
 * デバウンスされたinvalidateQueries
 * 短時間の連続更新による重複取得を防ぐ
 */
let debouncedInvalidate: ((queryClient: ReturnType<typeof useQueryClient>) => void) | null = null;

function getDebouncedInvalidate(): (queryClient: ReturnType<typeof useQueryClient>) => void {
  if (!debouncedInvalidate) {
    debouncedInvalidate = debounce((queryClient: ReturnType<typeof useQueryClient>) => {
      console.log('[useTasks] 🔄 Invalidating tasks query (debounced)');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }, 500); // 500ms デバウンス
  }
  return debouncedInvalidate;
}

/**
 * タスク一覧を取得するカスタムフック
 * Pending Overlayを適用した結果を返す
 */
export function useTasks(params: ListTasksParams) {
  const pending = usePendingOverlay((state) => state.pending);

  const query = useQuery({
    queryKey: ['tasks', params],
    queryFn: async () => {
      const result = await listTasks(params);
      return result.tasks;
    },
    staleTime: 30_000, // 30秒間はキャッシュを使用（無駄な再取得を防ぐ）
    refetchOnWindowFocus: false, // フォーカス時の自動再取得を無効化
    refetchOnReconnect: true, // 再接続時は再取得
  });

  // pending変更を適用したタスクリストを返す（useMemoで不要な再計算を防ぐ）
  const tasksWithPending = useMemo(() => {
    return query.data ? applyPendingToTasks(query.data, pending) : undefined;
  }, [query.data, pending]);

  return {
    ...query,
    data: tasksWithPending,
    rawData: query.data, // pending適用前の生データも返す
  };
}

/**
 * タスク更新のカスタムフック（楽観的更新）
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { addPending, ackPending, rollbackPending } = usePendingOverlay();
  const invalidate = getDebouncedInvalidate();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Task> }) => {
      // 1. opIdを生成してpendingに追加（楽観的更新）
      const opId = addPending(id, payload);

      try {
        // 2. サーバーに更新リクエスト
        await updateTask(id, payload);

        // 3. ACK - pendingを解除
        ackPending(id, opId);

        // 4. クエリを再取得して最新状態に同期（デバウンス）
        invalidate(queryClient);

        return { ok: true, opId };
      } catch (error) {
        // 5. エラー時はロールバック
        rollbackPending(id);
        throw error;
      }
    },
    onError: (error, variables) => {
      console.error('[useUpdateTask] Error:', error);
      toast.error('タスクの更新に失敗しました');
    },
  });
}

/**
 * タスクの日付移動のカスタムフック（楽観的更新）
 */
export function useMoveTaskDates() {
  const queryClient = useQueryClient();
  const { addPending, ackPending, rollbackPending } = usePendingOverlay();
  const invalidate = getDebouncedInvalidate();

  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: { 予定開始日?: string | null; 期限?: string | null; start?: string | null; end?: string | null };
    }) => {
      // 1. opIdを生成してpendingに追加（楽観的更新）
      // null を undefined に変換
      const cleanPayload: Partial<Task> = {};
      if (payload.予定開始日 !== undefined) cleanPayload.予定開始日 = payload.予定開始日 || undefined;
      if (payload.期限 !== undefined) cleanPayload.期限 = payload.期限 || undefined;
      if (payload.start !== undefined) cleanPayload.start = payload.start || undefined;
      if (payload.end !== undefined) cleanPayload.end = payload.end || undefined;

      const opId = addPending(id, cleanPayload);

      try {
        // 2. サーバーに更新リクエスト
        await moveTaskDates(id, payload);

        // 3. ACK - pendingを解除
        ackPending(id, opId);

        // 4. クエリを再取得して最新状態に同期（デバウンス）
        invalidate(queryClient);

        return { ok: true, opId };
      } catch (error) {
        // 5. エラー時はロールバック
        rollbackPending(id);
        throw error;
      }
    },
    onError: (error, variables) => {
      console.error('[useMoveTaskDates] Error:', error);
      toast.error('タスクの移動に失敗しました');
    },
  });
}

/**
 * タスクを楽観的に更新するヘルパー関数
 * キャッシュを直接更新して即座にUIに反映
 */
export function optimisticallyUpdateTask(
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string,
  updates: Partial<Task>
) {
  queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (oldTasks) => {
    if (!oldTasks) return oldTasks;

    return oldTasks.map((task) => {
      if (task.id === taskId) {
        return { ...task, ...updates, updatedAt: new Date().toISOString() };
      }
      return task;
    });
  });
}
