// タイムラインコンポーネント（右側、横スクロール）

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { GanttTimeAxis } from './GanttTimeAxis';
import { GanttTaskBar } from './GanttTaskBar';
import { GanttMilestone } from './GanttMilestone';
import { GanttDependencyArrow } from './GanttDependencyArrow';
import type { GanttTask, DateTick } from './types';
import { calculateTaskBarPosition, calculateTodayPosition, resolveDependencies } from './utils';
import { differenceInDays } from 'date-fns';

export interface ProjectMilestone {
  projectId: string;
  date: Date;
  label: string;
  type: 'survey' | 'construction_start' | 'completion' | 'delivery';
}

interface GanttTimelineProps {
  tasks: GanttTask[];
  ticks: DateTick[];
  dateRange: { start: Date; end: Date };
  containerWidth: number;
  rowHeight: number;
  stageRowHeight?: number; // 工程行の高さ（デフォルト: 48）
  taskRowHeight?: number;  // タスク行の高さ（デフォルト: 36）
  viewMode: 'day' | 'week' | 'month';
  onTaskClick?: (task: GanttTask) => void;
  onTaskUpdate?: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  onTaskCopy?: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  interactive?: boolean;
  scrollLeft?: number;
  scrollTop?: number;
  onScroll?: (scrollLeft: number, scrollTop: number) => void;
  selectedTaskIds?: Set<string>;
  onTaskSelection?: (taskId: string, isCtrlPressed: boolean) => void;
  onBatchMove?: (deltaDays: number) => void;
  onClearSelection?: () => void;
  onViewModeToggle?: () => void;
  projectMilestones?: ProjectMilestone[];
  projectMap?: Record<string, { 物件名?: string; ステータス?: string;[key: string]: any }>;
  expandedStageIds?: Set<string>;
}

interface GanttTimelinePropsExtended extends GanttTimelineProps {
  onZoom?: (direction: 'in' | 'out') => void;
}

export const GanttTimeline: React.FC<GanttTimelinePropsExtended> = ({
  tasks,
  ticks,
  dateRange,
  containerWidth,
  rowHeight,
  stageRowHeight = 48,
  taskRowHeight = 36,
  viewMode,
  onTaskClick,
  onTaskUpdate,
  onTaskCopy,
  interactive = false,
  scrollLeft = 0,
  scrollTop = 0,
  onScroll,
  selectedTaskIds = new Set(),
  projectMilestones = [],
  projectMap,
  onTaskSelection,
  onBatchMove,
  onClearSelection,
  onViewModeToggle,
  onZoom,
  expandedStageIds = new Set()
}) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const dragStartX = useRef<number>(0);

  // 個別タスクのドラッグ時に選択中の全タスクも一緒に移動
  const handleTaskUpdateWithBatch = (task: GanttTask, newStartDate: Date, newEndDate: Date) => {
    if (!onTaskUpdate) return;

    // ドラッグされたタスクが選択中の場合、選択中の全タスクを移動
    if (selectedTaskIds.has(task.id) && selectedTaskIds.size > 1) {
      const deltaDays = Math.round((newStartDate.getTime() - task.startDate.getTime()) / (1000 * 60 * 60 * 24));

      // 選択中の全タスクを移動
      tasks.forEach(t => {
        if (selectedTaskIds.has(t.id)) {
          const taskDeltaDays = Math.round((newStartDate.getTime() - task.startDate.getTime()) / (1000 * 60 * 60 * 24));
          const taskNewStartDate = new Date(t.startDate);
          taskNewStartDate.setDate(taskNewStartDate.getDate() + taskDeltaDays);
          const taskNewEndDate = new Date(t.endDate);
          taskNewEndDate.setDate(taskNewEndDate.getDate() + taskDeltaDays);

          onTaskUpdate(t, taskNewStartDate, taskNewEndDate);
        }
      });
    } else {
      // 選択されていない、または単独選択の場合は通常の移動
      onTaskUpdate(task, newStartDate, newEndDate);
    }
  };


  // Alt+スクロールでズーム
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.altKey && onZoom) {
      e.preventDefault();
      e.stopPropagation();

      // スクロール方向でズームイン/ズームアウト
      const direction = e.deltaY < 0 ? 'in' : 'out';
      onZoom(direction);
    }
  };

  // 範囲選択開始
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Alt+クリックで表示モード切り替え
    if (e.altKey && onViewModeToggle) {
      onViewModeToggle();
      return;
    }

    // タスクバー上でのクリックは無視
    if ((e.target as HTMLElement).closest('.gantt-task-bar')) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const y = e.clientY - rect.top + scrollTop;

    setIsSelecting(true);
    setSelectionStart({ x, y });
    setSelectionEnd({ x, y });

    // Ctrlキーが押されていない場合は既存の選択をクリア
    if (!e.ctrlKey && onClearSelection) {
      onClearSelection();
    }
  };

  // 範囲選択中
  const handleMouseMove = (e: MouseEvent) => {
    if (!isSelecting || !selectionStart) return;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const y = e.clientY - rect.top + scrollTop;

    setSelectionEnd({ x, y });
  };

  // 範囲選択終了
  const handleMouseUp = () => {
    if (isSelecting && selectionStart && selectionEnd && onTaskSelection) {
      // 選択範囲内のタスクを特定
      const minX = Math.min(selectionStart.x, selectionEnd.x);
      const maxX = Math.max(selectionStart.x, selectionEnd.x);
      const minY = Math.min(selectionStart.y, selectionEnd.y);
      const maxY = Math.max(selectionStart.y, selectionEnd.y);

      tasks.forEach((task, index) => {
        const position = taskPositions.get(task.id);
        if (!position) return;

        // タスクバーが選択範囲と重なっているかチェック
        const taskLeft = position.left;
        const taskRight = position.left + position.width;
        const taskTop = position.top;
        const taskBottom = position.top + position.height;

        const isInSelection =
          taskRight >= minX &&
          taskLeft <= maxX &&
          taskBottom >= minY &&
          taskTop <= maxY;

        if (isInSelection) {
          onTaskSelection(task.id, true); // Ctrl押下と同じ動作
        }
      });
    }

    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  // 選択タスクのドラッグ移動開始
  const handleSelectionDragStart = (e: React.MouseEvent) => {
    if (selectedTaskIds.size === 0) return;

    setIsDraggingSelection(true);
    dragStartX.current = e.clientX;
    e.stopPropagation();
  };

  // 選択タスクのドラッグ中
  const handleSelectionDragMove = (e: MouseEvent) => {
    if (!isDraggingSelection) return;

    const deltaX = e.clientX - dragStartX.current;
    const totalDays = Math.floor((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const deltaDays = Math.round((deltaX / containerWidth) * totalDays);

    // プレビューは省略し、マウスアップ時に一括移動
  };

  // 選択タスクのドラッグ終了
  const handleSelectionDragEnd = (e: MouseEvent) => {
    if (!isDraggingSelection || !onBatchMove) {
      setIsDraggingSelection(false);
      return;
    }

    const deltaX = e.clientX - dragStartX.current;
    const totalDays = Math.floor((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const deltaDays = Math.round((deltaX / containerWidth) * totalDays);

    if (deltaDays !== 0) {
      onBatchMove(deltaDays);
    }

    setIsDraggingSelection(false);
  };

  // グローバルイベントリスナー
  useEffect(() => {
    if (isSelecting) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isSelecting, selectionStart, selectionEnd]);

  useEffect(() => {
    if (isDraggingSelection) {
      window.addEventListener('mousemove', handleSelectionDragMove);
      window.addEventListener('mouseup', handleSelectionDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleSelectionDragMove);
        window.removeEventListener('mouseup', handleSelectionDragEnd);
      };
    }
  }, [isDraggingSelection]);

  // 今日の位置を計算
  const todayPosition = calculateTodayPosition(dateRange, containerWidth);

  // プロジェクトごとにグループ化（タスクがないプロジェクトも含める）
  const projectGroups = useMemo(() => {
    const groups: { projectId: string; projectName: string; tasks: GanttTask[]; startRow: number; rowCount: number }[] = [];
    let rowIndex = 0;

    // タスクがあるプロジェクトをグループ化
    let currentProjectId: string | null = null;
    const projectsWithTasks = new Set<string>();

    tasks.forEach((task, index) => {
      // 親工程が折りたたまれている場合、子タスクはスキップ
      if (task.parentId && !expandedStageIds.has(task.parentId)) {
        return;
      }

      if (task.projectId !== currentProjectId) {
        currentProjectId = task.projectId;
        projectsWithTasks.add(task.projectId);
        groups.push({
          projectId: task.projectId,
          projectName: task.projectName,
          tasks: [],
          startRow: rowIndex,
          rowCount: 0
        });
        // プロジェクトヘッダーの行を追加
        rowIndex++;
      }
      groups[groups.length - 1].tasks.push(task);
      groups[groups.length - 1].rowCount++;
      rowIndex++;
    });

    // タスクがないプロジェクトもマイルストーンがあれば追加
    if (projectMap && projectMilestones.length > 0) {
      const projectsWithMilestones = new Set(projectMilestones.map(m => m.projectId));

      projectsWithMilestones.forEach(projectId => {
        if (!projectsWithTasks.has(projectId) && projectMap[projectId]) {
          groups.push({
            projectId,
            projectName: projectMap[projectId].物件名 || projectId,
            tasks: [],
            startRow: rowIndex,
            rowCount: 0
          });
          // プロジェクトヘッダーの行を追加
          rowIndex++;
        }
      });
    }

    return groups;
  }, [tasks, projectMap, projectMilestones, expandedStageIds]);

  // タスクの総高さを計算（プロジェクトヘッダー分も含む + 最後に空白のプロジェクト行）
  // 工程とタスクで異なる行の高さを使用
  const projectHeaderHeight = 32;
  const totalHeight = useMemo(() => {
    let height = projectGroups.length * projectHeaderHeight + projectHeaderHeight; // ヘッダー分
    tasks.forEach(task => {
      // 親工程が折りたたまれている場合、子タスクはスキップ
      if (task.parentId && !expandedStageIds.has(task.parentId)) {
        return;
      }
      const isStage = task.type === 'stage';
      height += isStage ? stageRowHeight : taskRowHeight;
    });
    return height;
  }, [tasks, projectGroups.length, projectHeaderHeight, stageRowHeight, taskRowHeight, expandedStageIds]);

  // 依存関係を解決
  const dependencies = useMemo(() => resolveDependencies(tasks), [tasks]);

  // タスクの位置マップを作成（プロジェクトヘッダーを考慮、工程/タスクで異なる高さ）
  const taskPositions = useMemo(() => {
    const positions = new Map<string, { left: number; width: number; top: number; height: number }>();
    let currentTop = 0;

    projectGroups.forEach((group, groupIndex) => {
      // プロジェクトヘッダー分の高さを追加
      currentTop += projectHeaderHeight;

      group.tasks.forEach((task, taskIndexInGroup) => {
        const isStage = task.type === 'stage';
        const currentRowHeight = isStage ? stageRowHeight : taskRowHeight;

        const position = calculateTaskBarPosition(
          task,
          dateRange,
          containerWidth,
          currentRowHeight,
          0  // 個別の位置計算には使わない
        );

        positions.set(task.id, {
          left: position.left,
          width: position.width,
          top: currentTop,
          height: currentRowHeight
        });

        // 次のタスクのために位置を進める
        currentTop += currentRowHeight;
      });
    });

    return positions;
  }, [tasks, dateRange, containerWidth, stageRowHeight, taskRowHeight, projectGroups, projectHeaderHeight]);

  // 範囲選択ボックスの計算
  const selectionBox = useMemo(() => {
    if (!isSelecting || !selectionStart || !selectionEnd) return null;

    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const maxX = Math.max(selectionStart.x, selectionEnd.x);
    const minY = Math.min(selectionStart.y, selectionEnd.y);
    const maxY = Math.max(selectionStart.y, selectionEnd.y);

    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [isSelecting, selectionStart, selectionEnd]);

  return (
    <div style={{ width: `${containerWidth}px`, minWidth: `${containerWidth}px` }}>
      {/* 時間軸（sticky固定、高さ64px） */}
      <div className="sticky top-0 bg-white border-b border-slate-200" style={{ height: '64px', zIndex: 30 }}>
        <GanttTimeAxis ticks={ticks} containerWidth={containerWidth} viewMode={viewMode} height={64} />
      </div>

      {/* タスクバー描画エリア */}
      <div className="relative bg-white" style={{ height: `${totalHeight}px` }} onMouseDown={handleMouseDown} onWheel={handleWheel}>
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
              // プロジェクトヘッダーの位置を計算（工程/タスクで異なる高さを考慮）
              const headerTop = groupIndex === 0 ? 0 : projectGroups.slice(0, groupIndex).reduce((sum, g) => {
                const groupHeight = g.tasks.reduce((h, t) => h + (t.type === 'stage' ? stageRowHeight : taskRowHeight), 0);
                return sum + groupHeight + projectHeaderHeight;
              }, 0);

              // このプロジェクトのマイルストーンを取得
              const projectMilestonesForThisProject = projectMilestones.filter(
                (m) => m.projectId === group.projectId
              );

              return (
                <React.Fragment key={group.projectId}>
                  {/* プロジェクトヘッダー背景 */}
                  <div
                    className="absolute left-0 right-0 bg-slate-100/50 pointer-events-none border-b border-slate-200"
                    style={{
                      top: `${headerTop}px`,
                      height: `${projectHeaderHeight}px`
                    }}
                  />

                  {/* プロジェクトマイルストーン（着工日、竣工予定日、引渡し予定日） */}
                  {projectMilestonesForThisProject.map((milestone, mIndex) => {
                    // マイルストーンのX位置を計算（日単位で計算してグリッドと同期）
                    const totalDaysInclusive = differenceInDays(dateRange.end, dateRange.start) + 1;
                    const dayWidth = containerWidth / totalDaysInclusive;

                    const daysFromStart = differenceInDays(milestone.date, dateRange.start);

                    // 範囲外のマイルストーンはスキップ
                    if (daysFromStart < 0 || daysFromStart >= totalDaysInclusive) return null;

                    // セルの中心に配置（マイルストーンはプロジェクトヘッダーの中心に表示）
                    const milestoneX = daysFromStart * dayWidth + (dayWidth / 2);
                    const milestoneY = headerTop + projectHeaderHeight / 2; // プロジェクトヘッダーの中心に表示

                    // マイルストーンの色を種類別に設定
                    let milestoneColor = 'bg-blue-500';
                    if (milestone.type === 'construction_start') milestoneColor = 'bg-green-500';
                    else if (milestone.type === 'completion') milestoneColor = 'bg-orange-500';
                    else if (milestone.type === 'delivery') milestoneColor = 'bg-purple-500';

                    return (
                      <div
                        key={`${group.projectId}-milestone-${mIndex}`}
                        className="absolute pointer-events-none"
                        style={{
                          left: `${milestoneX}px`,
                          top: `${milestoneY}px`,
                          transform: 'translate(-50%, -50%)',
                          zIndex: 20, // ガントチャートバーより上に表示
                        }}
                      >
                        {/* ダイヤモンド型のマーカー */}
                        <div
                          className={`w-3 h-3 ${milestoneColor} rotate-45 border-2 border-white shadow-md`}
                        />
                        {/* ラベル */}
                        <div
                          className="absolute top-4 left-1/2 transform -translate-x-1/2 text-xs font-medium whitespace-nowrap bg-white px-1 py-0.5 rounded shadow-sm border border-slate-200"
                          style={{ zIndex: 6 }}
                        >
                          {milestone.label}
                        </div>
                      </div>
                    );
                  })}

                  {/* プロジェクト内のタスク区切り線（工程/タスクで異なる高さを考慮） */}
                  {group.tasks.map((task, taskIndex) => {
                    const position = taskPositions.get(task.id);
                    if (!position) return null;
                    const y = position.top + position.height;
                    return (
                      <div
                        key={`${group.projectId}-${taskIndex}`}
                        className="absolute left-0 right-0 h-px bg-slate-100 pointer-events-none"
                        style={{ top: `${y}px` }}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* 今日の縦線 */}
            {todayPosition !== null && (
              <>
                {/* 背景のハイライト - 薄いブルー */}
                <div
                  className="absolute top-0 bottom-0 bg-blue-100/40 pointer-events-none"
                  style={{
                    left: `${todayPosition}px`,
                    width: `${containerWidth / ticks.length}px`,
                  }}
                />
                {/* 今日の線 - 細い青い点線 */}
                <div
                  className="absolute top-0 bottom-0 border-l border-blue-500 border-dashed pointer-events-none z-20"
                  style={{
                    left: `${todayPosition}px`,
                  }}
                />
              </>
            )}
          </div>

          {/* 依存関係の矢印（SVG） */}
          {dependencies.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: `${containerWidth}px`, height: `${totalHeight}px` }}
            >
              {dependencies.map((dep, index) => {
                const fromPos = taskPositions.get(dep.from.id);
                const toPos = taskPositions.get(dep.to.id);

                if (!fromPos || !toPos) return null;

                return (
                  <GanttDependencyArrow
                    key={`${dep.from.id}-${dep.to.id}-${index}`}
                    fromTask={dep.from}
                    toTask={dep.to}
                    fromPosition={fromPos}
                    toPosition={toPos}
                  />
                );
              })}
            </svg>
          )}

          {/* タスクバーとマイルストーン */}
          {tasks.map((task, index) => {
            const position = taskPositions.get(task.id);
            if (!position) return null;

            const isSelected = selectedTaskIds.has(task.id);

            // マイルストーンの場合は専用コンポーネントで表示
            if (task.milestone) {
              return (
                <GanttMilestone
                  key={task.id}
                  task={task}
                  position={position}
                  onClick={onTaskClick}
                />
              );
            }

            // 通常のタスクバー
            return (
              <div
                key={task.id}
                className="gantt-task-bar"
                onMouseDown={(e) => {
                  if (isSelected && selectedTaskIds.size > 1) {
                    handleSelectionDragStart(e);
                  }
                }}
              >
                <GanttTaskBar
                  task={task}
                  position={position}
                  dateRange={dateRange}
                  containerWidth={containerWidth}
                  onClick={onTaskClick}
                  onUpdate={handleTaskUpdateWithBatch}
                  onCopy={onTaskCopy}
                  interactive={interactive}
                />
                {/* 選択されたタスクのハイライト */}
                {isSelected && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: `${position.left}px`,
                      top: `${position.top}px`,
                      width: `${position.width}px`,
                      height: `${position.height}px`,
                      border: '2px solid #3b82f6',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      zIndex: 30,
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* 範囲選択ボックス */}
          {selectionBox && (
            <div
              className="absolute pointer-events-none z-40"
              style={{
                left: `${selectionBox.left}px`,
                top: `${selectionBox.top}px`,
                width: `${selectionBox.width}px`,
                height: `${selectionBox.height}px`,
                border: '2px dashed #3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
              }}
            />
          )}

          {/* 選択されたタスク数の表示 */}
          {selectedTaskIds.size > 0 && (
            <div className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
              <span className="font-medium">{selectedTaskIds.size}個のタスクを選択中</span>
              <button
                onClick={onClearSelection}
                className="ml-2 px-2 py-1 bg-white/20 hover:bg-white/30 rounded transition"
              >
                選択解除
              </button>
            </div>
          )}
        </div>
    </div>
  );
};
