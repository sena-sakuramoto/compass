// メインのガントチャートコンポーネント

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GanttToolbar } from './GanttToolbar';
import { GanttTaskList } from './GanttTaskList';
import { GanttTimeline } from './GanttTimeline';
import { TaskEditModal } from './TaskEditModal';
import type { GanttTask, ViewMode } from './types';
import { calculateDateRange, calculateDateTicks } from './utils';

interface GanttChartProps {
  tasks: GanttTask[];
  interactive?: boolean;
  onTaskClick?: (task: GanttTask) => void;
  onTaskUpdate?: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  onTaskCopy?: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  onTaskSave?: (task: GanttTask) => void;
  onTaskToggleComplete?: (task: GanttTask) => void;
  initialViewMode?: ViewMode;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  interactive = false,
  onTaskClick,
  onTaskUpdate,
  onTaskCopy,
  onTaskSave,
  onTaskToggleComplete,
  initialViewMode = 'day'
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [zoomLevel, setZoomLevel] = useState(1.0); // ズームレベル（0.5～3.0）
  const [taskListWidth] = useState(350); // タスク一覧の固定幅
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const taskListRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 行の高さ
  const rowHeight = 48;

  // 日付範囲を計算
  const dateRange = useMemo(() => calculateDateRange(tasks), [tasks]);

  // 日付軸のティックを計算
  const ticks = useMemo(
    () => calculateDateTicks(dateRange.start, dateRange.end, viewMode),
    [dateRange, viewMode]
  );

  // コンテナ幅の計算（ズームレベルを適用）
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth - taskListWidth - 2; // ボーダー分を引く

        // 基準となる幅を計算
        let baseWidth: number;
        if (viewMode === 'day') {
          // 1日あたりの基準幅を30pxとする
          const baseDayWidth = 30;
          const totalDays = ticks.length;
          baseWidth = Math.max(availableWidth, totalDays * baseDayWidth);
        } else if (viewMode === 'week') {
          baseWidth = Math.max(availableWidth, 800);
        } else {
          baseWidth = Math.max(availableWidth, 600);
        }

        // ズームレベルを適用
        const zoomedWidth = baseWidth * zoomLevel;
        setContainerWidth(zoomedWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [taskListWidth, viewMode, ticks.length, zoomLevel]);

  // タスク一覧とタイムラインのスクロール同期
  const handleTimelineScroll = (left: number, top: number) => {
    setScrollLeft(left);
    setScrollTop(top);

    // タスク一覧の縦スクロールを同期
    if (taskListRef.current) {
      taskListRef.current.scrollTop = top;
    }
  };

  const handleTaskListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    setScrollTop(top);

    // タイムラインの縦スクロールを同期
    if (timelineRef.current) {
      timelineRef.current.scrollTop = top;
    }
  };


  const handleZoomIn = () => {
    // ズームイン処理：ズームレベルを上げる
    setZoomLevel(prev => Math.min(prev * 1.2, 3.0));
  };

  const handleZoomOut = () => {
    // ズームアウト処理：ズームレベルを下げる
    setZoomLevel(prev => Math.max(prev / 1.2, 0.3));
  };

  // Alt+クリックで表示モード切り替え
  const handleViewModeToggle = () => {
    if (viewMode === 'day') {
      setViewMode('week');
    } else if (viewMode === 'week') {
      setViewMode('month');
    } else {
      setViewMode('day');
    }
  };

  const handleTaskClickInternal = (task: GanttTask) => {
    setSelectedTask(task);
    if (onTaskClick) {
      onTaskClick(task);
    }
  };

  const handleTaskSaveInternal = (task: GanttTask) => {
    if (onTaskSave) {
      onTaskSave(task);
    }
    setSelectedTask(null);
  };

  const handleModalClose = () => {
    setSelectedTask(null);
  };

  // 複数タスク選択のハンドラ
  const handleTaskSelection = (taskId: string, isCtrlPressed: boolean) => {
    if (isCtrlPressed) {
      // Ctrlキーが押されている場合は追加/削除
      setSelectedTaskIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(taskId)) {
          newSet.delete(taskId);
        } else {
          newSet.add(taskId);
        }
        return newSet;
      });
    } else {
      // 単一選択
      setSelectedTaskIds(new Set([taskId]));
    }
  };

  // 選択解除
  const handleClearSelection = () => {
    setSelectedTaskIds(new Set());
  };

  // バッチ移動ハンドラ
  const handleBatchMove = (deltaDays: number) => {
    if (!onTaskUpdate || selectedTaskIds.size === 0) return;

    const selectedTasks = tasks.filter(task => selectedTaskIds.has(task.id));

    selectedTasks.forEach(task => {
      const newStartDate = new Date(task.startDate);
      newStartDate.setDate(newStartDate.getDate() + deltaDays);

      const newEndDate = new Date(task.endDate);
      newEndDate.setDate(newEndDate.getDate() + deltaDays);

      onTaskUpdate(task, newStartDate, newEndDate);
    });

    // 移動後に選択を解除
    handleClearSelection();
  };

  if (tasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
        表示できるタスクがありません
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      {/* ツールバー */}
      <GanttToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />

      {/* メインコンテンツ */}
      <div className="flex-1 flex overflow-hidden">
        {/* タスク一覧（左側固定） */}
        <div
          ref={taskListRef}
          className="flex-shrink-0 overflow-y-auto overflow-x-hidden"
          style={{ width: `${taskListWidth}px` }}
          onScroll={handleTaskListScroll}
        >
          <GanttTaskList
            tasks={tasks}
            rowHeight={rowHeight}
            onTaskClick={handleTaskClickInternal}
            onTaskToggleComplete={onTaskToggleComplete}
            scrollTop={scrollTop}
          />
        </div>

        {/* タイムライン（右側、横スクロール） */}
        <div ref={timelineRef} className="flex-1 overflow-hidden">
          <GanttTimeline
            tasks={tasks}
            ticks={ticks}
            dateRange={dateRange}
            containerWidth={containerWidth}
            rowHeight={rowHeight}
            viewMode={viewMode}
            onTaskClick={handleTaskClickInternal}
            onTaskUpdate={onTaskUpdate}
            onTaskCopy={onTaskCopy}
            interactive={interactive}
            scrollLeft={scrollLeft}
            scrollTop={scrollTop}
            onScroll={handleTimelineScroll}
            selectedTaskIds={selectedTaskIds}
            onTaskSelection={handleTaskSelection}
            onBatchMove={handleBatchMove}
            onClearSelection={handleClearSelection}
            onViewModeToggle={handleViewModeToggle}
            onZoom={(direction) => {
              if (direction === 'in') {
                handleZoomIn();
              } else {
                handleZoomOut();
              }
            }}
          />
        </div>
      </div>

      {/* タスク編集モーダル */}
      <TaskEditModal
        task={selectedTask}
        allTasks={tasks}
        onClose={handleModalClose}
        onSave={handleTaskSaveInternal}
      />
    </div>
  );
};

// エクスポート用
export * from './types';
