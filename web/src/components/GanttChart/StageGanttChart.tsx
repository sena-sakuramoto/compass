// 工程ベースのガントチャートコンポーネント
// タスクベースではなく、工程（Stage）を行として表示

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GanttToolbar } from './GanttToolbar';
import { StageListPanel } from './StageListPanel';
import { StageTimelinePanel } from './StageTimelinePanel';
import type { GanttStage, ViewMode } from './types';
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
  onTaskToggleComplete?: (stageId: string, taskId: string) => void;
  onProjectClick?: (projectId: string) => void;
  initialViewMode?: ViewMode;
  projectMap?: Record<string, { ステータス?: string;[key: string]: any }>;
  people?: Person[];
}

export const StageGanttChart: React.FC<StageGanttChartProps> = ({
  stages,
  interactive = false,
  onStageClick,
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
  const [pxPerDay, setPxPerDay] = useState(30); // ズームレベル（1日あたりのpx）

  // 工程の展開状態（デフォルトはすべて閉じている）
  const [expandedStageIds, setExpandedStageIds] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // タスク一覧の幅（レスポンシブ）
  const [listWidth, setListWidth] = useState(() => {
    if (typeof window === 'undefined') return 350;
    return window.innerWidth < 768 ? 180 : 350;
  });

  // ウィンドウサイズ変更時にタスク一覧の幅を調整
  useEffect(() => {
    const handleResize = () => {
      setListWidth(window.innerWidth < 768 ? 180 : 350);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // マウント確認用（一時的なログ）
  useEffect(() => {
    console.log('[StageGanttChart] mounted with', stages.length, 'stages');
  }, []);

  // 行の高さ
  const stageRowHeight = 48; // 工程行の高さ
  const taskRowHeight = 40;  // タスク行の高さ（展開時）

  // 日付範囲を計算（安定した範囲を維持）
  // stages から全タスクを抽出して日付範囲を計算
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
    setPxPerDay(prev => Math.min(prev * 1.2, 40)); // 最大40px/day
  };

  const handleZoomOut = () => {
    setPxPerDay(prev => Math.max(prev / 1.2, 1)); // 最小1px/day
  };

  // 今日へジャンプ
  const scrollToToday = () => {
    if (!timelineRef.current) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalDays = Math.floor((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const daysFromStart = Math.floor((today.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));

    if (daysFromStart < 0 || daysFromStart > totalDays) {
      // 今日が範囲外の場合は何もしない
      return;
    }

    const todayX = (daysFromStart / totalDays) * containerWidth;
    const scrollX = Math.max(0, todayX - timelineRef.current.clientWidth / 3);

    timelineRef.current.scrollLeft = scrollX;
  };

  // 工程の展開/折りたたみトグル
  const toggleStageExpanded = (stageId: string) => {
    setExpandedStageIds(prev => {
      const newSet = new Set(prev);
      const wasExpanded = newSet.has(stageId);
      if (wasExpanded) {
        newSet.delete(stageId);
        console.log(`[StageGanttChart] Collapsed stage: ${stageId}`);
      } else {
        newSet.add(stageId);
        const stage = stages.find(s => s.id === stageId);
        console.log(`[StageGanttChart] Expanded stage: ${stageId}, tasks: ${stage?.tasks.length || 0}`);
      }
      return newSet;
    });
  };

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // タイムラインがフォーカスされている場合のみ
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
        setPxPerDay(30); // 初期値に戻す
        scrollToToday();
      }
      // T : 今日へジャンプ
      else if (e.key === 't' || e.key === 'T') {
        if (!isCtrlOrCmd) {
          e.preventDefault();
          scrollToToday();
        }
      }
      // ← : 左スクロール（半画面）
      else if (e.key === 'ArrowLeft' && !isCtrlOrCmd && !e.shiftKey) {
        e.preventDefault();
        if (timelineRef.current) {
          timelineRef.current.scrollLeft -= timelineRef.current.clientWidth / 2;
        }
      }
      // → : 右スクロール（半画面）
      else if (e.key === 'ArrowRight' && !isCtrlOrCmd && !e.shiftKey) {
        e.preventDefault();
        if (timelineRef.current) {
          timelineRef.current.scrollLeft += timelineRef.current.clientWidth / 2;
        }
      }
      // Shift + ← : 左スクロール（1画面）
      else if (e.key === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault();
        if (timelineRef.current) {
          timelineRef.current.scrollLeft -= timelineRef.current.clientWidth;
        }
      }
      // Shift + → : 右スクロール（1画面）
      else if (e.key === 'ArrowRight' && e.shiftKey) {
        e.preventDefault();
        if (timelineRef.current) {
          timelineRef.current.scrollLeft += timelineRef.current.clientWidth;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pxPerDay, dateRange, containerWidth]);

  if (stages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
        表示できる工程がありません
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
            projectMap={projectMap}
            stageRowHeight={stageRowHeight}
            taskRowHeight={taskRowHeight}
          />
        </div>

        {/* タイムライン（右側、横スクロール） */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-y-auto overflow-x-auto"
          style={{
            direction: 'ltr',
            order: 1,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
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
            ticks={ticks}
            dateRange={dateRange}
            containerWidth={containerWidth}
            stageRowHeight={stageRowHeight}
            viewMode={viewMode}
            projectMap={projectMap}
          />
        </div>
      </div>
    </div>
  );
};

// エクスポート
export * from './types';
