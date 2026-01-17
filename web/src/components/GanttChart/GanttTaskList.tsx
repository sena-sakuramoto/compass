// タスク一覧コンポーネント（左側固定）
// 工程（Stage）とタスク（Task）を視覚的に区別して表示

import React, { useState, useEffect } from 'react';
import type { GanttTask } from './types';
import type { ProjectMilestone } from './GanttTimeline';
import type { Project } from '../../lib/types';
import { Layers, ChevronRight, ChevronDown, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { calculateProjectStatus, getStatusColor } from '../../lib/projectStatus';

interface GanttTaskListProps {
  tasks: GanttTask[];
  rowHeight: number;
  stageRowHeight?: number; // 工程行の高さ（デフォルト: 48）
  taskRowHeight?: number;  // タスク行の高さ（デフォルト: 36）
  onTaskClick?: (task: GanttTask) => void;
  onTaskToggleComplete?: (task: GanttTask) => void;
  onProjectClick?: (projectId: string) => void;
  scrollTop?: number;
  projectMap?: Record<string, Project>;
  projectMilestones?: ProjectMilestone[];
  expandedStageIds?: Set<string>;
  onToggleStage?: (stageId: string) => void;
  expandedProjectIds?: Set<string>;
  onToggleProject?: (projectId: string) => void;
}

// 進捗率に応じた色を取得
function getProgressColor(progress: number): string {
  if (progress >= 100) return 'bg-emerald-500';
  if (progress >= 75) return 'bg-blue-500';
  if (progress >= 50) return 'bg-blue-400';
  if (progress >= 25) return 'bg-amber-400';
  return 'bg-slate-300';
}

// ステータスに応じたアイコンを取得
function getStatusIcon(status: string, className: string = 'w-3.5 h-3.5') {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className={`${className} text-emerald-500`} />;
    case 'overdue':
      return <AlertTriangle className={`${className} text-red-500`} />;
    case 'in_progress':
      return <Clock className={`${className} text-blue-500`} />;
    default:
      return null;
  }
}

export const GanttTaskList: React.FC<GanttTaskListProps> = ({
  tasks,
  rowHeight,
  stageRowHeight = 48,
  taskRowHeight = 36,
  onTaskClick,
  onTaskToggleComplete,
  onProjectClick,
  scrollTop = 0,
  projectMap = {},
  projectMilestones = [],
  expandedStageIds: externalExpandedStageIds,
  onToggleStage,
  expandedProjectIds,
  onToggleProject
}) => {
  // ローカル完了状態管理（即座にUIを更新するため）
  const [localCompletedStates, setLocalCompletedStates] = useState<Record<string, boolean>>({});
  // ハイライト表示用のstate
  const [highlightedTaskIds, setHighlightedTaskIds] = useState<Set<string>>(new Set());
  // 工程の展開状態を管理（外部制御がない場合のみ）
  const [internalExpandedStageIds, setInternalExpandedStageIds] = useState<Set<string>>(new Set());

  // 外部制御がある場合はそちらを優先
  const expandedStageIds = externalExpandedStageIds !== undefined ? externalExpandedStageIds : internalExpandedStageIds;
  const setExpandedStageIds = onToggleStage ? undefined : setInternalExpandedStageIds;

  // tasksが変更されたら、ローカル状態をリセット
  useEffect(() => {
    const newStates: Record<string, boolean> = {};
    const stageIds = new Set<string>();
    tasks.forEach(task => {
      newStates[task.id] = task.status === 'completed';
      // 工程は初期状態で全て展開（外部制御がない場合のみ）
      if (task.type === 'stage' && !onToggleStage) {
        stageIds.add(task.id);
      }
    });
    setLocalCompletedStates(newStates);
    if (!onToggleStage && setExpandedStageIds) {
      setExpandedStageIds(stageIds);
    }
  }, [tasks, onToggleStage]);

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
        // 同じプロジェクトのタスクのみを対象にする
        if (t.projectId !== task.projectId) return false;
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
        projectStatus: project ? calculateProjectStatus(project) : undefined,
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
          projectStatus: calculateProjectStatus(project),
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
        <div className="hidden md:block w-20 text-center">担当</div>
        <div className="hidden md:block w-16 text-center">進捗</div>
      </div>

      {/* タスクリスト（プロジェクトごとにグループ化） */}
      <div className="overflow-hidden">
        {projectGroups.map((group) => (
          <div key={group.projectId}>
            {/* プロジェクトヘッダー（タイムラインと同じ32px） */}
            <div className="bg-slate-100/50 border-b border-slate-200 flex items-center justify-between px-2" style={{ height: '32px' }}>
              <div className="flex items-center gap-1">
                {onToggleProject && (
                  <button
                    className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleProject(group.projectId);
                    }}
                  >
                    {expandedProjectIds?.has(group.projectId) ? (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                )}
                <span
                  className={`text-xs font-semibold text-slate-700 ${onProjectClick ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                  onClick={() => onProjectClick && onProjectClick(group.projectId)}
                >
                  {group.projectName}
                </span>
              </div>
              {group.projectStatus && (
                <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(group.projectStatus)}`}>
                  {group.projectStatus}
                </span>
              )}
            </div>

            {/* プロジェクト内のタスク・工程（プロジェクトが展開されている場合のみ表示） */}
            {(!expandedProjectIds || expandedProjectIds.has(group.projectId)) && group.tasks.map((task, index) => {
              // ローカル状態を優先的に使用
              const isCompleted = localCompletedStates[task.id] ?? (task.status === 'completed');
              const incompleteDeps = hasIncompleteDependencies(task);
              const cannotComplete = !isCompleted && incompleteDeps.length > 0;
              const isHighlighted = highlightedTaskIds.has(task.id);
              const isStage = task.type === 'stage';
              const isDimmed = !isStage && task.isDimmed;

              // 親工程が折りたたまれている場合、子タスクは非表示
              if (task.parentId && !expandedStageIds.has(task.parentId)) {
                return null;
              }

              // ========================================
              // 工程（Stage）行の表示
              // - 背景色でハイライト
              // - 太字
              // - 工程アイコン（Layers）
              // - 進捗バー表示
              // - トグルアイコン
              // ========================================
              if (isStage) {
                const isExpanded = expandedStageIds.has(task.id);
                return (
                  <div
                    key={task.id}
                    id={`task-row-${task.id}`}
                    className={`
                      flex items-center px-3 border-b border-slate-200
                      bg-slate-50
                      cursor-pointer transition-colors
                      ${isHighlighted ? 'bg-amber-100 animate-pulse' : 'hover:bg-slate-100'}
                    `}
                    style={{ height: `${stageRowHeight}px` }}
                    onClick={() => onTaskClick?.(task)}
                  >
                    {/* トグルアイコン + 工程アイコン */}
                    <div className="w-8 flex items-center justify-start gap-1">
                      <button
                        className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onToggleStage) {
                            onToggleStage(task.id);
                          } else if (setExpandedStageIds) {
                            setExpandedStageIds(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(task.id)) {
                                newSet.delete(task.id);
                              } else {
                                newSet.add(task.id);
                              }
                              return newSet;
                            });
                          }
                        }}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-600" />
                        )}
                      </button>
                      <Layers className="w-3.5 h-3.5 text-slate-500" />
                    </div>

                    {/* 工程名 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700 truncate">
                          {task.name}
                        </span>
                        {getStatusIcon(task.status)}
                      </div>
                    </div>

                    {/* 担当（工程は「—」を表示） */}
                    <div className="hidden md:block w-20 text-center">
                      <span className="text-xs text-slate-400">—</span>
                    </div>

                    {/* 進捗バー（工程の集計値） */}
                    <div className="hidden md:flex w-16 flex-col items-center gap-0.5 px-1">
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getProgressColor(task.progress)} transition-all duration-300`}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600">
                        {task.progress}%
                      </span>
                    </div>
                  </div>
                );
              }

              // ========================================
              // タスク（Task）行の表示
              // - インデント表示（親がいる場合）
              // - チェックボックス
              // - 通常フォント
              // - 担当者表示
              // ========================================
              const hasParent = !!task.parentId;
              const rowOpacityClass = isDimmed ? 'opacity-40' : isCompleted ? 'opacity-60' : '';
              const taskNameClass = isCompleted ? 'line-through text-slate-400' : isDimmed ? 'text-slate-400' : 'text-slate-700';
              return (
                <div
                  key={task.id}
                  id={`task-row-${task.id}`}
                  className={`flex items-center border-b border-slate-100 transition-all ${rowOpacityClass
                    } ${isHighlighted ? 'bg-amber-100 animate-pulse' : 'hover:bg-slate-50'
                    }`}
                  style={{
                    height: `${taskRowHeight}px`,
                    paddingLeft: hasParent ? '2rem' : '1rem' // 親がいる場合は2rem、それ以外は1rem
                  }}
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
                    <div className={`text-sm truncate ${taskNameClass}`}>
                      {task.name}
                    </div>
                  </div>

                  {/* 担当者 */}
                  <div className="hidden md:block w-20 text-center">
                    {task.assigneeAvatar ? (
                      <img
                        src={task.assigneeAvatar}
                        alt={task.assignee}
                        className="w-6 h-6 rounded-full mx-auto"
                      />
                    ) : task.assignee && task.assignee !== '未設定' ? (
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center mx-auto text-xs font-medium text-slate-600">
                        {task.assignee.charAt(0)}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>

                  {/* 進捗 */}
                  <div className="hidden md:flex w-16 flex-col items-center gap-0.5 px-1">
                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getProgressColor(task.progress)} transition-all duration-300`}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">
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
