// タイムラインコンポーネント（右側、横スクロール）

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { GanttTimeAxis } from './GanttTimeAxis';
import { GanttTaskBar } from './GanttTaskBar';
import { GanttMilestone } from './GanttMilestone';
import { GanttDependencyArrow } from './GanttDependencyArrow';
import type { GanttTask, DateTick } from './types';
import { calculateTaskBarPosition, calculateTodayPosition, resolveDependencies } from './utils';

interface GanttTimelineProps {
  tasks: GanttTask[];
  ticks: DateTick[];
  dateRange: { start: Date; end: Date };
  containerWidth: number;
  rowHeight: number;
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
  viewMode,
  onTaskClick,
  onTaskUpdate,
  onTaskCopy,
  interactive = false,
  scrollLeft = 0,
  scrollTop = 0,
  onScroll,
  selectedTaskIds = new Set(),
  onTaskSelection,
  onBatchMove,
  onClearSelection,
  onViewModeToggle,
  onZoom
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // スクロール位置を同期
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollTop;
    }
  }, [scrollTop]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (onScroll) {
      onScroll(e.currentTarget.scrollLeft, e.currentTarget.scrollTop);
    }
  };

  // Alt+スクロールでズーム、Shift+スクロールで横スクロール
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleWheel = (e: WheelEvent) => {
      // Shift+スクロールで横スクロール
      if (e.shiftKey) {
        e.preventDefault();
        element.scrollLeft += e.deltaY;
        if (onScroll) {
          onScroll(element.scrollLeft, element.scrollTop);
        }
        return;
      }

      // Alt+スクロールでズーム
      if (e.altKey && onZoom) {
        e.preventDefault();
        if (e.deltaY < 0) {
          onZoom('in');
        } else {
          onZoom('out');
        }
      }
    };

    // passive: falseを明示的に指定してpreventDefaultを使用可能に
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [onZoom, onScroll]);

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
    const x = e.clientX - rect.left + scrollRef.current!.scrollLeft;
    const y = e.clientY - rect.top + scrollRef.current!.scrollTop;

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
    if (!isSelecting || !selectionStart || !scrollRef.current) return;

    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    const y = e.clientY - rect.top + scrollRef.current.scrollTop;

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
        const taskBottom = position.top + rowHeight;

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

  // プロジェクトごとにグループ化
  const projectGroups = useMemo(() => {
    const groups: { projectId: string; projectName: string; tasks: GanttTask[]; startRow: number; rowCount: number }[] = [];
    let currentProjectId: string | null = null;
    let rowIndex = 0;

    tasks.forEach((task, index) => {
      if (task.projectId !== currentProjectId) {
        currentProjectId = task.projectId;
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

    return groups;
  }, [tasks]);

  // タスクの総高さを計算（プロジェクトヘッダー分も含む）
  const projectHeaderHeight = 32;
  const totalHeight = tasks.length * rowHeight + projectGroups.length * projectHeaderHeight;

  // 依存関係を解決
  const dependencies = useMemo(() => resolveDependencies(tasks), [tasks]);

  // タスクの位置マップを作成（プロジェクトヘッダーを考慮）
  const taskPositions = useMemo(() => {
    const positions = new Map<string, { left: number; width: number; top: number }>();
    let currentTop = 0;

    projectGroups.forEach((group, groupIndex) => {
      // プロジェクトヘッダー分の高さを追加
      currentTop += projectHeaderHeight;

      group.tasks.forEach((task, taskIndexInGroup) => {
        const position = calculateTaskBarPosition(
          task,
          dateRange,
          containerWidth,
          rowHeight,
          0  // 個別の位置計算には使わない
        );

        positions.set(task.id, {
          left: position.left,
          width: position.width,
          top: currentTop
        });

        // 次のタスクのために位置を進める
        currentTop += rowHeight;
      });
    });

    return positions;
  }, [tasks, dateRange, containerWidth, rowHeight, projectGroups, projectHeaderHeight]);

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
    <div ref={scrollRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
      <div className="relative" style={{ minWidth: `${containerWidth}px` }}>
        {/* 時間軸 */}
        <div className="sticky top-0 z-10 bg-white">
          <GanttTimeAxis ticks={ticks} containerWidth={containerWidth} viewMode={viewMode} />
        </div>

        {/* タスクバー描画エリア */}
        <div
          className="relative bg-white"
          style={{ height: `${totalHeight}px`, minWidth: `${containerWidth}px` }}
          onMouseDown={handleMouseDown}
        >
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
              const headerTop = groupIndex === 0 ? 0 : projectGroups.slice(0, groupIndex).reduce((sum, g) => sum + g.rowCount * rowHeight + projectHeaderHeight, 0);

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

                  {/* プロジェクト内のタスク区切り線 */}
                  {group.tasks.map((_, taskIndex) => {
                    const y = headerTop + projectHeaderHeight + (taskIndex + 1) * rowHeight;
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
                {/* 背景のハイライト - 薄い赤 */}
                <div
                  className="absolute top-0 bottom-0 bg-red-50 pointer-events-none"
                  style={{
                    left: `${todayPosition}px`,
                    width: `${containerWidth / ticks.length}px`,
                  }}
                />
                {/* 今日の線 - シンプルで目立つ赤い線 */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20"
                  style={{
                    left: `${todayPosition}px`,
                  }}
                >
                  {/* トップの小さいマーカー */}
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full shadow-md" />
                  </div>
                </div>
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
                      height: `${rowHeight}px`,
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
    </div>
  );
};
