// マイルストーンコンポーネント

import React, { useState } from 'react';
import type { GanttTask } from './types';
import { getStatusColor, isOverdue } from './utils';

interface GanttMilestoneProps {
  task: GanttTask;
  position: { left: number; width: number; top: number };
  onClick?: (task: GanttTask) => void;
}

const GanttMilestoneComponent: React.FC<GanttMilestoneProps> = ({
  task,
  position,
  onClick
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // ステータスに応じた色を取得
  const overdue = isOverdue(task);
  const color = overdue ? '#dc2626' : '#f97316'; // オレンジ色

  // マイルストーンの高さとトップ位置
  const milestoneSize = 20; // ダイヤモンドのサイズ
  const milestoneTop = position.top + 14; // 中央に配置

  const handleClick = () => {
    if (onClick) {
      onClick(task);
    }
  };

  return (
    <div
      className="absolute group"
      style={{
        left: `${position.left}px`,
        width: `${milestoneSize}px`,
        top: `${milestoneTop}px`,
        height: `${milestoneSize}px`,
        zIndex: 10
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* オレンジのひし形のマイルストーン */}
      <div
        className="w-full h-full cursor-pointer transition-all duration-200"
        style={{
          transform: isHovered ? 'rotate(45deg) scale(1.2)' : 'rotate(45deg) scale(1)',
          backgroundColor: overdue ? '#dc2626' : '#f97316', // オレンジ色 (期限超過は赤)
          boxShadow: isHovered
            ? '0 4px 12px rgba(249, 115, 22, 0.4)'
            : '0 2px 4px rgba(249, 115, 22, 0.3)',
          border: '2px solid white'
        }}
      />

      {/* マイルストーン名（右側に表示） */}
      {position.left > 100 && (
        <div
          className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-medium text-slate-700 pointer-events-none"
          style={{ zIndex: 5 }}
        >
          {task.name}
        </div>
      )}

      {/* ホバー時のツールチップ */}
      {isHovered && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 min-w-[220px] rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-xl backdrop-blur pointer-events-none">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3"
              style={{
                transform: 'rotate(45deg)',
                backgroundColor: overdue ? '#dc2626' : '#f97316',
                border: '1px solid white'
              }}
            />
            <div className="text-sm font-semibold text-orange-800">◆ マイルストーン</div>
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
    prevProps.position.left === nextProps.position.left &&
    prevProps.position.top === nextProps.position.top
  );
});
