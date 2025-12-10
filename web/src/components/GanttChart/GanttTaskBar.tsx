// タスクバーコンポーネント

import React, { useState, useRef, useEffect } from 'react';
import { addDays, differenceInDays } from 'date-fns';
import type { GanttTask } from './types';
import { getStatusColor, isOverdue } from './utils';

type DragMode = 'move' | 'resize-start' | 'resize-end' | null;

interface GanttTaskBarProps {
  task: GanttTask;
  position: { left: number; width: number; top: number; height: number };
  dateRange: { start: Date; end: Date };
  containerWidth: number;
  onUpdate?: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  onCopy?: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  onClick?: (task: GanttTask) => void;
  interactive?: boolean;
}

const GanttTaskBarComponent: React.FC<GanttTaskBarProps> = ({
  task,
  position,
  dateRange,
  containerWidth,
  onUpdate,
  onCopy,
  onClick,
  interactive = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [previewPosition, setPreviewPosition] = useState(position);
  const [isCopyMode, setIsCopyMode] = useState(false);
  const dragStartX = useRef<number>(0);
  const hasDragged = useRef<boolean>(false);
  const originalStartDate = useRef<Date>(task.startDate);
  const originalEndDate = useRef<Date>(task.endDate);
  const pendingStartDate = useRef<Date>(task.startDate);
  const pendingEndDate = useRef<Date>(task.endDate);
  const lastUpdateTime = useRef<number>(0);

  // 工程かタスクかを判定
  const isStage = task.type === 'stage';

  // ステータスに応じた色を取得
  const overdue = isOverdue(task);
  // 工程はシンプルなグレー系、タスクは通常の色
  const stageColor = '#64748b'; // slate-500
  const color = isStage ? stageColor : (overdue ? '#dc2626' : getStatusColor(task.status));

  // バーの高さ（工程は大きく、タスクは少し小さく）
  const barHeight = isStage ? 38 : 28;
  // バーを行の中央に配置（position.heightは行の高さ）
  const barTop = position.top + (position.height - barHeight) / 2;

  // タスク名の表示（幅に応じて省略）
  const displayName = task.name.length > 18 ? task.name.substring(0, 16) + '…' : task.name;

  // ピクセルから日数への変換
  const pixelsToDays = (pixels: number): number => {
    // 表示列数は ticks.length と一致させるため +1 日の inclusive 幅にする
    const rangeStart = new Date(dateRange.start);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(dateRange.end);
    rangeEnd.setHours(0, 0, 0, 0);
    const totalDaysInclusive = differenceInDays(rangeEnd, rangeStart) + 1;
    return Math.round((pixels / containerWidth) * totalDaysInclusive);
  };

  // ドラッグ開始
  const handleMouseDown = (e: React.MouseEvent, mode: DragMode) => {
    console.log('[GanttTaskBar] handleMouseDown', {
      interactive,
      hasOnUpdate: !!onUpdate,
      hasOnCopy: !!onCopy,
      mode,
      taskName: task.name
    });

    if (!interactive || (!onUpdate && !onCopy)) {
      console.log('[GanttTaskBar] Drag disabled - interactive:', interactive, 'onUpdate:', !!onUpdate, 'onCopy:', !!onCopy);
      return;
    }
    e.stopPropagation();

    // Ctrlキーが押されている場合はコピーモード
    const copyMode = e.ctrlKey && mode === 'move' && !!onCopy;
    setIsCopyMode(copyMode);

    setIsDragging(true);
    setDragMode(mode);
    hasDragged.current = false;
    dragStartX.current = e.clientX;
    originalStartDate.current = task.startDate;
    originalEndDate.current = task.endDate;

    console.log('[GanttTaskBar] Drag started', { mode, taskName: task.name });
  };

  // ドラッグ中 - プレビューのみ更新、保存はしない
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !dragMode) return;

    // requestAnimationFrameで滑らかなドラッグを実現
    // スロットリングは削除して、常に最新の位置を反映

    const deltaX = e.clientX - dragStartX.current;
    const deltaDays = pixelsToDays(deltaX);

    // ドラッグしたことを記録
    if (Math.abs(deltaX) > 3) {
      hasDragged.current = true;
    }

    // Altキーの状態を常に更新（ドラッグ中にキーを押した/離した場合に対応）
    if (dragMode === 'move' && onCopy) {
      setIsCopyMode(e.altKey);
    }

    let newStartDate = originalStartDate.current;
    let newEndDate = originalEndDate.current;

    if (dragMode === 'move') {
      // タスク全体を移動
      newStartDate = addDays(originalStartDate.current, deltaDays);
      newEndDate = addDays(originalEndDate.current, deltaDays);
    } else if (dragMode === 'resize-start') {
      // 開始日を変更
      newStartDate = addDays(originalStartDate.current, deltaDays);
      // 開始日が終了日を超えないようにする
      if (newStartDate >= originalEndDate.current) {
        newStartDate = addDays(originalEndDate.current, -1);
      }
    } else if (dragMode === 'resize-end') {
      // 終了日を変更
      newEndDate = addDays(originalEndDate.current, deltaDays);
      // 終了日が開始日より前にならないようにする
      if (newEndDate <= originalStartDate.current) {
        newEndDate = addDays(originalStartDate.current, 1);
      }
    }

    // 日付範囲内に収める
    if (newStartDate < dateRange.start) {
      const diff = differenceInDays(newEndDate, newStartDate);
      newStartDate = dateRange.start;
      if (dragMode === 'move') {
        newEndDate = addDays(newStartDate, diff);
      }
    }
    if (newEndDate > dateRange.end) {
      const diff = differenceInDays(newEndDate, newStartDate);
      newEndDate = dateRange.end;
      if (dragMode === 'move') {
        newStartDate = addDays(newEndDate, -diff);
      }
    }

    // 一時的な日付を保存（プレビュー用）
    pendingStartDate.current = newStartDate;
    pendingEndDate.current = newEndDate;

    // プレビュー用の位置を計算
    // 表示列数は ticks.length と一致させるため +1 日の inclusive 幅にする
    const rangeStart = new Date(dateRange.start);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(dateRange.end);
    rangeEnd.setHours(0, 0, 0, 0);
    const totalDaysInclusive = differenceInDays(rangeEnd, rangeStart) + 1;
    const dayWidth = containerWidth / totalDaysInclusive;

    const startOffset = differenceInDays(newStartDate, dateRange.start);
    const duration = differenceInDays(newEndDate, newStartDate);

    // 日の境界線を基準にバーを配置（utilsと同じロジック）
    // 開始日の0時（左境界）から終了日の24時（右境界）まで
    const left = startOffset * dayWidth;
    // 右端の1px食い込み防止: -1 で次の列に踏み出さないようにする
    const width = Math.max((duration + 1) * dayWidth - 1, 1);

    setPreviewPosition({ left, width, top: position.top, height: position.height });
  };

  // ドラッグ終了 - この時点で保存
  const handleMouseUp = () => {
    if (isDragging) {
      // 日付が変更されている場合のみ保存
      const hasChanged =
        pendingStartDate.current.getTime() !== originalStartDate.current.getTime() ||
        pendingEndDate.current.getTime() !== originalEndDate.current.getTime();

      console.log('[GanttTaskBar] handleMouseUp', {
        taskName: task.name,
        hasChanged,
        isCopyMode,
        originalStart: originalStartDate.current.toISOString().split('T')[0],
        originalEnd: originalEndDate.current.toISOString().split('T')[0],
        newStart: pendingStartDate.current.toISOString().split('T')[0],
        newEnd: pendingEndDate.current.toISOString().split('T')[0],
      });

      if (hasChanged) {
        if (isCopyMode && onCopy) {
          // コピーモード：新しいタスクを作成
          console.log('[GanttTaskBar] Calling onCopy');
          onCopy(task, pendingStartDate.current, pendingEndDate.current);
        } else if (onUpdate) {
          // 通常モード：既存のタスクを更新
          console.log('[GanttTaskBar] Calling onUpdate');
          onUpdate(task, pendingStartDate.current, pendingEndDate.current);
        }
      }
    }

    setIsDragging(false);
    setDragMode(null);
    setIsCopyMode(false);
    setPreviewPosition(position);
  };

  // positionが変更されたらプレビュー位置も更新
  useEffect(() => {
    if (!isDragging) {
      setPreviewPosition(position);
    }
  }, [position, isDragging]);

  // グローバルイベントリスナーの設定
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragMode, handleMouseMove, handleMouseUp]);

  const handleClick = (e: React.MouseEvent) => {
    // ドラッグした場合はクリックイベントを無視
    if (hasDragged.current) {
      e.stopPropagation();
      return;
    }

    // クリックでタスクの編集画面を開く
    if (onClick) {
      onClick(task);
    }
  };

  // ドラッグ中はプレビュー位置を使用、それ以外は通常の位置を使用
  const displayPosition = isDragging ? previewPosition : position;

  return (
    <div
      className="absolute group"
      style={{
        left: `${displayPosition.left}px`,
        width: `${Math.max(displayPosition.width, 4)}px`,
        top: `${barTop}px`,
        height: `${barHeight}px`,
        zIndex: isDragging ? 10000 : (isHovered ? 9999 : 10)
      }}
      onMouseEnter={() => !isDragging && setIsHovered(true)}
      onMouseLeave={() => !isDragging && setIsHovered(false)}
      onClick={handleClick}
    >
      {/* バーの本体 */}
      <div
        className={`h-full flex items-center text-white text-xs shadow-sm transition-all duration-200 ${interactive ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'
          } ${isHovered || isDragging ? 'shadow-md transform -translate-y-0.5' : ''} ${isCopyMode ? 'ring-2 ring-blue-400' : ''
          } ${isStage
            ? 'rounded-lg font-semibold px-3'
            : 'rounded-lg px-2 font-normal'
          }`}
        style={{
          backgroundColor: color,
          opacity: task.status === 'completed' ? 0.5 : isDragging ? (isCopyMode ? 0.5 : 0.8) : 1
        }}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        {/* 進捗バー */}
        {task.progress > 0 && task.progress < 100 && (
          <div
            className="absolute left-0 top-0 bottom-0 bg-white/30 rounded-l-lg"
            style={{ width: `${task.progress}%` }}
          />
        )}

        {/* タスク名（バー内に表示） */}
        {position.width > 60 && (
          <span className="relative z-10 truncate">{displayName}</span>
        )}
      </div>

      {/* ホバー時のツールチップ（ドラッグ中は非表示） */}
      {isHovered && !isDragging && (
        <div className={`absolute top-full left-0 mt-2 z-[9999] min-w-[220px] rounded-xl border bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-xl backdrop-blur pointer-events-none ${isStage ? 'border-slate-300' : 'border-slate-200'}`}>
          {/* 工程/タスクのラベル */}
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${isStage ? 'bg-slate-100 text-slate-700' : 'bg-slate-100 text-slate-600'}`}>
              {isStage ? '工程' : 'タスク'}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-800">{task.name}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {task.startDate.toLocaleDateString('ja-JP')} → {task.endDate.toLocaleDateString('ja-JP')}
          </div>
          {!isStage && (
            <div className="mt-1 text-[11px] text-slate-500">
              担当: {task.assignee || '未設定'}
            </div>
          )}
          {task.progress > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${isStage ? 'bg-slate-200' : 'bg-slate-100'}`}>
                <div className={`h-1.5 ${isStage ? 'bg-slate-600' : 'bg-slate-800'}`} style={{ width: `${task.progress}%` }} />
              </div>
              <span className="text-[11px] font-medium text-slate-700">{task.progress}%</span>
            </div>
          )}
          {overdue && (
            <div className="mt-2">
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                期限超過
              </span>
            </div>
          )}
        </div>
      )}

      {/* リサイズハンドル（インタラクティブモード時のみ） */}
      {interactive && position.width > 40 && (
        <>
          {/* 左ハンドル */}
          <div
            className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity z-10"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)' }}
            onMouseDown={(e) => handleMouseDown(e, 'resize-start')}
          />
          {/* 右ハンドル */}
          <div
            className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity z-10"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)' }}
            onMouseDown={(e) => handleMouseDown(e, 'resize-end')}
          />
        </>
      )}
    </div>
  );
};

// React.memoでラップしてパフォーマンスを最適化
export const GanttTaskBar = React.memo(GanttTaskBarComponent, (prevProps, nextProps) => {
  // 以下のpropsが全て同じ場合は再レンダリングをスキップ (return true)
  // いずれかが変更された場合は再レンダリング (return false)
  return (
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.status === nextProps.task.status &&
    prevProps.task.progress === nextProps.task.progress &&
    prevProps.task.startDate.getTime() === nextProps.task.startDate.getTime() &&
    prevProps.task.endDate.getTime() === nextProps.task.endDate.getTime() &&
    prevProps.position.left === nextProps.position.left &&
    prevProps.position.width === nextProps.position.width &&
    prevProps.position.top === nextProps.position.top &&
    prevProps.interactive === nextProps.interactive
  );
});
