// 工程タイムラインパネル（右側）
// 時間軸、グリッド、今日のインジケーター、工程バー、タスクバーを表示
// StageListPanelと同期した高さ計算を実装

import React, { useMemo } from 'react';
import type { GanttStage, GanttTask, DateTick, ViewMode } from './types';
import { GanttTimeAxis } from './GanttTimeAxis';
import { StageBar } from './StageBar';
import { GANTT_COLORS } from './colors';
import { calculateTodayPosition } from './utils';
import { differenceInDays } from 'date-fns';

interface StageTimelinePanelProps {
  stages: GanttStage[];
  expandedStageIds: Set<string>;
  ticks: DateTick[];
  dateRange: { start: Date; end: Date };
  containerWidth: number;
  stageRowHeight: number;
  taskRowHeight: number;
  projectHeaderHeight: number;
  viewMode: ViewMode;
  projectMap?: Record<string, { 物件名?: string; ステータス?: string; [key: string]: any }>;
  selectedStageId?: string | null;
  selectedTaskId?: string | null;
  onStageSelect?: (stageId: string) => void;
  onTaskSelect?: (taskId: string, stageId: string) => void;
}

// タスクバーの色を取得
function getTaskBarColor(progress: number, status: string): string {
  if (status === 'completed') return 'bg-emerald-400';
  if (progress >= 75) return 'bg-blue-400';
  if (progress >= 50) return 'bg-blue-300';
  if (progress >= 25) return 'bg-amber-300';
  return 'bg-slate-300';
}

export const StageTimelinePanel: React.FC<StageTimelinePanelProps> = ({
  stages,
  expandedStageIds,
  ticks,
  dateRange,
  containerWidth,
  stageRowHeight,
  taskRowHeight,
  projectHeaderHeight,
  viewMode,
  projectMap,
  selectedStageId,
  selectedTaskId,
  onStageSelect,
  onTaskSelect,
}) => {
  // 今日の位置を計算
  const todayPosition = calculateTodayPosition(dateRange, containerWidth);

  // 日数と幅の計算
  const totalDaysInclusive = differenceInDays(dateRange.end, dateRange.start) + 1;
  const dayWidth = containerWidth / totalDaysInclusive;

  // プロジェクトごとにグループ化
  const projectGroups = useMemo(() => {
    const groups: { projectId: string; projectName: string; stages: GanttStage[] }[] = [];
    let currentProjectId: string | null = null;

    stages.forEach(stage => {
      if (stage.projectId !== currentProjectId) {
        currentProjectId = stage.projectId;
        const project = projectMap?.[stage.projectId];
        groups.push({
          projectId: stage.projectId,
          projectName: project?.物件名 || stage.projectName,
          stages: [],
        });
      }
      groups[groups.length - 1].stages.push(stage);
    });

    return groups;
  }, [stages, projectMap]);

  // タイムラインの総高さを計算（StageListPanelと同じロジック）
  const totalHeight = useMemo(() => {
    let height = 0;
    projectGroups.forEach(group => {
      height += projectHeaderHeight; // プロジェクトヘッダー
      group.stages.forEach(stage => {
        height += stageRowHeight; // 工程行
        if (expandedStageIds.has(stage.id)) {
          height += stage.tasks.length * taskRowHeight; // タスク行
        }
      });
    });
    return height;
  }, [projectGroups, expandedStageIds, stageRowHeight, taskRowHeight, projectHeaderHeight]);

  // バー位置の計算用ヘルパー
  const calculateBarPosition = (startDate: Date, endDate: Date) => {
    const startDaysFromStart = differenceInDays(startDate, dateRange.start);
    const endDaysFromStart = differenceInDays(endDate, dateRange.start);

    const isVisible = endDaysFromStart >= 0 && startDaysFromStart < totalDaysInclusive;
    if (!isVisible) return null;

    const left = Math.max(0, startDaysFromStart * dayWidth);
    const right = Math.min(containerWidth, (endDaysFromStart + 1) * dayWidth);
    const width = Math.max(right - left, 4); // 最小幅4px

    return { left, width };
  };

  // 行を構築
  const rows: Array<{
    type: 'project' | 'stage' | 'task';
    id: string;
    stage?: GanttStage;
    task?: GanttTask;
    stageId?: string;
    top: number;
    height: number;
  }> = [];

  let currentTop = 0;
  projectGroups.forEach(group => {
    // プロジェクトヘッダー行
    rows.push({
      type: 'project',
      id: `project-${group.projectId}`,
      top: currentTop,
      height: projectHeaderHeight,
    });
    currentTop += projectHeaderHeight;

    group.stages.forEach(stage => {
      // 工程行
      rows.push({
        type: 'stage',
        id: stage.id,
        stage,
        top: currentTop,
        height: stageRowHeight,
      });
      currentTop += stageRowHeight;

      // 展開時のタスク行
      if (expandedStageIds.has(stage.id)) {
        stage.tasks.forEach(task => {
          rows.push({
            type: 'task',
            id: task.id,
            task,
            stageId: stage.id,
            top: currentTop,
            height: taskRowHeight,
          });
          currentTop += taskRowHeight;
        });
      }
    });
  });

  return (
    <div style={{ width: `${containerWidth}px`, minWidth: `${containerWidth}px` }}>
      {/* 時間軸ヘッダー（sticky、64px高さに合わせる） */}
      <div className="sticky top-0 bg-white border-b border-slate-200" style={{ height: '64px', zIndex: 30 }}>
        <GanttTimeAxis ticks={ticks} containerWidth={containerWidth} viewMode={viewMode} />
      </div>

      {/* バー描画エリア */}
      <div className="relative bg-white" style={{ height: `${totalHeight}px` }}>
        {/* グリッド背景 */}
        <div className="absolute inset-0">
          {/* 縦線（日付の区切り） */}
          {ticks.map((tick, index) => {
            const x = (index / ticks.length) * containerWidth;
            const isWeekend = tick.isWeekend;

            return (
              <React.Fragment key={index}>
                {/* 週末の背景 */}
                {isWeekend && (
                  <div
                    className="absolute top-0 bottom-0 bg-slate-50/70 pointer-events-none"
                    style={{
                      left: `${x}px`,
                      width: `${containerWidth / ticks.length}px`
                    }}
                  />
                )}
                {/* 縦線 */}
                {index > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-slate-200 pointer-events-none"
                    style={{ left: `${x}px` }}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* 行の背景と横線 */}
          {rows.map((row) => {
            if (row.type === 'project') {
              return (
                <div
                  key={row.id}
                  className={`absolute left-0 right-0 ${GANTT_COLORS.projectHeader.bg} ${GANTT_COLORS.projectHeader.border} border-b pointer-events-none`}
                  style={{
                    top: `${row.top}px`,
                    height: `${row.height}px`
                  }}
                />
              );
            }
            if (row.type === 'stage') {
              const isSelected = selectedStageId === row.id;
              return (
                <div
                  key={row.id}
                  className={`absolute left-0 right-0 border-b border-slate-200 ${isSelected ? 'bg-blue-50/50' : 'bg-slate-50/30'}`}
                  style={{
                    top: `${row.top}px`,
                    height: `${row.height}px`
                  }}
                />
              );
            }
            if (row.type === 'task') {
              const isSelected = selectedTaskId === row.id;
              return (
                <div
                  key={row.id}
                  className={`absolute left-0 right-0 border-b border-slate-100 ${isSelected ? 'bg-blue-50/30' : ''}`}
                  style={{
                    top: `${row.top}px`,
                    height: `${row.height}px`
                  }}
                />
              );
            }
            return null;
          })}

          {/* 今日のインジケーター */}
          {todayPosition !== null && (
            <>
              {/* 背景のハイライト */}
              <div
                className={`absolute top-0 bottom-0 ${GANTT_COLORS.today.bg} pointer-events-none`}
                style={{
                  left: `${todayPosition}px`,
                  width: `${dayWidth}px`,
                }}
              />
              {/* 今日の線 */}
              <div
                className={`absolute top-0 bottom-0 ${GANTT_COLORS.today.line} border-l-2 pointer-events-none z-20`}
                style={{
                  left: `${todayPosition}px`,
                }}
              />
              {/* 今日のラベル */}
              <div
                className={`absolute top-0 ${GANTT_COLORS.today.label.bg} ${GANTT_COLORS.today.label.text} text-xs font-medium px-2 py-0.5 rounded-b shadow-sm pointer-events-none z-30`}
                style={{
                  left: `${todayPosition - 15}px`,
                }}
              >
                今日
              </div>
            </>
          )}
        </div>

        {/* バー描画 */}
        {rows.map((row) => {
          if (row.type === 'stage' && row.stage) {
            const barPos = calculateBarPosition(row.stage.startDate, row.stage.endDate);
            if (!barPos) return null;

            const isSelected = selectedStageId === row.id;
            const barTop = row.top + (row.height - 20) / 2;

            return (
              <div
                key={`bar-${row.id}`}
                className={`absolute cursor-pointer transition-all duration-150 ${isSelected ? 'z-10' : ''}`}
                style={{
                  left: `${barPos.left}px`,
                  width: `${barPos.width}px`,
                  top: `${barTop}px`,
                  height: '20px',
                }}
                onClick={() => onStageSelect?.(row.id)}
              >
                <StageBar stage={row.stage} position={{ left: 0, width: barPos.width, top: 0 }} />
              </div>
            );
          }

          if (row.type === 'task' && row.task && row.stageId) {
            const barPos = calculateBarPosition(row.task.startDate, row.task.endDate);
            if (!barPos) return null;

            const isSelected = selectedTaskId === row.id;
            const isCompleted = row.task.status === 'completed';
            const barTop = row.top + (row.height - 12) / 2;

            return (
              <div
                key={`bar-${row.id}`}
                className={`absolute cursor-pointer transition-all duration-150 group ${isSelected ? 'z-10' : ''}`}
                style={{
                  left: `${barPos.left}px`,
                  width: `${barPos.width}px`,
                  top: `${barTop}px`,
                  height: '12px',
                }}
                onClick={() => onTaskSelect?.(row.id, row.stageId!)}
              >
                {/* タスクバー */}
                <div
                  className={`h-full rounded ${getTaskBarColor(row.task.progress, row.task.status)} ${isCompleted ? 'opacity-60' : ''} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : 'group-hover:brightness-95'}`}
                  title={`${row.task.name} (${row.task.progress}%)`}
                >
                  {/* 進捗バー */}
                  <div
                    className="h-full bg-white/20 rounded-l"
                    style={{ width: `${row.task.progress}%` }}
                  />
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
};
