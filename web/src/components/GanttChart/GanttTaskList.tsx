// タスク一覧コンポーネント（左側固定）

import React, { useState, useEffect } from 'react';
import type { GanttTask } from './types';
import type { ProjectMilestone } from './GanttTimeline';

interface GanttTaskListProps {
  tasks: GanttTask[];
  rowHeight: number;
  onTaskClick?: (task: GanttTask) => void;
  onTaskToggleComplete?: (task: GanttTask) => void;
  onProjectClick?: (projectId: string) => void;
  scrollTop?: number;
  projectMap?: Record<string, { 物件名?: string; ステータス?: string;[key: string]: any }>;
  projectMilestones?: ProjectMilestone[];
}

export const GanttTaskList: React.FC<GanttTaskListProps> = ({
  tasks,
  rowHeight,
  onTaskClick,
  onTaskToggleComplete,
  onProjectClick,
  scrollTop = 0,
  projectMap = {},
  projectMilestones = []
}) => {
  // ローカル完了状態管理（即座にUIを更新するため）
  const [localCompletedStates, setLocalCompletedStates] = useState<Record<string, boolean>>({});
  // ハイライト表示用のstate
  const [highlightedTaskIds, setHighlightedTaskIds] = useState<Set<string>>(new Set());

  // tasksが変更されたら、ローカル状態をリセット
  useEffect(() => {
    const newStates: Record<string, boolean> = {};
    tasks.forEach(task => {
      newStates[task.id] = task.status === 'completed';
    });
    setLocalCompletedStates(newStates);
  }, [tasks]);

  // タスクマップを作成
  const taskMap = new Map<string, GanttTask>();
  tasks.forEach(task => taskMap.set(task.id, task));

  // このタスクが依存しているタスクで未完了のものをチェックする関数
  const hasIncompleteDependencies = (task: GanttTask): GanttTask[] => {
    // このタスクが依存しているタスクを探す
    if (!task.dependencies || task.dependencies.length === 0) return [];
    return task.dependencies
      .map(depId => taskMap.get(depId))
      .filter(t => {
        if (!t) return false;
        // localCompletedStatesがあればそれを使用、なければサーバー状態を使用
        const isCompleted = localCompletedStates[t.id] ?? (t.status === 'completed');
        return !isCompleted; // 未完了のタスクのみを含める
      }) as GanttTask[];
  };
  // プロジェクトごとにグループ化（タスクがないプロジェクトも含める）
  const projectGroups: { projectId: string; projectName: string; projectStatus?: string; tasks: GanttTask[] }[] = [];
  let currentProjectId: string | null = null;
  const projectsWithTasks = new Set<string>();

  tasks.forEach(task => {
    if (task.projectId !== currentProjectId) {
      currentProjectId = task.projectId;
      projectsWithTasks.add(task.projectId);
      const project = projectMap[task.projectId];
      projectGroups.push({
        projectId: task.projectId,
        projectName: task.projectName,
        projectStatus: project?.ステータス,
        tasks: []
      });
    }
    projectGroups[projectGroups.length - 1].tasks.push(task);
  });

  // タスクがないプロジェクトもマイルストーンがあれば追加
  if (projectMilestones.length > 0) {
    const projectsWithMilestones = new Set(projectMilestones.map(m => m.projectId));

    projectsWithMilestones.forEach(projectId => {
      if (!projectsWithTasks.has(projectId) && projectMap[projectId]) {
        const project = projectMap[projectId];
        projectGroups.push({
          projectId,
          projectName: project.物件名 || projectId,
          projectStatus: project.ステータス,
          tasks: []
        });
      }
    });
  }

  return (
    <div className="border-r border-slate-200 bg-white">
      {/* ヘッダー（時間軸と同じ64px、スクロールしても常に表示） */}
      <div className="sticky top-0 border-b border-slate-200 bg-slate-50 flex items-center px-4 text-xs font-semibold text-slate-600" style={{ height: '64px', zIndex: 30 }}>
        <div className="w-8"></div>
        <div className="flex-1">タスク名</div>
        <div className="w-20 text-center">担当</div>
        <div className="w-16 text-center">進捗</div>
      </div>

      {/* タスクリスト（プロジェクトごとにグループ化） */}
      <div className="overflow-hidden">
        {projectGroups.map((group) => (
          <div key={group.projectId}>
            {/* プロジェクトヘッダー（タイムラインと同じ32px） */}
            <div className="bg-slate-100/50 border-b border-slate-200 flex items-center justify-between px-4" style={{ height: '32px' }}>
              <span
                className={`text-xs font-semibold text-slate-700 ${onProjectClick ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                onClick={() => onProjectClick && onProjectClick(group.projectId)}
              >
                {group.projectName}
              </span>
              {group.projectStatus && (
                <span className={`text-xs px-2 py-0.5 rounded ${group.projectStatus === '施工中' || group.projectStatus === '工事中'
                    ? 'bg-blue-100 text-blue-700'
                    : group.projectStatus === '完了'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                  {group.projectStatus}
                </span>
              )}
            </div>

            {/* プロジェクト内のタスク */}
            {group.tasks.map((task, index) => {
              // ローカル状態を優先的に使用
              const isCompleted = localCompletedStates[task.id] ?? (task.status === 'completed');
              const incompleteDeps = hasIncompleteDependencies(task);
              const cannotComplete = !isCompleted && incompleteDeps.length > 0;
              const isHighlighted = highlightedTaskIds.has(task.id);

              return (
                <div
                  key={task.id}
                  id={`task-row-${task.id}`}
                  className={`flex items-center px-4 border-b border-slate-100 transition-all ${isCompleted ? 'opacity-60' : ''
                    } ${isHighlighted ? 'bg-amber-100 animate-pulse' : 'hover:bg-slate-50'
                    }`}
                  style={{ height: `${rowHeight}px` }}
                >
                  {/* チェックボックス */}
                  <div className="w-8 relative group">
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      disabled={cannotComplete}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (cannotComplete) return;
                        // まずローカル状態を即座に更新（UI反映）
                        const newCompleted = !isCompleted;
                        setLocalCompletedStates(prev => ({
                          ...prev,
                          [task.id]: newCompleted
                        }));
                        // その後、非同期で保存処理
                        setTimeout(() => {
                          onTaskToggleComplete?.(task);
                        }, 0);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (cannotComplete) {
                          // 依存タスクをハイライト表示
                          const depIds = new Set(incompleteDeps.map(d => d.id));
                          setHighlightedTaskIds(depIds);

                          // 最初の依存タスクにスクロール
                          if (incompleteDeps[0]) {
                            const element = document.getElementById(`task-row-${incompleteDeps[0].id}`);
                            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }

                          // 3秒後にハイライト解除
                          setTimeout(() => {
                            setHighlightedTaskIds(new Set());
                          }, 3000);
                        }
                      }}
                      className={`w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 ${cannotComplete ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                        }`}
                    />
                    {/* ツールチップ */}
                    {cannotComplete && (
                      <div className="hidden group-hover:block absolute left-6 top-0 z-50 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-900 shadow-lg whitespace-nowrap">
                        <div className="font-semibold mb-1">先に完了が必要：</div>
                        {incompleteDeps.map(dep => (
                          <div key={dep.id}>・{dep.name}</div>
                        ))}
                        <div className="text-[10px] text-amber-700 mt-1">クリックで該当タスクへ移動</div>
                      </div>
                    )}
                  </div>

                  {/* タスク名 */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onTaskClick?.(task)}>
                    <div className={`text-sm font-medium text-slate-700 truncate ${isCompleted ? 'line-through' : ''
                      }`}>
                      {task.name}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {task.projectName}
                    </div>
                  </div>

                  {/* 担当者 */}
                  <div className="w-20 text-center">
                    {task.assigneeAvatar ? (
                      <img
                        src={task.assigneeAvatar}
                        alt={task.assignee}
                        className="w-6 h-6 rounded-full mx-auto"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center mx-auto text-xs font-medium text-slate-600">
                        {task.assignee ? task.assignee.charAt(0) : '?'}
                      </div>
                    )}
                  </div>

                  {/* 進捗 */}
                  <div className="w-16 text-center">
                    <span className="text-xs font-medium text-slate-600">
                      {task.progress}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-slate-400">
            タスクがありません
          </div>
        )}

        {/* 一番下に空白のプロジェクト行を追加（マイルストーンのラベルが見切れるのを防ぐ） */}
        <div className="bg-slate-100/50 border-b border-slate-200" style={{ height: '32px' }}></div>
      </div>
    </div>
  );
};
