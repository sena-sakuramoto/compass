// タスク依存関係の矢印コンポーネント

import React from 'react';
import type { GanttTask } from './types';

interface DependencyArrowProps {
  fromTask: GanttTask;
  toTask: GanttTask;
  fromPosition: { left: number; width: number; top: number };
  toPosition: { left: number; width: number; top: number };
  color?: string;
}

export const GanttDependencyArrow: React.FC<DependencyArrowProps> = ({
  fromTask,
  toTask,
  fromPosition,
  toPosition,
  color = '#64748b'
}) => {
  // 矢印の開始点と終了点を計算
  const barHeight = 32;
  const barVerticalCenter = 8 + barHeight / 2;

  // 開始点: fromタスクの右端中央
  const startX = fromPosition.left + fromPosition.width;
  const startY = fromPosition.top + barVerticalCenter;

  // 終了点: toタスクの左端中央
  const endX = toPosition.left;
  const endY = toPosition.top + barVerticalCenter;

  // パスの計算（曲線）
  const calculatePath = (): string => {
    const horizontalGap = endX - startX;
    const verticalGap = endY - startY;

    // 水平距離が短い場合は直線的に
    if (Math.abs(horizontalGap) < 20) {
      return `M ${startX} ${startY} L ${endX} ${endY}`;
    }

    // ベジェ曲線を使用
    const controlPointOffset = Math.min(Math.abs(horizontalGap) / 3, 40);

    if (horizontalGap > 0) {
      // 通常の依存関係（左→右）
      const cp1X = startX + controlPointOffset;
      const cp1Y = startY;
      const cp2X = endX - controlPointOffset;
      const cp2Y = endY;

      return `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
    } else {
      // 逆向き依存関係（折り返し）
      const midY = startY + (verticalGap / 2);

      return `
        M ${startX} ${startY}
        L ${startX + 15} ${startY}
        C ${startX + 25} ${startY}, ${startX + 25} ${midY}, ${startX + 15} ${midY}
        L ${endX - 15} ${midY}
        C ${endX - 25} ${midY}, ${endX - 25} ${endY}, ${endX - 15} ${endY}
        L ${endX} ${endY}
      `;
    }
  };

  // 矢印の先端を描画
  const arrowHeadSize = 6;
  const arrowAngle = Math.atan2(endY - startY, endX - startX);
  const arrowHeadPath = `
    M ${endX} ${endY}
    L ${endX - arrowHeadSize * Math.cos(arrowAngle - Math.PI / 6)} ${endY - arrowHeadSize * Math.sin(arrowAngle - Math.PI / 6)}
    M ${endX} ${endY}
    L ${endX - arrowHeadSize * Math.cos(arrowAngle + Math.PI / 6)} ${endY - arrowHeadSize * Math.sin(arrowAngle + Math.PI / 6)}
  `;

  return (
    <g className="dependency-arrow">
      {/* 接続線 */}
      <path
        d={calculatePath()}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeDasharray="5,3"
        opacity={0.5}
        className="transition-opacity hover:opacity-100"
      />

      {/* 矢印の先端 */}
      <path
        d={arrowHeadPath}
        stroke={color}
        strokeWidth={2}
        fill="none"
        opacity={0.5}
        className="transition-opacity hover:opacity-100"
      />

      {/* ホバー時のラベル表示用の不可視領域 */}
      <path
        d={calculatePath()}
        stroke="transparent"
        strokeWidth={10}
        fill="none"
        className="cursor-pointer"
      >
        <title>{`${fromTask.name} → ${toTask.name}`}</title>
      </path>
    </g>
  );
};
