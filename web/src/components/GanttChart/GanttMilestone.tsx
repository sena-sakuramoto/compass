// マイルストーンコンポーネント

import React, { useState, useRef, useEffect } from 'react';
import type { GanttTask } from './types';
import { getStatusColor, isOverdue, isDueSoon } from './utils';

interface GanttMilestoneProps {
  task: GanttTask;
  position: { left: number; width: number; top: number; height: number };
  dateRange: { start: Date; end: Date };
  containerWidth: number;
  onClick?: (task: GanttTask) => void;
  onSelect?: (taskId: string, isCtrlPressed: boolean) => void;
  onSelectionDragStart?: (e: React.MouseEvent) => void;
  onStageDragStart?: () => void;
  onStageHover?: (clientX: number, clientY: number) => void;
  onStageDrop?: (clientX: number, clientY: number) => boolean;
  onUpdate?: (task: GanttTask, newStartDate: Date, newEndDate: Date) => void;
  interactive?: boolean;
  isSelected?: boolean;
  selectedCount?: number;
}

const GanttMilestoneComponent: React.FC<GanttMilestoneProps> = ({
  task,
  position,
  dateRange,
  containerWidth,
  onClick,
  onSelect,
  onSelectionDragStart,
  onStageDragStart,
  onStageHover,
  onStageDrop,
  onUpdate,
  interactive = false,
  isSelected = false,
  selectedCount = 0
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const dragStartLeft = useRef(0);
  const hasDragged = useRef(false);

  // ステータスに応じた色を取得
  // 優先順位: 期限超過（赤）> 期限3日以内（黄）> 通常（オレンジ）
  const overdue = isOverdue(task);
  const dueSoon = isDueSoon(task);
  const getMilestoneColor = () => {
    if (overdue) return '#dc2626'; // 赤
    if (dueSoon) return '#eab308'; // 黄色
    return '#f97316'; // オレンジ
  };
  const color = getMilestoneColor();
  const dimOpacity = task.isDimmed && !isDragging ? 0.45 : 1;

  // マイルストーンの高さとトップ位置（行の中央に配置）
  const milestoneSize = 20; // ダイヤモンドのサイズ
  const milestoneTop = position.top + (position.height - milestoneSize) / 2;

  const handleClick = (e: React.MouseEvent) => {
    // ドラッグした場合はクリックイベントを無視
    if (hasDragged.current) {
      e.stopPropagation();
      hasDragged.current = false;
      return;
    }

    // Ctrl+クリックで選択に追加
    if (e.ctrlKey && onSelect) {
      e.stopPropagation();
      onSelect(task.id, true);
      return;
    }

    if (onClick && !isDragging) {
      onClick(task);
    }
  };

  // ドラッグ開始
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSelected && selectedCount >= 1 && onSelectionDragStart) {
      hasDragged.current = true;
      onSelectionDragStart(e);
      return;
    }

    if (!interactive || !onUpdate) return;

    e.preventDefault();
    e.stopPropagation();

    setIsDragging(true);
    hasDragged.current = false;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    dragStartLeft.current = position.left;
    if (onStageDragStart) {
      onStageDragStart();
    }
  };

  // ドラッグ処理
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX.current;
      const deltaY = e.clientY - dragStartY.current;
      // 5px以上動いたらドラッグとみなす
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasDragged.current = true;
      }
      setDragOffset(deltaX);
      if (onStageHover) {
        onStageHover(e.clientX, e.clientY);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!onUpdate) {
        setIsDragging(false);
        setDragOffset(0);
        return;
      }

      const assignedToStage = onStageDrop ? onStageDrop(e.clientX, e.clientY) : false;
      const deltaX = e.clientX - dragStartX.current;
      const totalDays = Math.floor((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
      const deltaDays = Math.round((deltaX / containerWidth) * totalDays);

      if (!assignedToStage && deltaDays !== 0) {
        const newDate = new Date(task.startDate);
        newDate.setDate(newDate.getDate() + deltaDays);
        onUpdate(task, newDate, newDate);
      }

      setIsDragging(false);
      setDragOffset(0);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dateRange, containerWidth, onUpdate, task]);

  // マイルストーンは列の中央に配置（ドラッグオフセットを適用）
  const centerLeft = position.left + position.width / 2 - milestoneSize / 2 + dragOffset;

  return (
    <div
      className={`absolute group ${interactive && onUpdate ? 'cursor-grab' : ''} ${isDragging ? 'cursor-grabbing' : ''}`}
      style={{
        left: `${centerLeft}px`,
        width: `${milestoneSize}px`,
        top: `${milestoneTop}px`,
        height: `${milestoneSize}px`,
        zIndex: isDragging ? 9999 : isHovered ? 9999 : 10,
        transition: isDragging ? 'none' : 'left 0.1s ease-out',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* ひし形のマイルストーン */}
      <div
        className="w-full h-full cursor-pointer transition-all duration-200"
        style={{
          transform: isHovered ? 'rotate(45deg) scale(1.2)' : 'rotate(45deg) scale(1)',
          backgroundColor: color,
          boxShadow: isHovered
            ? `0 4px 12px ${dueSoon && !overdue ? 'rgba(234, 179, 8, 0.4)' : 'rgba(249, 115, 22, 0.4)'}`
            : `0 2px 4px ${dueSoon && !overdue ? 'rgba(234, 179, 8, 0.3)' : 'rgba(249, 115, 22, 0.3)'}`,
          border: '2px solid white',
          opacity: dimOpacity
        }}
      />

      {/* マイルストーン名（右側に表示） */}
      {position.left > 100 && (
        <div
          className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-medium text-slate-700 pointer-events-none"
          style={{ zIndex: 5, opacity: dimOpacity }}
        >
          {task.name}
        </div>
      )}

      {/* ホバー時のツールチップ */}
      {isHovered && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[9999] min-w-[220px] rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-xl backdrop-blur pointer-events-none">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3"
              style={{
                transform: 'rotate(45deg)',
                backgroundColor: color,
                border: '1px solid white'
              }}
            />
            <div className={`text-sm font-semibold ${dueSoon && !overdue ? 'text-yellow-700' : 'text-orange-800'}`}>◆ マイルストーン</div>
          </div>
          <div className="mt-2 text-sm font-medium text-slate-800">{task.name}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            期日: {task.endDate.toLocaleDateString('ja-JP')}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            担当: {task.assignee || '未設定'}
          </div>
          {task.projectName && (
            <div className="mt-1 text-[11px] text-slate-500">
              プロジェクト: {task.projectName}
            </div>
          )}
          {overdue && (
            <div className="mt-2">
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                期限超過
              </span>
            </div>
          )}
          {dueSoon && !overdue && (
            <div className="mt-2">
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">
                期限間近
              </span>
            </div>
          )}
          {task.status === 'completed' && (
            <div className="mt-2">
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                完了
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// React.memoでラップしてパフォーマンスを最適化
export const GanttMilestone = React.memo(GanttMilestoneComponent, (prevProps, nextProps) => {
  // 以下のpropsが変更された場合のみ再レンダリング
  return (
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.status === nextProps.task.status &&
    prevProps.task.endDate.getTime() === nextProps.task.endDate.getTime() &&
    prevProps.task.isDimmed === nextProps.task.isDimmed &&
    prevProps.position.left === nextProps.position.left &&
    prevProps.position.top === nextProps.position.top &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.selectedCount === nextProps.selectedCount
  );
});
