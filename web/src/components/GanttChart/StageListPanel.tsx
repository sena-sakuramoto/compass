// 工程リストパネル（左カラム）
// 工程カードとタスク行を表示

import React from 'react';
import type { GanttStage } from './types';
import { GANTT_COLORS, getStatusChipClasses, getStatusLabel } from './colors';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface StageListPanelProps {
  stages: GanttStage[];
  expandedStageIds: Set<string>;
  onToggleStage: (stageId: string) => void;
  onTaskToggleComplete?: (stageId: string, taskId: string) => void;
  onProjectClick?: (projectId: string) => void;
  projectMap?: Record<string, { 物件名?: string; ステータス?: string; [key: string]: any }>;
  stageRowHeight: number;
  taskRowHeight: number;
}

export const StageListPanel: React.FC<StageListPanelProps> = ({
  stages,
  expandedStageIds,
  onToggleStage,
  onTaskToggleComplete,
  onProjectClick,
  projectMap,
  stageRowHeight,
  taskRowHeight,
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
      <div className="sticky top-0 border-b border-slate-200 bg-slate-50 flex items-center px-3 text-xs font-semibold text-slate-600" style={{ height: '48px', zIndex: 30 }}>
        <div className="flex-1">工程 / タスク</div>
      </div>

      {/* 工程リスト */}
      <div className="overflow-hidden">
        {projectGroups.map((group) => (
          <div key={group.projectId}>
            {/* プロジェクトヘッダー */}
            <div className="bg-slate-100/70 border-b border-slate-200 flex items-center justify-between px-3" style={{ height: '28px' }}>
              <span
                className={`text-xs font-semibold text-slate-700 truncate ${onProjectClick ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                onClick={() => onProjectClick && onProjectClick(group.projectId)}
              >
                {group.projectName}
              </span>
            </div>

            {/* プロジェクト内の工程 */}
            {group.stages.map((stage) => {
              const isExpanded = expandedStageIds.has(stage.id);
              const includesToday = stageIncludesToday(stage);

              return (
                <div key={stage.id}>
                  {/* 工程カード（コンパクト版） */}
                  <div
                    className={`
                      border-b ${GANTT_COLORS.stageCard.border}
                      ${GANTT_COLORS.stageCard.bgHover}
                      cursor-pointer
                      transition-colors
                      flex items-center px-3 gap-2
                      ${includesToday ? 'bg-blue-50/50' : ''}
                    `}
                    style={{ height: `${stageRowHeight}px` }}
                    onClick={() => onToggleStage(stage.id)}
                  >
                    {/* 展開アイコン */}
                    <svg
                      className={`w-3 h-3 flex-shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>

                    {/* 工程名 */}
                    <span className="flex-1 text-sm font-medium text-slate-700 truncate">
                      {stage.name}
                    </span>

                    {/* タスク数 */}
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {stage.tasks.filter(t => t.status === 'completed').length}/{stage.tasks.length}
                    </span>
                  </div>

                  {/* タスク行（展開時・コンパクト版） */}
                  {isExpanded && stage.tasks.map((task) => {
                    const isCompleted = task.status === 'completed';

                    return (
                      <div
                        key={task.id}
                        className={`
                          border-b ${GANTT_COLORS.taskRow.border}
                          ${GANTT_COLORS.taskRow.bgHover}
                          pl-8 pr-3 flex items-center gap-2
                          ${isCompleted ? 'opacity-50' : ''}
                        `}
                        style={{ height: `${taskRowHeight}px` }}
                      >
                        {/* チェックボックス */}
                        <input
                          type="checkbox"
                          checked={isCompleted}
                          onChange={(e) => {
                            e.stopPropagation();
                            onTaskToggleComplete?.(stage.id, task.id);
                          }}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                        />

                        {/* タスク名 */}
                        <span className={`flex-1 text-sm text-slate-600 truncate ${isCompleted ? 'line-through' : ''}`}>
                          {task.name}
                        </span>

                        {/* 担当者（省略形） */}
                        {task.assignee && task.assignee !== '未設定' && (
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            {task.assignee.charAt(0)}
                          </span>
                        )}
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
