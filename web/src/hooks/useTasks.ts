// タスク取得・更新のカスタムフック（React Query + 楽観的更新 + IndexedDBキャッシュ）

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { listTasks, updateTask, moveTaskDates, type ListTasksParams } from '../lib/api';
import type { Task } from '../lib/types';
import { usePendingOverlay, applyPendingToTasks } from '../state/pendingOverlay';
import { applyServerTask } from '../state/guards';
import { toast } from '../lib/toast';
import { debounce } from '../lib/debounce';
import {
  cacheGet,
  cacheSet,
  cacheDeleteByPrefix,
  CACHE_KEY_TASKS,
  TTL_SHORT,
  STALE_TIME_SHORT,
} from '../lib/cache';

/**
 * パラメータ値を正規化する。
 * '', 'all', undefined, null → すべて undefined（=フィルタなし）として扱う。
 * これにより同じ意味のパラメータで異なるキーが生成される問題を防止。
 */
function norm(v: string | undefined): string | undefined {
  if (!v || v === 'all') return undefined;
  return v;
}

/**
 * タスクキャッシュのキーを生成（パラメータを含む）
 * キー順序は固定（アルファベット順）で安定化済み。
 */
function buildTasksCacheKey(params: ListTasksParams): string {
  // アルファベット順で固定。norm で 'all' / '' / undefined を統一
  const entries: [string, string | undefined][] = [
    ['a', norm(params.assignee)],
    ['ae', norm(params.assigneeEmail)],
    ['f', norm(params.from)],
    ['p', norm(params.projectId)],
    ['q', norm(params.q)],
    ['s', norm(params.status)],
    ['t', norm(params.to)],
  ];
  const parts = [CACHE_KEY_TASKS];
  for (const [k, v] of entries) {
    if (v) parts.push(`${k}:${v}`);
  }
  return parts.join('|');
}

/**
 * デバウンスされたinvalidateQueries
 * 短時間の連続更新による重複取得を防ぐ
 */
let debouncedInvalidate: ((queryClient: ReturnType<typeof useQueryClient>) => void) | null = null;

function getDebouncedInvalidate(): (queryClient: ReturnType<typeof useQueryClient>) => void {
  if (!debouncedInvalidate) {
    debouncedInvalidate = debounce((queryClient: ReturnType<typeof useQueryClient>) => {
      console.log('[useTasks] Invalidating tasks query (debounced)');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }, 500); // 500ms デバウンス
  }
  return debouncedInvalidate;
}

/**
 * タスク一覧を取得するカスタムフック
 * Pending Overlayを適用した結果を返す
 * IndexedDBキャッシュから初回データを即座に表示
 */
export function useTasks(params: ListTasksParams) {
  const pending = usePendingOverlay((state) => state.pending);
  const [cachedInitialData, setCachedInitialData] = useState<Task[] | undefined>(undefined);
  const cacheKeyRef = useRef(buildTasksCacheKey(params));
  const initialLoadedRef = useRef(false);

  // パラメータ変更時にキャッシュキーを更新
  useEffect(() => {
    cacheKeyRef.current = buildTasksCacheKey(params);
  }, [params]);

  // IndexedDBからキャッシュを非同期でロード（初回のみ）
  useEffect(() => {
    if (initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    const key = buildTasksCacheKey(params);
    cacheGet<Task[]>(key).then((data) => {
      if (data && data.length > 0) {
        setCachedInitialData(data);
      }
    }).catch(() => {});
  }, []); // 初回マウント時のみ

  const query = useQuery({
    queryKey: ['tasks', params],
    queryFn: async () => {
      const result = await listTasks(params);
      // 取得成功時にIndexedDBキャッシュを更新（バックグラウンド）
      const key = buildTasksCacheKey(params);
      cacheSet(key, result.tasks, TTL_SHORT).catch(() => {});
      return result.tasks;
    },
    staleTime: STALE_TIME_SHORT, // 30秒間はキャッシュを使用（無駄な再取得を防ぐ）
    refetchOnWindowFocus: false, // フォーカス時の自動再取得を無効化
    refetchOnReconnect: true, // 再接続時は再取得
    // IndexedDBキャッシュがあれば初期データとして使用
    ...(cachedInitialData ? { initialData: cachedInitialData } : {}),
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

        // 4. IndexedDBキャッシュを無効化
        invalidateTasksCache();

        // 5. クエリを再取得して最新状態に同期（デバウンス）
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

        // 4. IndexedDBキャッシュを無効化
        invalidateTasksCache();

        // 5. クエリを再取得して最新状態に同期（デバウンス）
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

/**
 * タスクのIndexedDBキャッシュを無効化する
 * "tasks" プレフィックスに一致する全キー（"tasks|p:xxx" 等）を削除
 */
export async function invalidateTasksCache(): Promise<void> {
  try {
    await cacheDeleteByPrefix(CACHE_KEY_TASKS);
  } catch {
    // ignore
  }
}
