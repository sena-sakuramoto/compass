/**
 * Ganttチャートでの楽観的更新の実装例
 *
 * このファイルは、既存のGanttチャートコンポーネントに
 * 楽観的更新を統合する方法を示すサンプルコードです。
 */

import React, { useState } from 'react';
import { useTasks, useUpdateTask, useMoveTaskDates } from '../hooks/useTasks';
import { usePendingOverlay } from '../state/pendingOverlay';
import type { GanttTask } from '../components/GanttChart/GanttChart';
import type { TaskStatus } from '../components/GanttChart/types';
import { TaskEditModal } from '../components/GanttChart/TaskEditModal';

interface GanttChartWithOptimisticUpdateProps {
  projectId: string;
}

export function GanttChartWithOptimisticUpdate({ projectId }: GanttChartWithOptimisticUpdateProps) {
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);

  // タスク一覧を取得（pending適用済み）
  const { data: tasks, isLoading } = useTasks({ projectId });

  // タスク更新のmutation
  const updateTaskMutation = useUpdateTask();
  const moveTaskDatesMutation = useMoveTaskDates();

  // Pending状態の管理
  const { hasPending, getPending } = usePendingOverlay();

  /**
   * タスクの保存処理（TaskEditModalから呼ばれる）
   */
  const handleTaskSave = async (updatedTask: GanttTask & { assigneeEmail?: string }) => {
    try {
      // 楽観的更新を実行
      await updateTaskMutation.mutateAsync({
        id: updatedTask.id,
        payload: {
          タスク名: updatedTask.name,
          担当者: updatedTask.assignee,
          担当者メール: updatedTask.assigneeEmail,
          予定開始日: updatedTask.startDate.toISOString().split('T')[0],
          期限: updatedTask.endDate.toISOString().split('T')[0],
          ステータス: updatedTask.status,
          優先度: updatedTask.priority,
          '工数見積(h)': updatedTask.estimatedHours,
          '依存タスク': updatedTask.dependencies,
          '通知設定': updatedTask.notificationSettings,
          マイルストーン: updatedTask.milestone,
        },
      });

      // モーダルを閉じる
      setEditingTask(null);
    } catch (error) {
      console.error('タスク保存エラー:', error);
      // エラーは useUpdateTask 内でトーストで表示される
    }
  };

  /**
   * タスクの日付移動処理（ドラッグ&ドロップ）
   */
  const handleTaskDateMove = async (task: GanttTask, newStartDate: Date, newEndDate: Date) => {
    try {
      // 楽観的更新を実行
      await moveTaskDatesMutation.mutateAsync({
        id: task.id,
        payload: {
          予定開始日: newStartDate.toISOString().split('T')[0],
          期限: newEndDate.toISOString().split('T')[0],
        },
      });
    } catch (error) {
      console.error('タスク移動エラー:', error);
      // エラーは useMoveTaskDates 内でトーストで表示される
    }
  };

  /**
   * タスクのコピー処理（Altキー + ドラッグ&ドロップ）
   */
  const handleTaskCopy = async (task: GanttTask, newStartDate: Date, newEndDate: Date) => {
    // タスクのコピーは新規作成なので、通常のAPI呼び出し
    // 楽観的更新は不要（新規作成なので競合がない）
    console.log('タスクコピー:', task, newStartDate, newEndDate);
    // 実装例：createTask API を呼び出し
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">読み込み中...</div>;
  }

  if (!tasks || tasks.length === 0) {
    return <div className="text-center text-gray-500 py-8">タスクがありません</div>;
  }

  // Task[] を GanttTask[] に変換
  const ganttTasks: GanttTask[] = tasks.map((task) => {
    const pending = getPending(task.id);

    // ステータスをTaskStatus型に変換
    const statusMap: Record<string, TaskStatus> = {
      '未着手': 'not_started',
      '進行中': 'in_progress',
      '保留': 'on_hold',
      '完了': 'completed',
      '期限超過': 'overdue',
    };

    return {
      id: task.id,
      projectId: task.projectId,
      projectName: '', // プロジェクト名は別途取得が必要
      name: task.タスク名,
      assignee: task.担当者 || task.assignee || '',
      startDate: new Date(task.予定開始日 || task.start || new Date()),
      endDate: new Date(task.期限 || task.end || new Date()),
      status: (statusMap[task.ステータス] || 'not_started') as TaskStatus,
      priority: task.優先度 || '中',
      progress: task.progress || task.進捗率 || 0,
      estimatedHours: task['工数見積(h)'],
      dependencies: task['依存タスク'] || [],
      notificationSettings: task['通知設定'],
      milestone: task.マイルストーン || task.milestone || false,
      // pending中かどうかのフラグ
      isPending: !!pending && Date.now() < pending.lockUntil,
    };
  });

  return (
    <div className="relative">
      {/* Ganttチャート本体 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        {ganttTasks.map((task) => (
          <GanttTaskRow
            key={task.id}
            task={task}
            onUpdate={handleTaskDateMove}
            onCopy={handleTaskCopy}
            onClick={() => setEditingTask(task)}
          />
        ))}
      </div>

      {/* タスク編集モーダル */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          allTasks={ganttTasks}
          onClose={() => setEditingTask(null)}
          onSave={handleTaskSave}
          onDelete={async (task) => {
            // 削除処理
            console.log('タスク削除:', task);
          }}
        />
      )}

      {/* 全体の同期状態インジケーター */}
      <SyncStatusIndicator tasks={ganttTasks} />
    </div>
  );
}

/**
 * Ganttタスク行コンポーネント（簡略版）
 */
interface GanttTaskRowProps {
  task: GanttTask;
  onUpdate: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  onCopy: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  onClick: (task: GanttTask) => void;
}

function GanttTaskRow({ task, onUpdate, onCopy, onClick }: GanttTaskRowProps) {
  return (
    <div
      className={`
        flex items-center gap-4 p-3 border-b border-gray-100
        hover:bg-gray-50 cursor-pointer transition-colors
        ${task.isPending ? 'bg-blue-50 border-blue-200' : ''}
      `}
      onClick={() => onClick(task)}
    >
      {/* タスク名 */}
      <div className="flex-1">
        <div className="font-medium text-gray-900">{task.name}</div>
        <div className="text-sm text-gray-500">{task.assignee}</div>
      </div>

      {/* 日付 */}
      <div className="text-sm text-gray-600">
        {task.startDate.toLocaleDateString('ja-JP')} → {task.endDate.toLocaleDateString('ja-JP')}
      </div>

      {/* 同期中バッジ */}
      {task.isPending && (
        <div className="flex items-center gap-1 text-xs text-blue-600">
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          同期中...
        </div>
      )}
    </div>
  );
}

/**
 * 全体の同期状態インジケーター
 */
function SyncStatusIndicator({ tasks }: { tasks: GanttTask[] }) {
  const pendingCount = tasks.filter((task) => task.isPending).length;

  if (pendingCount === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-600 text-white rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="text-sm font-medium">{pendingCount}件のタスクを同期中...</span>
    </div>
  );
}

/**
 * 使用例:
 *
 * import { GanttChartWithOptimisticUpdate } from './examples/GanttChartWithOptimisticUpdate.example';
 *
 * function ProjectPage({ projectId }: { projectId: string }) {
 *   return (
 *     <div>
 *       <h1>プロジェクト工程表</h1>
 *       <GanttChartWithOptimisticUpdate projectId={projectId} />
 *     </div>
 *   );
 * }
 */
