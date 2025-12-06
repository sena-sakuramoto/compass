// 工程タイムラインパネル（右側）
// 時間軸、グリッド、今日のインジケーター、工程バーを表示

import React, { useMemo } from 'react';
import type { GanttStage, DateTick, ViewMode } from './types';
import { GanttTimeAxis } from './GanttTimeAxis';
import { StageBar } from './StageBar';
import { GANTT_COLORS } from './colors';
import { calculateTaskBarPosition, calculateTodayPosition } from './utils';
import { differenceInDays } from 'date-fns';

interface StageTimelinePanelProps {
  stages: GanttStage[];
  ticks: DateTick[];
  dateRange: { start: Date; end: Date };
  containerWidth: number;
  stageRowHeight: number;
  viewMode: ViewMode;
  projectMap?: Record<string, { 物件名?: string; ステータス?: string; [key: string]: any }>;
}

export const StageTimelinePanel: React.FC<StageTimelinePanelProps> = ({
  stages,
  ticks,
  dateRange,
  containerWidth,
  stageRowHeight,
  viewMode,
  projectMap,
}) => {
  // プロジェクトヘッダーの高さ
  const projectHeaderHeight = 32;

  // 今日の位置を計算
  const todayPosition = calculateTodayPosition(dateRange, containerWidth);

  // プロジェクトごとにグループ化
  const projectGroups = useMemo(() => {
    const groups: { projectId: string; projectName: string; stages: GanttStage[]; startRow: number }[] = [];
    let currentProjectId: string | null = null;
    let rowIndex = 0;

    stages.forEach(stage => {
      if (stage.projectId !== currentProjectId) {
        currentProjectId = stage.projectId;
        const project = projectMap?.[stage.projectId];
        groups.push({
          projectId: stage.projectId,
          projectName: project?.物件名 || stage.projectName,
          stages: [],
          startRow: rowIndex
        });
        rowIndex++; // プロジェクトヘッダー行
      }
      groups[groups.length - 1].stages.push(stage);
      rowIndex++; // 工程行
    });

    return groups;
  }, [stages, projectMap]);

  // 工程バーの位置を計算
  const stagePositions = useMemo(() => {
    const positions = new Map<string, { left: number; width: number; top: number }>();
    let currentTop = 0;

    projectGroups.forEach(group => {
      // プロジェクトヘッダー分の高さを追加
      currentTop += projectHeaderHeight;

      group.stages.forEach(stage => {
        // 工程バーの位置を計算
        const totalDaysInclusive = differenceInDays(dateRange.end, dateRange.start) + 1;
        const dayWidth = containerWidth / totalDaysInclusive;

        const startDaysFromStart = differenceInDays(stage.startDate, dateRange.start);
        const endDaysFromStart = differenceInDays(stage.endDate, dateRange.start);

        // 範囲外のチェック
        const isVisible = endDaysFromStart >= 0 && startDaysFromStart < totalDaysInclusive;

        if (isVisible) {
          const left = Math.max(0, startDaysFromStart * dayWidth);
          const right = Math.min(containerWidth, (endDaysFromStart + 1) * dayWidth);
          const width = right - left;

          positions.set(stage.id, {
            left,
            width,
            top: currentTop + (stageRowHeight - 16) / 2, // バーを行の中央に配置
          });
        }

        currentTop += stageRowHeight;
      });
    });

    return positions;
  }, [stages, dateRange, containerWidth, stageRowHeight, projectGroups, projectHeaderHeight]);

  // タイムラインの総高さを計算
  const totalHeight = projectGroups.reduce((sum, group) => {
    return sum + projectHeaderHeight + group.stages.length * stageRowHeight;
  }, 0);

  return (
    <div style={{ width: `${containerWidth}px`, minWidth: `${containerWidth}px` }}>
      {/* 時間軸（sticky固定、高さ64px） */}
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

          {/* プロジェクトヘッダーと横線 */}
          {projectGroups.map((group, groupIndex) => {
            const headerTop = groupIndex === 0 ? 0 : projectGroups.slice(0, groupIndex).reduce((sum, g) => sum + g.stages.length * stageRowHeight + projectHeaderHeight, 0);

            return (
              <React.Fragment key={group.projectId}>
                {/* プロジェクトヘッダー背景 */}
                <div
                  className={`absolute left-0 right-0 ${GANTT_COLORS.projectHeader.bg} pointer-events-none ${GANTT_COLORS.projectHeader.border} border-b`}
                  style={{
                    top: `${headerTop}px`,
                    height: `${projectHeaderHeight}px`
                  }}
                />

                {/* 工程の区切り線 */}
                {group.stages.map((_, stageIndex) => {
                  const y = headerTop + projectHeaderHeight + (stageIndex + 1) * stageRowHeight;
                  return (
                    <div
                      key={`${group.projectId}-${stageIndex}`}
                      className="absolute left-0 right-0 h-px bg-slate-100 pointer-events-none"
                      style={{ top: `${y}px` }}
                    />
                  );
                })}
              </React.Fragment>
            );
          })}

          {/* 今日のインジケーター */}
          {todayPosition !== null && (
            <>
              {/* 背景のハイライト - 薄いブルー */}
              <div
                className={`absolute top-0 bottom-0 ${GANTT_COLORS.today.bg} pointer-events-none`}
                style={{
                  left: `${todayPosition}px`,
                  width: `${containerWidth / ticks.length}px`,
                }}
              />
              {/* 今日の線 - 青い実線 */}
              <div
                className={`absolute top-0 bottom-0 ${GANTT_COLORS.today.line} border-l-2 pointer-events-none z-20`}
                style={{
                  left: `${todayPosition}px`,
                }}
              />
              {/* 今日のラベル */}
              <div
                className={`
                  absolute top-0 ${GANTT_COLORS.today.label.bg} ${GANTT_COLORS.today.label.text}
                  text-xs font-medium px-2 py-0.5 rounded-b shadow-sm
                  pointer-events-none z-30
                `}
                style={{
                  left: `${todayPosition - 15}px`,
                }}
              >
                今日
              </div>
            </>
          )}
        </div>

        {/* 工程バー */}
        {stages.map((stage) => {
          const position = stagePositions.get(stage.id);
          if (!position) return null;

          return (
            <div key={stage.id} className="group">
              <StageBar stage={stage} position={position} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
