// 工程バーコンポーネント（進捗チャージ表現）
// OuterBar（トラック）+ InnerBar（チャージ部分）

import React from 'react';
import type { GanttStage, StageStatus } from './types';
import { GANTT_COLORS } from './colors';

interface StageBarProps {
  stage: GanttStage;
  position: {
    left: number;
    width: number;
    top: number;
  };
}

export const StageBar: React.FC<StageBarProps> = ({ stage, position }) => {
  // 進捗率（0-100）
  const progressPct = Math.max(0, Math.min(100, stage.progressPct));

  // ステータスに応じたスタイル
  const isDone = stage.status === 'done';
  const isDelayed = stage.status === 'delayed';

  return (
    <div
      className="absolute"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
        height: '16px',
      }}
    >
      {/* OuterBar（トラック） - 工程の予定期間 */}
      <div
        className={`
          h-full rounded-full overflow-hidden relative
          ${GANTT_COLORS.track.bg}
          ${GANTT_COLORS.track.border}
          border
        `}
      >
        {/* InnerBar（チャージ部分） - 工程の進捗率 */}
        <div
          className={`
            h-full
            ${isDone ? GANTT_COLORS.charge.bgDone : GANTT_COLORS.charge.bg}
            transition-[width] duration-200 ease-out
          `}
          style={{
            width: `${progressPct}%`,
          }}
        />

        {/* 完了アイコン（100%時） */}
        {isDone && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <svg
              className={`w-3 h-3 ${GANTT_COLORS.markers.done.text}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>

      {/* 遅延マーカー（左端に細い赤ライン） */}
      {isDelayed && (
        <div
          className={`absolute left-0 top-0 bottom-0 w-0.5 ${GANTT_COLORS.markers.delayed.bg}`}
          title="遅延"
        />
      )}

      {/* ホバー時の工程名ツールチップ */}
      <div className="absolute left-0 top-full mt-1 hidden group-hover:block bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
        {stage.name} ({progressPct}%)
      </div>
    </div>
  );
};
