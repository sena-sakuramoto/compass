// メインのガントチャートコンポーネント

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { GanttToolbar } from './GanttToolbar';
import { GanttTaskList } from './GanttTaskList';
import { GanttTimeline, ProjectMilestone } from './GanttTimeline';
import { GanttTimeAxis } from './GanttTimeAxis';
import { TaskEditModal } from './TaskEditModal';
import { BatchEditModal, BatchUpdate } from './BatchEditModal';
import type { GanttTask, ViewMode } from './types';
import { calculateDateRange, calculateDateTicks, calculateTodayPosition } from './utils';
import type { ProjectMember } from '../../lib/auth-types';
import { useJapaneseHolidaySet } from '../../lib/japaneseHolidays';

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
  onTaskBatchUpdate?: (taskIds: string[], updates: BatchUpdate) => void;
  onTaskDelete?: (task: GanttTask) => void;
  onTaskToggleComplete?: (task: GanttTask) => void;
  onProjectClick?: (projectId: string) => void;
  initialViewMode?: ViewMode;
  projectMap?: Record<string, { ステータス?: string;[key: string]: any }>;
  people?: Person[];
  allProjectMembers?: Map<string, ProjectMember[]>;
  onRequestPeople?: () => void;
  onRequestProjectMembers?: (projectId: string) => void;
  onStageAddTask?: (stage: GanttTask) => void;
  showMilestonesWithoutTasks?: boolean;
  jumpToTodayRef?: React.MutableRefObject<(() => void) | null>;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  interactive = false,
  onTaskClick,
  onTaskUpdate,
  onTaskCopy,
  onTaskSave,
  onTaskBatchUpdate,
  onTaskDelete,
  onTaskToggleComplete,
  onProjectClick,
  initialViewMode = 'day',
  projectMap,
  people = [],
  allProjectMembers,
  onRequestPeople,
  onRequestProjectMembers,
  onStageAddTask,
  showMilestonesWithoutTasks = false,
  jumpToTodayRef,
}) => {
  const holidaySet = useJapaneseHolidaySet();
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollLeftRef = useRef(0); // 比較用のref（横スクロール）
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0); // 比較用のref（縦スクロール）
  const [containerWidth, setContainerWidth] = useState(1200);
  const [zoomLevel, setZoomLevel] = useState(1.0); // ズームレベル（0.5～3.0）
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [expandedStageIds, setExpandedStageIds] = useState<Set<string>>(new Set());
  const taskListRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerTimelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedTask) return;
    if (people.length === 0) {
      onRequestPeople?.();
    }
    const projectId = selectedTask.projectId;
    if (projectId) {
      const members = allProjectMembers?.get(projectId);
      if (!members || members.length === 0) {
        onRequestProjectMembers?.(projectId);
      }
    }
  }, [selectedTask, people.length, allProjectMembers, onRequestPeople, onRequestProjectMembers]);

  // タスク一覧の幅（レスポンシブ）
  const [taskListWidth, setTaskListWidth] = useState(() => {
    if (typeof window === 'undefined') return 350;
    return window.innerWidth < 768 ? 180 : 350; // モバイルでは180px、デスクトップでは350px
  });

  // ウィンドウサイズ変更時にタスク一覧の幅を調整
  useEffect(() => {
    const handleResize = () => {
      setTaskListWidth(window.innerWidth < 768 ? 180 : 350);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 行の高さ（工程は大きく、タスクは小さく）
  const rowHeight = 48; // 互換性のためのデフォルト値
  const stageRowHeight = 48; // 工程行の高さ
  const taskRowHeight = 36;  // タスク行の高さ

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

    // 工程を初期状態で全て展開
    const stageIds = new Set<string>();
    tasks.forEach(task => {
      if (task.type === 'stage') {
        stageIds.add(task.id);
      }
    });
    setExpandedStageIds(stageIds);
  }, [tasks]);

  // 日付軸のティックを計算
  const ticks = useMemo(
    () => calculateDateTicks(dateRange.start, dateRange.end, viewMode, holidaySet),
    [dateRange, viewMode, holidaySet]
  );

  // プロジェクトマイルストーンを生成（着工日、竣工予定日、引渡し予定日）
  const projectMilestones = useMemo<ProjectMilestone[]>(() => {
    if (!projectMap) return [];

    const milestones: ProjectMilestone[] = [];
    const taskProjectIds = new Set(tasks.map((task) => task.projectId));

    Object.entries(projectMap).forEach(([projectId, project]) => {
      if (!showMilestonesWithoutTasks && !taskProjectIds.has(projectId)) return;
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
  }, [projectMap, tasks, showMilestonesWithoutTasks]);

  // コンテナ幅の計算（ズームレベルを適用）
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth - taskListWidth - 2; // ボーダー分を引く

        // 1単位あたりの幅を計算（ズームレベルを適用）
        let baseUnitWidth: number;
        if (viewMode === 'day') {
          // 1日あたりの基準幅を30pxとし、ズームレベルで調整
          baseUnitWidth = 30 * zoomLevel;
        } else if (viewMode === 'week') {
          // 1週あたりの基準幅を100pxとし、ズームレベルで調整
          baseUnitWidth = 100 * zoomLevel;
        } else {
          // 1ヶ月あたりの基準幅を120pxとし、ズームレベルで調整
          baseUnitWidth = 120 * zoomLevel;
        }

        // 総幅を計算（単位数 × 単位幅）
        const totalUnits = ticks.length;
        let calculatedWidth = totalUnits * baseUnitWidth;

        // 最小幅を確保（利用可能な幅以上）
        calculatedWidth = Math.max(availableWidth, calculatedWidth);

        // 日表示の場合は、幅が日数の整数倍になるように調整（サブピクセルレンダリング対策）
        // これにより、各日の列幅が正確に整数のピクセル幅になり、ヘッダーとグリッドのずれを防ぐ
        if (viewMode === 'day' && ticks.length > 0) {
          const tickWidth = Math.round(calculatedWidth / ticks.length);
          calculatedWidth = tickWidth * ticks.length;
        }

        setContainerWidth(calculatedWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [taskListWidth, viewMode, ticks.length, zoomLevel]);

  // スクロール同期用のRAFフラグ
  const scrollRAFRef = useRef<number | null>(null);

  const handleZoomIn = () => {
    // ズームイン処理：現在表示されている範囲を縮小
    const currentRangeMs = dateRange.end.getTime() - dateRange.start.getTime();
    const newRangeMs = Math.max(
      7 * 24 * 60 * 60 * 1000, // 最小7日
      currentRangeMs / 1.5
    );

    // 現在の表示範囲の中心を計算（スクロール位置を考慮）
    const viewportWidth = timelineRef.current?.clientWidth || containerWidth;
    const viewportCenterX = scrollLeft + viewportWidth / 2;
    const scrollRatio = viewportCenterX / containerWidth;

    // 中心日付を計算
    const centerMs = dateRange.start.getTime() + currentRangeMs * scrollRatio;

    // 中心を維持して範囲を縮小
    const newStart = new Date(centerMs - newRangeMs * scrollRatio);
    const newEnd = new Date(centerMs + newRangeMs * (1 - scrollRatio));

    setDateRange({ start: newStart, end: newEnd });
    setZoomLevel(prev => Math.min(prev * 1.5, 3.0));
  };

  const handleZoomOut = () => {
    // ズームアウト処理：現在表示されている範囲を拡大
    const currentRangeMs = dateRange.end.getTime() - dateRange.start.getTime();
    const newRangeMs = Math.min(
      730 * 24 * 60 * 60 * 1000, // 最大730日(2年)
      currentRangeMs * 1.5
    );

    // 現在の表示範囲の中心を計算（スクロール位置を考慮）
    const viewportWidth = timelineRef.current?.clientWidth || containerWidth;
    const viewportCenterX = scrollLeft + viewportWidth / 2;
    const scrollRatio = viewportCenterX / containerWidth;

    // 中心日付を計算
    const centerMs = dateRange.start.getTime() + currentRangeMs * scrollRatio;

    // 中心を維持して範囲を拡大
    const newStart = new Date(centerMs - newRangeMs * scrollRatio);
    const newEnd = new Date(centerMs + newRangeMs * (1 - scrollRatio));

    setDateRange({ start: newStart, end: newEnd });
    setZoomLevel(prev => Math.max(prev / 1.5, 0.1));
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
    if (task.type === 'stage' && onStageAddTask) {
      onStageAddTask(task);
      return;
    }
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

  // 一括編集ハンドラ
  const handleBatchEdit = () => {
    if (selectedTaskIds.size === 0) return;
    setShowBatchEditModal(true);
  };

  // 一括編集保存ハンドラ
  const handleBatchEditSave = (updates: BatchUpdate) => {
    if (!onTaskBatchUpdate || selectedTaskIds.size === 0) return;
    onTaskBatchUpdate(Array.from(selectedTaskIds), updates);
    handleClearSelection();
  };

  // ドラッグで工程に割り当てるハンドラ
  const handleBatchAssignToStage = (taskIds: string[], stageId: string | null) => {
    if (!onTaskBatchUpdate || taskIds.length === 0) return;
    onTaskBatchUpdate(taskIds, { parentId: stageId });
    handleClearSelection();
  };

  // フックは早期リターンの前に配置する（Reactのルール）
  const handleJumpToToday = useCallback(() => {
    if (tasks.length === 0) return;
    const baseRange = calculateDateRange(tasks);
    setDateRange(baseRange);
    setZoomLevel(1);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const timelineEl = timelineRef.current;
        if (!timelineEl) return;
        const todayPx = calculateTodayPosition(baseRange, timelineEl.scrollWidth);
        if (todayPx == null) return;
        // 今日を左から1/4の位置に表示（初期スクロールと統一）
        const target = Math.max(todayPx - timelineEl.clientWidth / 4, 0);
        timelineEl.scrollLeft = target;
        setScrollLeft(target);
        // 日付ヘッダーも同期
        if (headerTimelineRef.current) {
          headerTimelineRef.current.style.transform = `translateX(-${target}px)`;
        }
      });
    });
  }, [tasks]);

  // 外部からjumpToTodayを呼び出せるようにする
  useEffect(() => {
    if (jumpToTodayRef) {
      jumpToTodayRef.current = handleJumpToToday;
    }
  }, [jumpToTodayRef, handleJumpToToday]);

  // タスクがない場合の表示（すべてのフックの後で判定）
  if (tasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
        表示できるタスクがありません
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full flex flex-col bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <div className="pointer-events-none absolute right-4 top-3 z-20 flex justify-end">
        <GanttToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onToday={handleJumpToToday}
          className="pointer-events-auto"
        />
      </div>

      {/* メインコンテンツ - 単一スクロールコンテナ */}
      <div
        ref={timelineRef}
        className="flex-1 overflow-auto"
        onScroll={(e) => {
          const left = e.currentTarget.scrollLeft;
          const top = e.currentTarget.scrollTop;

          // 状態更新はRAFでバッチ処理
          if (scrollLeftRef.current !== left || scrollTopRef.current !== top) {
            scrollLeftRef.current = left;
            scrollTopRef.current = top;

            if (scrollRAFRef.current) {
              cancelAnimationFrame(scrollRAFRef.current);
            }
            scrollRAFRef.current = requestAnimationFrame(() => {
              setScrollLeft(scrollLeftRef.current);
              setScrollTop(scrollTopRef.current);
              scrollRAFRef.current = null;
            });
          }
        }}
      >
        {/* 横並びコンテナ（全体の幅 = タスクリスト + タイムライン） */}
        <div className="flex" style={{ width: `${taskListWidth + containerWidth}px` }}>
          {/* タスク一覧（左側固定 - sticky） */}
          <div
            ref={taskListRef}
            className="sticky left-0 z-40 bg-white flex-shrink-0"
            style={{ width: `${taskListWidth}px` }}
          >
            <GanttTaskList
              tasks={tasks}
              rowHeight={rowHeight}
              stageRowHeight={stageRowHeight}
              taskRowHeight={taskRowHeight}
              onTaskClick={handleTaskClickInternal}
              onTaskToggleComplete={onTaskToggleComplete}
              onProjectClick={onProjectClick}
              scrollTop={scrollTop}
              projectMap={projectMap}
              projectMilestones={projectMilestones}
              expandedStageIds={expandedStageIds}
              onToggleStage={(stageId) => {
                setExpandedStageIds(prev => {
                  const newSet = new Set(prev);
                  if (newSet.has(stageId)) {
                    newSet.delete(stageId);
                  } else {
                    newSet.add(stageId);
                  }
                  return newSet;
                });
              }}
            />
          </div>

          {/* タイムライン（右側） */}
          <div style={{ width: `${containerWidth}px` }}>
          <GanttTimeline
            tasks={tasks}
            ticks={ticks}
            dateRange={dateRange}
            containerWidth={containerWidth}
            rowHeight={rowHeight}
            stageRowHeight={stageRowHeight}
            taskRowHeight={taskRowHeight}
            viewMode={viewMode}
            onTaskClick={handleTaskClickInternal}
            onTaskUpdate={onTaskUpdate}
            onTaskCopy={onTaskCopy}
            interactive={interactive}
            scrollLeft={scrollLeft}
            scrollTop={scrollTop}
            selectedTaskIds={selectedTaskIds}
            onTaskSelection={handleTaskSelection}
            onBatchMove={handleBatchMove}
            onBatchAssignToStage={onTaskBatchUpdate ? handleBatchAssignToStage : undefined}
            onClearSelection={handleClearSelection}
            onBatchEdit={onTaskBatchUpdate ? handleBatchEdit : undefined}
            onViewModeToggle={handleViewModeToggle}
            projectMilestones={projectMilestones}
            projectMap={projectMap}
            expandedStageIds={expandedStageIds}
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
      </div>

      {/* タスク編集モーダル */}
      {selectedTask && (() => {
        const projectStages = tasks.filter(t => t.type === 'stage' && t.projectId === selectedTask.projectId);
        const projectMembers = selectedTask.projectId && allProjectMembers
          ? allProjectMembers.get(selectedTask.projectId) || []
          : [];
        return (
          <TaskEditModal
            task={selectedTask}
            allTasks={tasks}
            people={people}
            projectMembers={projectMembers}
            stages={projectStages}
            onClose={handleModalClose}
            onSave={handleTaskSaveInternal}
            onDelete={onTaskDelete}
          />
        );
      })()}

      {/* 一括編集モーダル */}
      {showBatchEditModal && selectedTaskIds.size > 0 && (
        <BatchEditModal
          selectedTasks={tasks.filter(t => selectedTaskIds.has(t.id))}
          projectMembers={(() => {
            // 選択されたタスクのプロジェクトからメンバーを取得
            const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id));
            const projectIds = new Set(selectedTasks.map(t => t.projectId));
            const members: ProjectMember[] = [];
            projectIds.forEach(pid => {
              const pm = allProjectMembers?.get(pid) || [];
              pm.forEach(m => {
                if (!members.find(existing => existing.userId === m.userId)) {
                  members.push(m);
                }
              });
            });
            return members;
          })()}
          stages={(() => {
            // 選択されたタスクのプロジェクトに属する工程を取得
            const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id));
            const projectIds = new Set(selectedTasks.map(t => t.projectId));
            return tasks.filter(t => t.type === 'stage' && projectIds.has(t.projectId));
          })()}
          onClose={() => setShowBatchEditModal(false)}
          onSave={handleBatchEditSave}
        />
      )}
    </div>
  );
};

// エクスポート用
export * from './types';
