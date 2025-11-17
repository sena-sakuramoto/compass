// タスク取得・更新のカスタムフック（React Query + 楽観的更新）

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listTasks, updateTask, moveTaskDates, type ListTasksParams } from '../lib/api';
import type { Task } from '../lib/types';
import { usePendingOverlay, applyPendingToTasks } from '../state/pendingOverlay';
import { applyServerTask } from '../state/guards';
import { toast } from '../lib/toast';

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
    staleTime: 10_000, // 10秒間はキャッシュを使用
    refetchOnWindowFocus: false, // フォーカス時の自動再取得を無効化
    refetchOnReconnect: true, // 再接続時は再取得
  });

  // pending変更を適用したタスクリストを返す
  const tasksWithPending = query.data ? applyPendingToTasks(query.data, pending) : undefined;

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

  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Task> }) => {
      // 1. opIdを生成してpendingに追加（楽観的更新）
      const opId = addPending(id, payload);

      try {
        // 2. サーバーに更新リクエスト
        await updateTask(id, payload);

        // 3. ACK - pendingを解除
        ackPending(id, opId);

        // 4. クエリを再取得して最新状態に同期
        await queryClient.invalidateQueries({ queryKey: ['tasks'] });

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

        // 4. クエリを再取得して最新状態に同期
        await queryClient.invalidateQueries({ queryKey: ['tasks'] });

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
