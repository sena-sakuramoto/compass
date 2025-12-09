// 工程ベースのガントチャートコンポーネント
// タスクベースではなく、工程（Stage）を行として表示
// Stage と Task の視覚的区別、選択・ハイライト機能を実装

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { GanttToolbar } from './GanttToolbar';
import { StageListPanel } from './StageListPanel';
import { StageTimelinePanel } from './StageTimelinePanel';
import type { GanttStage, GanttTask, ViewMode } from './types';
import { calculateDateRange, calculateDateTicks } from './utils';

interface Person {
  id: string;
  氏名: string;
  メール?: string;
  [key: string]: any;
}

interface StageGanttChartProps {
  stages: GanttStage[];
  interactive?: boolean;
  onStageClick?: (stage: GanttStage) => void;
  onTaskClick?: (task: GanttTask, stage: GanttStage) => void;
  onTaskToggleComplete?: (stageId: string, taskId: string) => void;
  onProjectClick?: (projectId: string) => void;
  initialViewMode?: ViewMode;
  projectMap?: Record<string, { ステータス?: string;[key: string]: any }>;
  people?: Person[];
  // 外部から選択状態を制御する場合
  selectedStageId?: string | null;
  selectedTaskId?: string | null;
  onSelectionChange?: (selection: { stageId: string | null; taskId: string | null }) => void;
}

export const StageGanttChart: React.FC<StageGanttChartProps> = ({
  stages,
  interactive = false,
  onStageClick,
  onTaskClick,
  onTaskToggleComplete,
  onProjectClick,
  initialViewMode = 'day',
  projectMap,
  people = [],
  selectedStageId: externalSelectedStageId,
  selectedTaskId: externalSelectedTaskId,
  onSelectionChange,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [pxPerDay, setPxPerDay] = useState(30); // ズームレベル（1日あたりのpx）

  // 工程の展開状態（デフォルトはすべて閉じている）
  const [expandedStageIds, setExpandedStageIds] = useState<Set<string>>(new Set());

  // 内部選択状態（外部制御がない場合に使用）
  const [internalSelectedStageId, setInternalSelectedStageId] = useState<string | null>(null);
  const [internalSelectedTaskId, setInternalSelectedTaskId] = useState<string | null>(null);

  // 選択状態の決定（外部制御がある場合はそちらを優先）
  const selectedStageId = externalSelectedStageId !== undefined ? externalSelectedStageId : internalSelectedStageId;
  const selectedTaskId = externalSelectedTaskId !== undefined ? externalSelectedTaskId : internalSelectedTaskId;

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // タスク一覧の幅（レスポンシブ）
  const [listWidth, setListWidth] = useState(() => {
    if (typeof window === 'undefined') return 350;
    return window.innerWidth < 768 ? 200 : 380;
  });

  // ウィンドウサイズ変更時にタスク一覧の幅を調整
  useEffect(() => {
    const handleResize = () => {
      setListWidth(window.innerWidth < 768 ? 200 : 380);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 行の高さ
  const stageRowHeight = 48; // 工程行の高さ（2行分のスペース）
  const taskRowHeight = 32;  // タスク行の高さ

  // 日付範囲を計算
  const allTasks = useMemo(() => {
    return stages.flatMap(stage => stage.tasks);
  }, [stages]);

  const [dateRange, setDateRange] = useState(() => calculateDateRange(allTasks));

  // タスクが変更されたときに日付範囲を更新（拡張のみ、縮小しない）
  useEffect(() => {
    const newRange = calculateDateRange(allTasks, dateRange);
    if (newRange.start.getTime() !== dateRange.start.getTime() ||
      newRange.end.getTime() !== dateRange.end.getTime()) {
      setDateRange(newRange);
    }
  }, [allTasks]);

  // 日付軸のティックを計算
  const ticks = useMemo(
    () => calculateDateTicks(dateRange.start, dateRange.end, viewMode),
    [dateRange, viewMode]
  );

  // コンテナ幅の計算（pxPerDay を適用）
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth - listWidth - 2;

        // pxPerDay に基づいて幅を計算
        const totalDays = ticks.length;
        const baseWidth = Math.max(availableWidth, totalDays * pxPerDay);

        // 日表示の場合は、幅が日数の整数倍になるように調整
        let finalWidth = baseWidth;
        if (viewMode === 'day' && ticks.length > 0) {
          const tickWidth = Math.round(baseWidth / ticks.length);
          finalWidth = tickWidth * ticks.length;
        }

        setContainerWidth(finalWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [listWidth, viewMode, ticks.length, pxPerDay]);

  // ズーム機能
  const handleZoomIn = () => {
    setPxPerDay(prev => Math.min(prev * 1.2, 60)); // 最大60px/day
  };

  const handleZoomOut = () => {
    setPxPerDay(prev => Math.max(prev / 1.2, 5)); // 最小5px/day
  };

  // 今日へジャンプ
  const scrollToToday = useCallback(() => {
    if (!timelineRef.current) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalDays = Math.floor((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const daysFromStart = Math.floor((today.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));

    if (daysFromStart < 0 || daysFromStart > totalDays) {
      return;
    }

    const todayX = (daysFromStart / totalDays) * containerWidth;
    const scrollX = Math.max(0, todayX - timelineRef.current.clientWidth / 3);

    timelineRef.current.scrollLeft = scrollX;
  }, [dateRange, containerWidth]);

  // 工程の展開/折りたたみトグル
  const toggleStageExpanded = useCallback((stageId: string) => {
    setExpandedStageIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stageId)) {
        newSet.delete(stageId);
      } else {
        newSet.add(stageId);
      }
      return newSet;
    });
  }, []);

  // 工程選択ハンドラ
  const handleStageSelect = useCallback((stageId: string) => {
    if (onSelectionChange) {
      onSelectionChange({ stageId, taskId: null });
    } else {
      setInternalSelectedStageId(stageId);
      setInternalSelectedTaskId(null);
    }

    // 工程を展開
    setExpandedStageIds(prev => {
      const newSet = new Set(prev);
      newSet.add(stageId);
      return newSet;
    });

    // コールバック
    const stage = stages.find(s => s.id === stageId);
    if (stage && onStageClick) {
      onStageClick(stage);
    }
  }, [stages, onStageClick, onSelectionChange]);

  // タスク選択ハンドラ
  const handleTaskSelect = useCallback((taskId: string, stageId: string) => {
    if (onSelectionChange) {
      onSelectionChange({ stageId, taskId });
    } else {
      setInternalSelectedStageId(stageId);
      setInternalSelectedTaskId(taskId);
    }

    // コールバック
    const stage = stages.find(s => s.id === stageId);
    const task = stage?.tasks.find(t => t.id === taskId);
    if (stage && task && onTaskClick) {
      onTaskClick(task, stage);
    }
  }, [stages, onTaskClick, onSelectionChange]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!timelineRef.current) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + + : ズームイン
      if (isCtrlOrCmd && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        handleZoomIn();
      }
      // Ctrl/Cmd + - : ズームアウト
      else if (isCtrlOrCmd && e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      }
      // Ctrl/Cmd + 0 : リセット
      else if (isCtrlOrCmd && e.key === '0') {
        e.preventDefault();
        setPxPerDay(30);
        scrollToToday();
      }
      // T : 今日へジャンプ
      else if (e.key === 't' || e.key === 'T') {
        if (!isCtrlOrCmd) {
          e.preventDefault();
          scrollToToday();
        }
      }
      // ← : 左スクロール
      else if (e.key === 'ArrowLeft' && !isCtrlOrCmd && !e.shiftKey) {
        e.preventDefault();
        if (timelineRef.current) {
          timelineRef.current.scrollLeft -= timelineRef.current.clientWidth / 2;
        }
      }
      // → : 右スクロール
      else if (e.key === 'ArrowRight' && !isCtrlOrCmd && !e.shiftKey) {
        e.preventDefault();
        if (timelineRef.current) {
          timelineRef.current.scrollLeft += timelineRef.current.clientWidth / 2;
        }
      }
      // Escape : 選択解除
      else if (e.key === 'Escape') {
        e.preventDefault();
        if (onSelectionChange) {
          onSelectionChange({ stageId: null, taskId: null });
        } else {
          setInternalSelectedStageId(null);
          setInternalSelectedTaskId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pxPerDay, scrollToToday, onSelectionChange]);

  // 空の状態
  if (stages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
        <div className="text-center">
          <div className="text-lg mb-2">📋</div>
          <div>表示できる工程がありません</div>
          <div className="text-xs text-slate-400 mt-1">プロジェクト編集画面から工程を追加してください</div>
        </div>
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

      {/* 今日へジャンプボタン */}
      <div className="absolute top-16 right-4 z-40">
        <button
          onClick={scrollToToday}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded hover:bg-blue-600 transition shadow-sm"
          title="今日へジャンプ (T)"
        >
          今日へ
        </button>
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 flex overflow-hidden" style={{ direction: 'rtl' }}>
        {/* 工程リスト（左側固定） */}
        <div
          ref={listRef}
          className="flex-shrink-0 overflow-y-auto overflow-x-hidden"
          style={{ width: `${listWidth}px`, direction: 'ltr', order: 2 }}
          onScroll={(e) => {
            const top = e.currentTarget.scrollTop;
            setScrollTop(top);
            if (timelineRef.current) {
              timelineRef.current.scrollTop = top;
            }
          }}
        >
          <StageListPanel
            stages={stages}
            expandedStageIds={expandedStageIds}
            onToggleStage={toggleStageExpanded}
            onTaskToggleComplete={onTaskToggleComplete}
            onProjectClick={onProjectClick}
            onStageSelect={handleStageSelect}
            onTaskSelect={handleTaskSelect}
            selectedStageId={selectedStageId}
            selectedTaskId={selectedTaskId}
            projectMap={projectMap}
            stageRowHeight={stageRowHeight}
            taskRowHeight={taskRowHeight}
            projectHeaderHeight={28}
          />
        </div>

        {/* タイムライン（右側、横スクロール） */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-y-auto overflow-x-auto"
          style={{
            direction: 'ltr',
            order: 1,
            scrollbarWidth: 'thin',
          }}
          onScroll={(e) => {
            const left = e.currentTarget.scrollLeft;
            const top = e.currentTarget.scrollTop;
            setScrollLeft(left);
            setScrollTop(top);

            if (listRef.current) {
              listRef.current.scrollTop = top;
            }
          }}
        >
          <StageTimelinePanel
            stages={stages}
            expandedStageIds={expandedStageIds}
            ticks={ticks}
            dateRange={dateRange}
            containerWidth={containerWidth}
            stageRowHeight={stageRowHeight}
            taskRowHeight={taskRowHeight}
            projectHeaderHeight={28}
            viewMode={viewMode}
            projectMap={projectMap}
            selectedStageId={selectedStageId}
            selectedTaskId={selectedTaskId}
            onStageSelect={handleStageSelect}
            onTaskSelect={handleTaskSelect}
          />
        </div>
      </div>
    </div>
  );
};

// エクスポート
export * from './types';
