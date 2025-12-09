// 工程リストパネル（左カラム）
// 工程カードとタスク行を表示
// Stage行とTask行を視覚的に明確に区別

import React from 'react';
import type { GanttStage, GanttTask } from './types';
import { GANTT_COLORS } from './colors';
import { ChevronRight, ChevronDown, Layers, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface StageListPanelProps {
  stages: GanttStage[];
  expandedStageIds: Set<string>;
  onToggleStage: (stageId: string) => void;
  onTaskToggleComplete?: (stageId: string, taskId: string) => void;
  onProjectClick?: (projectId: string) => void;
  onStageSelect?: (stageId: string) => void;
  onTaskSelect?: (taskId: string, stageId: string) => void;
  selectedStageId?: string | null;
  selectedTaskId?: string | null;
  projectMap?: Record<string, { 物件名?: string; ステータス?: string; [key: string]: any }>;
  stageRowHeight: number;
  taskRowHeight: number;
  projectHeaderHeight: number;
}

// 進捗率に応じた色を取得
function getProgressColor(progress: number): string {
  if (progress >= 100) return 'bg-emerald-500';
  if (progress >= 75) return 'bg-blue-500';
  if (progress >= 50) return 'bg-blue-400';
  if (progress >= 25) return 'bg-amber-400';
  return 'bg-slate-300';
}

// ステータスアイコンを取得
function getStatusIcon(status: string, className: string = 'w-3.5 h-3.5') {
  switch (status) {
    case 'done':
      return <CheckCircle2 className={`${className} text-emerald-500`} />;
    case 'delayed':
      return <AlertTriangle className={`${className} text-red-500`} />;
    case 'in_progress':
      return <Clock className={`${className} text-blue-500`} />;
    default:
      return null;
  }
}

export const StageListPanel: React.FC<StageListPanelProps> = ({
  stages,
  expandedStageIds,
  onToggleStage,
  onTaskToggleComplete,
  onProjectClick,
  onStageSelect,
  onTaskSelect,
  selectedStageId,
  selectedTaskId,
  projectMap,
  stageRowHeight,
  taskRowHeight,
  projectHeaderHeight,
}) => {
  // プロジェクトごとにグループ化
  const projectGroups: { projectId: string; projectName: string; projectStatus?: string; stages: GanttStage[] }[] = [];
  let currentProjectId: string | null = null;

  stages.forEach(stage => {
    if (stage.projectId !== currentProjectId) {
      currentProjectId = stage.projectId;
      const project = projectMap?.[stage.projectId];
      projectGroups.push({
        projectId: stage.projectId,
        projectName: stage.projectName,
        projectStatus: project?.ステータス,
        stages: []
      });
    }
    projectGroups[projectGroups.length - 1].stages.push(stage);
  });

  // 今日の日付
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 工程が今日を含むかチェック
  const stageIncludesToday = (stage: GanttStage): boolean => {
    const start = new Date(stage.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(stage.endDate);
    end.setHours(0, 0, 0, 0);
    return start <= today && today <= end;
  };

  return (
    <div className="border-r border-slate-200 bg-white h-full">
      {/* ヘッダー */}
      <div
        className="sticky top-0 border-b border-slate-200 bg-slate-50 flex items-center text-xs font-semibold text-slate-600"
        style={{ height: '64px', zIndex: 30 }}
      >
        <div className="flex-1 px-3">工程 / タスク</div>
        <div className="w-16 text-center px-2 hidden sm:block">担当</div>
        <div className="w-14 text-center px-2">進捗</div>
      </div>

      {/* 工程リスト */}
      <div className="overflow-hidden">
        {projectGroups.map((group) => (
          <div key={group.projectId}>
            {/* プロジェクトヘッダー */}
            <div
              className="bg-slate-100 border-b border-slate-200 flex items-center justify-between px-3"
              style={{ height: `${projectHeaderHeight}px` }}
            >
              <span
                className={`text-xs font-bold text-slate-700 truncate ${onProjectClick ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                onClick={() => onProjectClick && onProjectClick(group.projectId)}
              >
                📁 {group.projectName}
              </span>
            </div>

            {/* プロジェクト内の工程 */}
            {group.stages.map((stage) => {
              const isExpanded = expandedStageIds.has(stage.id);
              const includesToday = stageIncludesToday(stage);
              const isSelected = selectedStageId === stage.id;
              const hasSelectedTask = stage.tasks.some(t => t.id === selectedTaskId);
              const completedCount = stage.tasks.filter(t => t.status === 'completed').length;
              const totalCount = stage.tasks.length;
              const progressPct = stage.progressPct;

              return (
                <div key={stage.id}>
                  {/* ========================================
                      工程（Stage）行
                      - 背景色でハイライト
                      - 太字
                      - 工程アイコン
                      - 折りたたみトグル
                      - 進捗バー表示
                      ======================================== */}
                  <div
                    className={`
                      border-b border-slate-200
                      cursor-pointer
                      transition-all duration-150
                      flex items-center
                      ${isSelected
                        ? 'bg-blue-100 border-l-4 border-l-blue-500'
                        : hasSelectedTask
                          ? 'bg-blue-50/50 border-l-4 border-l-blue-300'
                          : includesToday
                            ? 'bg-amber-50/50 border-l-4 border-l-amber-400'
                            : 'bg-slate-50 border-l-4 border-l-transparent hover:bg-slate-100'
                      }
                    `}
                    style={{ height: `${stageRowHeight}px` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStageSelect?.(stage.id);
                    }}
                  >
                    {/* 折りたたみトグル + 工程アイコン */}
                    <div
                      className="flex items-center gap-1 pl-2 pr-1 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStage(stage.id);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                      <Layers className="w-4 h-4 text-emerald-600" />
                    </div>

                    {/* 工程名 */}
                    <div className="flex-1 min-w-0 px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 truncate">
                          {stage.name}
                        </span>
                        {getStatusIcon(stage.status)}
                      </div>
                      {/* タスク数（コンパクト表示） */}
                      <div className="text-xs text-slate-400">
                        {completedCount}/{totalCount} タスク
                      </div>
                    </div>

                    {/* 担当列（工程は「—」を表示） */}
                    <div className="w-16 text-center px-2 text-xs text-slate-400 hidden sm:block">
                      —
                    </div>

                    {/* 進捗列（集計値） */}
                    <div className="w-14 px-2 flex flex-col items-center gap-0.5">
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getProgressColor(progressPct)} transition-all duration-300`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600">
                        {progressPct}%
                      </span>
                    </div>
                  </div>

                  {/* ========================================
                      タスク（Task）行
                      - インデント表示
                      - 通常フォント
                      - チェックボックス
                      - 担当者表示
                      ======================================== */}
                  {isExpanded && stage.tasks.map((task) => {
                    const isCompleted = task.status === 'completed';
                    const isTaskSelected = selectedTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        className={`
                          border-b border-slate-100
                          transition-all duration-150
                          flex items-center
                          ${isTaskSelected
                            ? 'bg-blue-50 border-l-4 border-l-blue-500'
                            : 'bg-white border-l-4 border-l-transparent hover:bg-slate-50'
                          }
                          ${isCompleted ? 'opacity-60' : ''}
                        `}
                        style={{ height: `${taskRowHeight}px` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskSelect?.(task.id, stage.id);
                        }}
                      >
                        {/* インデント + チェックボックス */}
                        <div className="pl-10 pr-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isCompleted}
                            onChange={(e) => {
                              e.stopPropagation();
                              onTaskToggleComplete?.(stage.id, task.id);
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </div>

                        {/* タスク名 */}
                        <div className="flex-1 min-w-0 pr-2">
                          <span className={`text-sm text-slate-700 truncate block ${isCompleted ? 'line-through text-slate-400' : ''}`}>
                            {task.name}
                          </span>
                        </div>

                        {/* 担当者 */}
                        <div className="w-16 text-center px-2 hidden sm:block">
                          {task.assignee && task.assignee !== '未設定' ? (
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-xs font-medium text-slate-600"
                              title={task.assignee}
                            >
                              {task.assignee.charAt(0)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>

                        {/* 進捗 */}
                        <div className="w-14 px-2 flex flex-col items-center gap-0.5">
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
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
