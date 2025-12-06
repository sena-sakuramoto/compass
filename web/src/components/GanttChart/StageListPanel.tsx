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
      <div className="sticky top-0 border-b border-slate-200 bg-slate-50 flex items-center px-4 text-xs font-semibold text-slate-600" style={{ height: '64px', zIndex: 30 }}>
        <div className="flex-1">工程名</div>
        <div className="hidden md:block w-20 text-center">進捗</div>
      </div>

      {/* 工程リスト */}
      <div className="overflow-hidden">
        {projectGroups.map((group) => (
          <div key={group.projectId}>
            {/* プロジェクトヘッダー */}
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

            {/* プロジェクト内の工程 */}
            {group.stages.map((stage) => {
              const isExpanded = expandedStageIds.has(stage.id);
              const includesToday = stageIncludesToday(stage);

              return (
                <div key={stage.id}>
                  {/* 工程カード */}
                  <div
                    className={`
                      border-b ${GANTT_COLORS.stageCard.border}
                      ${GANTT_COLORS.stageCard.bgHover}
                      cursor-pointer
                      transition-colors
                      ${includesToday ? GANTT_COLORS.stageCard.accentLine : ''}
                    `}
                    style={{ minHeight: `${stageRowHeight}px` }}
                    onClick={() => onToggleStage(stage.id)}
                  >
                    <div className="px-4 py-2">
                      <div className="flex items-start gap-2">
                        {/* 展開アイコン */}
                        <svg
                          className={`w-4 h-4 mt-1 flex-shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>

                        {/* 工程情報 */}
                        <div className="flex-1 min-w-0">
                          {/* 工程名 */}
                          <div className="font-semibold text-sm text-slate-800 truncate mb-1">
                            {stage.name}
                          </div>

                          {/* 期間 */}
                          <div className="text-xs text-slate-500 mb-1.5">
                            {format(stage.startDate, 'M/d', { locale: ja })} 〜 {format(stage.endDate, 'M/d', { locale: ja })}
                          </div>

                          {/* 進捗バー */}
                          <div className="flex items-center gap-2">
                            <div className={`flex-1 h-2 ${GANTT_COLORS.stageCard.progressBar.bg} rounded-full overflow-hidden`}>
                              <div
                                className={`h-full ${GANTT_COLORS.stageCard.progressBar.fill} transition-all duration-200`}
                                style={{ width: `${stage.progressPct}%` }}
                              />
                            </div>
                            <span className={`text-xs ${GANTT_COLORS.stageCard.progressBar.text} font-medium w-10 text-right`}>
                              {stage.progressPct}%
                            </span>
                          </div>

                          {/* タスク数と状態チップ */}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-slate-500">
                              {stage.tasks.filter(t => t.status === 'completed').length}/{stage.tasks.length} タスク
                            </span>
                            <span className={getStatusChipClasses(stage.status)}>
                              {getStatusLabel(stage.status)}
                            </span>
                          </div>
                        </div>

                        {/* 担当者アイコン */}
                        {stage.assignee && (
                          <div className="flex-shrink-0 mt-1">
                            {stage.assigneeAvatar ? (
                              <img
                                src={stage.assigneeAvatar}
                                alt={stage.assignee}
                                className="w-6 h-6 rounded-full"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                                {stage.assignee.charAt(0)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* タスク行（展開時） */}
                  {isExpanded && stage.tasks.map((task) => {
                    const isCompleted = task.status === 'completed';

                    return (
                      <div
                        key={task.id}
                        className={`
                          border-b ${GANTT_COLORS.taskRow.border}
                          ${GANTT_COLORS.taskRow.bgHover}
                          ${GANTT_COLORS.taskRow.indent}
                          ${isCompleted ? 'opacity-60' : ''}
                          transition-opacity
                        `}
                        style={{ minHeight: `${taskRowHeight}px` }}
                      >
                        <div className="py-2 pr-4 flex items-center gap-3">
                          {/* チェックボックス */}
                          <input
                            type="checkbox"
                            checked={isCompleted}
                            onChange={(e) => {
                              e.stopPropagation();
                              onTaskToggleComplete?.(stage.id, task.id);
                            }}
                            className={`
                              w-4 h-4 rounded
                              ${GANTT_COLORS.taskRow.checkbox.border}
                              ${GANTT_COLORS.taskRow.checkbox.checked}
                              ${GANTT_COLORS.taskRow.checkbox.focus}
                              cursor-pointer
                            `}
                          />

                          {/* タスク情報 */}
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm text-slate-700 truncate ${isCompleted ? 'line-through' : ''}`}>
                              {task.name}
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                              {task.assignee && (
                                <span className="truncate">{task.assignee}</span>
                              )}
                              {task.endDate && (
                                <span className="flex-shrink-0">
                                  〜 {format(task.endDate, 'M/d', { locale: ja })}
                                </span>
                              )}
                            </div>
                          </div>
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
