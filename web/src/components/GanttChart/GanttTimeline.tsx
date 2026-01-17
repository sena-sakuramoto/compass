// タイムラインコンポーネント（右側、横スクロール）

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
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
  type: 'survey' | 'construction_start' | 'completion' | 'delivery' | 'layout' | 'basic_design' | 'design_survey' | 'estimate' | 'interim_inspection';
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
  selectedTaskIds?: Set<string>;
  onTaskSelection?: (taskId: string, isCtrlPressed: boolean) => void;
  onBatchMove?: (deltaDays: number) => void;
  onBatchAssignToStage?: (taskIds: string[], stageId: string | null) => void;
  onClearSelection?: () => void;
  onViewModeToggle?: () => void;
  projectMilestones?: ProjectMilestone[];
  projectMap?: Record<string, { 物件名?: string; ステータス?: string;[key: string]: any }>;
  expandedStageIds?: Set<string>;
  expandedProjectIds?: Set<string>;
}

interface GanttTimelinePropsExtended extends GanttTimelineProps {
  onZoom?: (direction: 'in' | 'out') => void;
  onBatchEdit?: () => void;
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
  selectedTaskIds = new Set(),
  projectMilestones = [],
  projectMap,
  onTaskSelection,
  onBatchMove,
  onBatchAssignToStage,
  onClearSelection,
  onViewModeToggle,
  onZoom,
  onBatchEdit,
  expandedStageIds = new Set(),
  expandedProjectIds = new Set()
}) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [isDraggingTask, setIsDraggingTask] = useState(false);
  const [dragPreviewOffset, setDragPreviewOffset] = useState(0);
  const [hoveredStageId, setHoveredStageId] = useState<string | null>(null);
  const dragStartX = useRef<number>(0);
  const dragStartY = useRef<number>(0);
  const hoveredStageIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef<number>(scrollTop);
  const touchStateRef = useRef<{
    initialDistance: number;
    lastDistance: number;
    pinch: boolean;
  } | null>(null);

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


  // Ctrl+スクロールでズーム
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey && onZoom) {
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

    const targetEl = e.target as HTMLElement;
    const barEl = targetEl.closest('.gantt-task-bar') as HTMLElement | null;

    // 選択済みタスクのバーを掴んだらバッチドラッグ開始
    if (barEl) {
      const taskId = barEl.dataset.taskId;
      const isResizeHandle = Boolean(
        targetEl.closest('[data-resize-handle="start"], [data-resize-handle="end"]')
      );
      if (!isResizeHandle && taskId && selectedTaskIds.has(taskId)) {
        handleSelectionDragStart(e);
        return;
      }
    }

    // バー以外でも、選択済みタスクの行上ならバッチドラッグ開始
    if (selectedTaskIds.size > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top + scrollTop;
      const selectedInRow = Array.from(selectedTaskIds).find((id) => {
        const position = taskPositionsRef.current.get(id);
        return position && y >= position.top && y <= position.top + position.height;
      });
      if (selectedInRow) {
        handleSelectionDragStart(e);
        return;
      }
    }

    // タスクバー上でのクリックは範囲選択を無視
    if (barEl) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsSelecting(true);
    setSelectionStart({ x, y });
    setSelectionEnd({ x, y });

    // Ctrlキーが押されていない場合は既存の選択をクリア
    if (!e.ctrlKey && onClearSelection) {
      onClearSelection();
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && onZoom) {
      const [touch1, touch2] = Array.from(e.touches);
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      touchStateRef.current = {
        initialDistance: distance,
        lastDistance: distance,
        pinch: true,
      };
      return;
    }
    touchStateRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStateRef.current?.pinch && e.touches.length === 2 && onZoom) {
      const [touch1, touch2] = Array.from(e.touches);
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const state = touchStateRef.current;
      const delta = distance - state.lastDistance;

      if (Math.abs(delta) > 6) {
        const direction = delta > 0 ? 'in' : 'out';
        onZoom(direction);
        touchStateRef.current = {
          ...state,
          lastDistance: distance,
        };
      }
      return;
    }
  };

  const handleTouchEnd = () => {
    touchStateRef.current = null;
  };

  // 選択タスクのドラッグ移動開始
  const handleSelectionDragStart = (e: React.MouseEvent) => {
    if (selectedTaskIds.size === 0) return;

    setIsDraggingSelection(true);
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    setHoveredStageId(null);
    hoveredStageIdRef.current = null;
    e.stopPropagation();
  };

  // 最新のtaskPositionsとstagesListをrefで保持（イベントハンドラー内で常に最新値を参照するため）
  const taskPositionsRef = useRef<Map<string, { left: number; width: number; top: number; height: number }>>(new Map());
  const stagesListRef = useRef<GanttTask[]>([]);

  // 工程リストを取得（ドロップ先として使用）
  const stagesList = useMemo(() => {
    const list = tasks.filter(t => t.type === 'stage');
    // refも同時に更新（useEffectを待たずに即座に反映）
    stagesListRef.current = list;
    return list;
  }, [tasks]);

  // マウス位置から工程を検出（refを使用して常に最新の位置情報を参照）
  useEffect(() => {
    scrollTopRef.current = scrollTop;
  }, [scrollTop]);

  const findStageAtPosition = useCallback((clientX: number, clientY: number): string | null => {
    if (typeof document !== 'undefined' && document.elementsFromPoint) {
      const elements = document.elementsFromPoint(clientX, clientY);
      for (const el of elements) {
        if (!(el instanceof HTMLElement)) continue;
        const barEl = el.closest('.gantt-task-bar') as HTMLElement | null;
        if (!barEl) continue;
        const taskId = barEl.dataset.taskId;
        if (!taskId) continue;
        const stageMatch = stagesListRef.current.find(stage => stage.id === taskId);
        if (stageMatch) return stageMatch.id;
      }
    }

    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const y = clientY - rect.top + scrollTopRef.current;

    const positions = taskPositionsRef.current;
    const stages = stagesListRef.current;

    for (const stage of stages) {
      const position = positions.get(stage.id);
      if (position && y >= position.top && y <= position.top + position.height) {
        return stage.id;
      }
    }
    return null;
  }, []);

  const handleSingleTaskDragStart = useCallback(() => {
    setIsDraggingTask(true);
    setHoveredStageId(null);
    hoveredStageIdRef.current = null;
  }, []);

  const handleSingleTaskDragMove = useCallback((clientX: number, clientY: number) => {
    if (!onBatchAssignToStage) return;
    const stageId = findStageAtPosition(clientX, clientY);
    if (stageId !== hoveredStageIdRef.current) {
      hoveredStageIdRef.current = stageId;
      setHoveredStageId(stageId);
    }
  }, [findStageAtPosition, onBatchAssignToStage]);

  const handleSingleTaskDrop = useCallback((task: GanttTask, clientX: number, clientY: number) => {
    setIsDraggingTask(false);
    const stageIdAtDrop = onBatchAssignToStage ? findStageAtPosition(clientX, clientY) : null;
    let assigned = false;

    if (stageIdAtDrop && onBatchAssignToStage && task.type !== 'stage') {
      onBatchAssignToStage([task.id], stageIdAtDrop);
      assigned = true;
    }

    setHoveredStageId(null);
    hoveredStageIdRef.current = null;
    return assigned;
  }, [findStageAtPosition, onBatchAssignToStage]);

  // グローバルイベントリスナー（選択タスクのドラッグ移動）
  useEffect(() => {
    if (!isDraggingSelection) return;

    const handleMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX.current;
      setDragPreviewOffset(deltaX);

      // 工程の上にホバーしているかチェック
      if (onBatchAssignToStage) {
        const stageId = findStageAtPosition(e.clientX, e.clientY);
        if (stageId !== hoveredStageIdRef.current) {
          hoveredStageIdRef.current = stageId;
          setHoveredStageId(stageId);
        }
      }
    };

    const handleUp = (e: MouseEvent) => {
      const stageIdAtDrop = onBatchAssignToStage ? findStageAtPosition(e.clientX, e.clientY) : null;

      // 工程の上でドロップした場合
      if (stageIdAtDrop && onBatchAssignToStage) {
        // 選択中のタスクから工程を除外（工程を工程に所属させない）
        const taskIdsToAssign = Array.from(selectedTaskIds).filter(id => {
          const task = tasks.find(t => t.id === id);
          return task && task.type !== 'stage';
        });
        if (taskIdsToAssign.length > 0) {
          onBatchAssignToStage(taskIdsToAssign, stageIdAtDrop);
        }
        setIsDraggingSelection(false);
        setDragPreviewOffset(0);
        setHoveredStageId(null);
        hoveredStageIdRef.current = null;
        return;
      }

      // 通常の日付移動
      if (!onBatchMove) {
        setIsDraggingSelection(false);
        setDragPreviewOffset(0);
        setHoveredStageId(null);
        return;
      }

      const deltaX = e.clientX - dragStartX.current;
      const totalDays = Math.floor((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
      const deltaDays = Math.round((deltaX / containerWidth) * totalDays);

      if (deltaDays !== 0) {
        onBatchMove(deltaDays);
      }

      setIsDraggingSelection(false);
      setDragPreviewOffset(0);
      setHoveredStageId(null);
      hoveredStageIdRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDraggingSelection, dateRange, containerWidth, onBatchMove, onBatchAssignToStage, selectedTaskIds, tasks, findStageAtPosition]);

  // 今日の位置を計算
  const todayPosition = calculateTodayPosition(dateRange, containerWidth);
  const columnWidth = ticks.length > 0 ? containerWidth / ticks.length : containerWidth;

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

      // プロジェクトが展開されている場合のみタスクを追加
      if (expandedProjectIds.has(task.projectId)) {
        groups[groups.length - 1].tasks.push(task);
        groups[groups.length - 1].rowCount++;
        rowIndex++;
      }
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
  }, [tasks, projectMap, projectMilestones, expandedStageIds, expandedProjectIds]);

  // タスクの総高さを計算（プロジェクトヘッダー分も含む + 最後に空白のプロジェクト行）
  // 工程とタスクで異なる行の高さを使用
  const projectHeaderHeight = 32;
  const totalHeight = useMemo(() => {
    let height = projectGroups.length * projectHeaderHeight + projectHeaderHeight; // ヘッダー分
    tasks.forEach(task => {
      // プロジェクトが折りたたまれている場合、タスクはスキップ
      if (!expandedProjectIds.has(task.projectId)) {
        return;
      }
      // 親工程が折りたたまれている場合、子タスクはスキップ
      if (task.parentId && !expandedStageIds.has(task.parentId)) {
        return;
      }
      const isStage = task.type === 'stage';
      height += isStage ? stageRowHeight : taskRowHeight;
    });
    return height;
  }, [tasks, projectGroups.length, projectHeaderHeight, stageRowHeight, taskRowHeight, expandedStageIds, expandedProjectIds]);

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

    // refも同時に更新（useEffectを待たずに即座に反映）
    taskPositionsRef.current = positions;
    return positions;
  }, [tasks, dateRange, containerWidth, stageRowHeight, taskRowHeight, projectGroups, projectHeaderHeight]);

  // グローバルイベントリスナー（範囲選択）
  useEffect(() => {
    if (!isSelecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setSelectionEnd({ x, y });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (containerRef.current && selectionStart) {
        const rect = containerRef.current.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        const end = { x: endX, y: endY };

        // 選択範囲内のタスクを特定
        if (onTaskSelection) {
          const minX = Math.min(selectionStart.x, end.x);
          const maxX = Math.max(selectionStart.x, end.x);
          const minY = Math.min(selectionStart.y, end.y);
          const maxY = Math.max(selectionStart.y, end.y);

          // 選択範囲が小さすぎる場合は無視（クリックと区別）
          if (maxX - minX >= 5 || maxY - minY >= 5) {
            let selectedCount = 0;
            tasks.forEach((task) => {
              const position = taskPositions.get(task.id);
              if (!position) return;

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
                selectedCount++;
                onTaskSelection(task.id, true);
              }
            });
          }
        }
      }

      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSelecting, selectionStart, scrollLeft, scrollTop, tasks, taskPositions, onTaskSelection]);

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
      <div
        ref={containerRef}
        className="relative bg-white select-none"
        style={{ height: `${totalHeight}px` }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
          {/* グリッド背景 */}
          <div className="absolute inset-0">
            {/* 縦線（日付の区切り） */}
            {ticks.map((tick, index) => {
              const x = index * columnWidth;
              return (
                <React.Fragment key={index}>
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
                    else if (milestone.type === 'layout') milestoneColor = 'bg-cyan-500';
                    else if (milestone.type === 'basic_design') milestoneColor = 'bg-indigo-500';
                    else if (milestone.type === 'design_survey') milestoneColor = 'bg-teal-500';
                    else if (milestone.type === 'estimate') milestoneColor = 'bg-amber-500';
                    else if (milestone.type === 'interim_inspection') milestoneColor = 'bg-rose-500';

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
                    width: `${columnWidth}px`,
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
          {tasks.map((task) => {
            const position = taskPositions.get(task.id);
            if (!position) return null;

            const isSelected = selectedTaskIds.has(task.id);

            // マイルストーンの場合は専用コンポーネントで表示
            if (task.milestone) {
            return (
              <div key={task.id} className="gantt-task-bar" data-task-id={task.id}>
                <GanttMilestone
                  task={task}
                  position={position}
                  dateRange={dateRange}
                  containerWidth={containerWidth}
                    onClick={onTaskClick}
                    onSelect={onTaskSelection}
                    onSelectionDragStart={handleSelectionDragStart}
                    onStageDragStart={onBatchAssignToStage && task.type !== 'stage' ? handleSingleTaskDragStart : undefined}
                    onStageHover={onBatchAssignToStage && task.type !== 'stage' ? handleSingleTaskDragMove : undefined}
                    onStageDrop={onBatchAssignToStage && task.type !== 'stage' ? (clientX, clientY) => handleSingleTaskDrop(task, clientX, clientY) : undefined}
                    onUpdate={handleTaskUpdateWithBatch}
                    interactive={interactive}
                    isSelected={isSelected}
                    selectedCount={selectedTaskIds.size}
                  />
                  {/* 選択されたマイルストーンのハイライト */}
                  {isSelected && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: `${position.left + position.width / 2 - 14}px`,
                        top: `${position.top + (position.height - 28) / 2}px`,
                        width: '28px',
                        height: '28px',
                        border: '2px solid #3b82f6',
                        borderRadius: '4px',
                        transform: 'rotate(45deg)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        zIndex: 30,
                      }}
                    />
                  )}
                </div>
              );
            }

            // 通常のタスクバー
            const willPassStageDragStart = onBatchAssignToStage && task.type !== 'stage';
            return (
              <div
                key={task.id}
                className="gantt-task-bar"
                data-task-id={task.id}
              >
                <GanttTaskBar
                  task={task}
                  position={position}
                  dateRange={dateRange}
                  containerWidth={containerWidth}
                  onClick={onTaskClick}
                  onSelect={onTaskSelection}
                  onUpdate={handleTaskUpdateWithBatch}
                  onCopy={onTaskCopy}
                  onSelectionDragStart={handleSelectionDragStart}
                  onStageDragStart={willPassStageDragStart ? handleSingleTaskDragStart : undefined}
                  onStageHover={willPassStageDragStart ? handleSingleTaskDragMove : undefined}
                  onStageDrop={willPassStageDragStart ? (clientX, clientY) => handleSingleTaskDrop(task, clientX, clientY) : undefined}
                  interactive={interactive}
                  isSelected={isSelected}
                  selectedCount={selectedTaskIds.size}
                />
                {/* 選択されたタスクのハイライト */}
                {isSelected && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: `${position.left + (isDraggingSelection ? dragPreviewOffset : 0)}px`,
                      top: `${position.top}px`,
                      width: `${position.width}px`,
                      height: `${position.height}px`,
                      border: '2px solid #3b82f6',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      zIndex: 30,
                      transition: isDraggingSelection ? 'none' : 'left 0.1s ease-out',
                    }}
                  />
                )}
                {/* ドラッグ中のプレビュー */}
                {isSelected && isDraggingSelection && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: `${position.left + dragPreviewOffset}px`,
                      top: `${position.top}px`,
                      width: `${position.width}px`,
                      height: `${position.height}px`,
                      backgroundColor: 'rgba(59, 130, 246, 0.3)',
                      borderRadius: '8px',
                      zIndex: 25,
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* ドラッグ中の工程ハイライト */}
          {(isDraggingSelection || isDraggingTask) && hoveredStageId && (() => {
            const stagePosition = taskPositions.get(hoveredStageId);
            if (!stagePosition) return null;
            const stage = stagesList.find(s => s.id === hoveredStageId);
            const stageBarHeight = 38;
            const stageBarTop = stagePosition.top + (stagePosition.height - stageBarHeight) / 2;
            return (
              <>
                {/* 工程行のハイライト */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${stagePosition.left}px`,
                    top: `${stageBarTop}px`,
                    width: `${stagePosition.width}px`,
                    height: `${stageBarHeight}px`,
                    backgroundColor: 'rgba(34, 197, 94, 0.12)',
                    border: '2px solid rgba(34, 197, 94, 0.6)',
                    borderRadius: '10px',
                    zIndex: 28,
                    boxShadow: '0 0 10px rgba(34, 197, 94, 0.3)',
                  }}
                />
                {/* ラベル（工程バーの近く） */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${stagePosition.left + stagePosition.width / 2}px`,
                    top: `${stageBarTop - 36}px`,
                    transform: 'translateX(-50%)',
                    zIndex: 35,
                  }}
                >
                  <div className="bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow-xl whitespace-nowrap">
                    「{stage?.name || '工程'}」に追加
                  </div>
                </div>
              </>
            );
          })()}

          {/* 範囲選択ボックス */}
          {selectionBox && (
            <div
              className="absolute pointer-events-none z-30"
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
            <div
              className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {isDraggingSelection ? (
                <span className="font-medium">
                  {(() => {
                    const totalDays = Math.floor((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
                    const deltaDays = Math.round((dragPreviewOffset / containerWidth) * totalDays);
                    if (deltaDays === 0) return '移動中...';
                    return deltaDays > 0 ? `+${deltaDays}日` : `${deltaDays}日`;
                  })()}
                </span>
              ) : (
                <>
                  <span className="font-medium">{selectedTaskIds.size}個のアイテムを選択中</span>
                  {onBatchEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onBatchEdit();
                      }}
                      className="px-3 py-1 bg-white text-blue-600 font-medium rounded hover:bg-blue-50 transition"
                    >
                      一括編集
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearSelection?.();
                    }}
                    className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded transition"
                  >
                    選択解除
                  </button>
                </>
              )}
            </div>
          )}
        </div>
    </div>
  );
};
