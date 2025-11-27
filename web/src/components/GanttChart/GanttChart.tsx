// メインのガントチャートコンポーネント

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GanttToolbar } from './GanttToolbar';
import { GanttTaskList } from './GanttTaskList';
import { GanttTimeline, ProjectMilestone } from './GanttTimeline';
import { TaskEditModal } from './TaskEditModal';
import type { GanttTask, ViewMode } from './types';
import { calculateDateRange, calculateDateTicks } from './utils';

interface Person {
  id: string;
  氏名: string;
  メール?: string;
  [key: string]: any;
}

interface GanttChartProps {
  tasks: GanttTask[];
  interactive?: boolean;
  onTaskClick?: (task: GanttTask) => void;
  onTaskUpdate?: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  onTaskCopy?: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  onTaskSave?: (task: GanttTask & { assigneeEmail?: string }) => void;
  onTaskDelete?: (task: GanttTask) => void;
  onTaskToggleComplete?: (task: GanttTask) => void;
  onProjectClick?: (projectId: string) => void;
  initialViewMode?: ViewMode;
  projectMap?: Record<string, { ステータス?: string;[key: string]: any }>;
  people?: Person[];
}

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  interactive = false,
  onTaskClick,
  onTaskUpdate,
  onTaskCopy,
  onTaskSave,
  onTaskDelete,
  onTaskToggleComplete,
  onProjectClick,
  initialViewMode = 'day',
  projectMap,
  people = []
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

  // 日付範囲を計算（安定した範囲を維持）
  const [dateRange, setDateRange] = useState(() => calculateDateRange(tasks));

  // タスクが変更されたときに日付範囲を更新（拡張のみ、縮小しない）
  useEffect(() => {
    const newRange = calculateDateRange(tasks, dateRange);
    // 範囲が実際に変更された場合のみ更新
    if (newRange.start.getTime() !== dateRange.start.getTime() ||
      newRange.end.getTime() !== dateRange.end.getTime()) {
      setDateRange(newRange);
    }
  }, [tasks]);

  // 日付軸のティックを計算
  const ticks = useMemo(
    () => calculateDateTicks(dateRange.start, dateRange.end, viewMode),
    [dateRange, viewMode]
  );

  // プロジェクトマイルストーンを生成（着工日、竣工予定日、引渡し予定日）
  const projectMilestones = useMemo<ProjectMilestone[]>(() => {
    if (!projectMap) return [];

    const milestones: ProjectMilestone[] = [];

    Object.entries(projectMap).forEach(([projectId, project]) => {
      // 現地調査日
      if (project.現地調査日) {
        const date = new Date(project.現地調査日);
        if (!isNaN(date.getTime())) {
          milestones.push({
            projectId,
            date,
            label: '現地調査',
            type: 'survey',
          });
        }
      }

      // 着工日
      if (project.着工日) {
        const date = new Date(project.着工日);
        if (!isNaN(date.getTime())) {
          milestones.push({
            projectId,
            date,
            label: '着工',
            type: 'construction_start',
          });
        }
      }

      // 竣工予定日
      if (project.竣工予定日) {
        const date = new Date(project.竣工予定日);
        if (!isNaN(date.getTime())) {
          milestones.push({
            projectId,
            date,
            label: '竣工',
            type: 'completion',
          });
        }
      }

      // 引渡し予定日
      if (project.引渡し予定日) {
        const date = new Date(project.引渡し予定日);
        if (!isNaN(date.getTime())) {
          milestones.push({
            projectId,
            date,
            label: '引渡し',
            type: 'delivery',
          });
        }
      }
    });

    return milestones;
  }, [projectMap]);

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
        let zoomedWidth = baseWidth * zoomLevel;

        // 日表示の場合は、幅が日数の整数倍になるように調整（サブピクセルレンダリング対策）
        // これにより、各日の列幅が正確に整数のピクセル幅になり、ヘッダーとグリッドのずれを防ぐ
        if (viewMode === 'day' && ticks.length > 0) {
          const tickWidth = Math.round(zoomedWidth / ticks.length);
          zoomedWidth = tickWidth * ticks.length;
        }

        setContainerWidth(zoomedWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [taskListWidth, viewMode, ticks.length, zoomLevel]);

  // タイムラインのスクロール処理
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

    // タイムラインの縦スクロールを直接同期
    if (timelineRef.current) {
      timelineRef.current.scrollTop = top;
    }
  };

  // タスクリスト側でのホイールイベントを処理（縦スクロールをタイムライン側に転送）
  useEffect(() => {
    const taskListElement = taskListRef.current;
    if (!taskListElement) return;

    const handleWheel = (e: WheelEvent) => {
      // Alt+スクロール（ズーム）とShift+スクロール（横スクロール）は処理しない
      if (e.altKey || e.shiftKey) {
        return;
      }

      // 横スクロールの場合は処理しない
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        return;
      }

      // 縦スクロールの場合、タイムライン側にスクロールを転送
      if (timelineRef.current && Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        timelineRef.current.scrollTop += e.deltaY;
      }
    };

    taskListElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      taskListElement.removeEventListener('wheel', handleWheel);
    };
  }, []);



  const handleZoomIn = () => {
    // ズームイン処理：今日を基準に範囲を縮小（未来重視：前25%、後75%）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentRangeMs = dateRange.end.getTime() - dateRange.start.getTime();
    const newRangeMs = Math.max(
      7 * 24 * 60 * 60 * 1000, // 最小7日
      currentRangeMs / 1.2
    );

    // todayが範囲外の場合は範囲に含める
    if (today < dateRange.start || today > dateRange.end) {
      const pastRange = newRangeMs * 0.17;
      const futureRange = newRangeMs * 0.83;
      const newStart = new Date(today.getTime() - pastRange);
      const newEnd = new Date(today.getTime() + futureRange);
      setDateRange({ start: newStart, end: newEnd });
      return;
    }

    // todayを基準に新しい範囲を計算（前17%、後83%）
    const pastRange = newRangeMs * 0.17;
    const futureRange = newRangeMs * 0.83;
    const newStart = new Date(today.getTime() - pastRange);
    const newEnd = new Date(today.getTime() + futureRange);

    setDateRange({ start: newStart, end: newEnd });
    setZoomLevel(prev => Math.min(prev * 1.2, 3.0));
  };

  const handleZoomOut = () => {
    // ズームアウト処理：今日を基準に範囲を拡大（未来重視：前17%、後83%）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentRangeMs = dateRange.end.getTime() - dateRange.start.getTime();
    const newRangeMs = Math.min(
      365 * 24 * 60 * 60 * 1000, // 最大365日
      currentRangeMs * 1.2
    );

    // todayが範囲外の場合は範囲に含める
    if (today < dateRange.start || today > dateRange.end) {
      const pastRange = newRangeMs * 0.17;
      const futureRange = newRangeMs * 0.83;
      const newStart = new Date(today.getTime() - pastRange);
      const newEnd = new Date(today.getTime() + futureRange);
      setDateRange({ start: newStart, end: newEnd });
      return;
    }

    // todayを基準に新しい範囲を計算（前17%、後83%）
    const pastRange = newRangeMs * 0.17;
    const futureRange = newRangeMs * 0.83;
    const newStart = new Date(today.getTime() - pastRange);
    const newEnd = new Date(today.getTime() + futureRange);

    setDateRange({ start: newStart, end: newEnd });
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
          className="flex-shrink-0 overflow-y-hidden overflow-x-hidden"
          style={{ width: `${taskListWidth}px` }}
          onScroll={handleTaskListScroll}
        >
          <GanttTaskList
            tasks={tasks}
            rowHeight={rowHeight}
            onTaskClick={handleTaskClickInternal}
            onTaskToggleComplete={onTaskToggleComplete}
            onProjectClick={onProjectClick}
            scrollTop={scrollTop}
            projectMap={projectMap}
            projectMilestones={projectMilestones}
          />
        </div>

        {/* タイムライン（右側、横スクロール） */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-hidden"
        >
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
            projectMilestones={projectMilestones}
            projectMap={projectMap}
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
        people={people}
        onClose={handleModalClose}
        onSave={handleTaskSaveInternal}
        onDelete={onTaskDelete}
      />
    </div>
  );
};

// エクスポート用
export * from './types';
