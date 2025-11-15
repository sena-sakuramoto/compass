// 時間軸コンポーネント

import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { DateTick, ViewMode } from './types';

interface GanttTimeAxisProps {
  ticks: DateTick[];
  containerWidth: number;
  height?: number;
  viewMode: ViewMode;
}

export const GanttTimeAxis: React.FC<GanttTimeAxisProps> = ({
  ticks,
  containerWidth,
  height = 64,
  viewMode
}) => {
  if (ticks.length === 0) return null;

  const tickWidth = containerWidth / ticks.length;

  // 月ごとのグループを作成（日表示の時のみ）
  const monthGroups = useMemo(() => {
    if (viewMode !== 'day') return [];

    const groups: { month: string; startIndex: number; count: number }[] = [];
    let currentMonth = '';
    let currentStartIndex = 0;
    let currentCount = 0;

    ticks.forEach((tick, index) => {
      const month = format(tick.date, 'M月', { locale: ja });

      if (month !== currentMonth) {
        if (currentMonth !== '') {
          groups.push({ month: currentMonth, startIndex: currentStartIndex, count: currentCount });
        }
        currentMonth = month;
        currentStartIndex = index;
        currentCount = 1;
      } else {
        currentCount++;
      }
    });

    // 最後のグループを追加
    if (currentMonth !== '') {
      groups.push({ month: currentMonth, startIndex: currentStartIndex, count: currentCount });
    }

    return groups;
  }, [ticks, viewMode]);

  // 日表示の場合は2段階表示
  if (viewMode === 'day') {
    return (
      <div
        className="relative border-b border-slate-200 bg-white"
        style={{ height: `${height}px`, minWidth: `${containerWidth}px` }}
      >
        {/* 月のヘッダー */}
        <div className="absolute top-0 left-0 right-0 h-6 border-b border-slate-200 bg-slate-50/50">
          {monthGroups.map((group, index) => (
            <div
              key={index}
              className="absolute flex items-center justify-center text-xs font-semibold text-slate-700"
              style={{
                left: `${group.startIndex * tickWidth}px`,
                width: `${group.count * tickWidth}px`,
                height: '100%'
              }}
            >
              {group.month}
              {index > 0 && (
                <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-300" />
              )}
            </div>
          ))}
        </div>

        {/* 日付と曜日 */}
        <div className="absolute top-6 left-0 right-0 bottom-0">
          {ticks.map((tick, index) => {
            const x = index * tickWidth;
            const isWeekend = tick.isWeekend;
            const day = tick.date.getDate();
            const weekday = format(tick.date, 'EEE', { locale: ja });

            // 今日かどうかを判定
            const today = new Date();
            const isToday =
              tick.date.getFullYear() === today.getFullYear() &&
              tick.date.getMonth() === today.getMonth() &&
              tick.date.getDate() === today.getDate();

            return (
              <div
                key={index}
                className="absolute flex flex-col items-center justify-center"
                style={{
                  left: `${x}px`,
                  width: `${tickWidth}px`,
                  height: '100%'
                }}
              >
                {/* 今日の背景 */}
                {isToday && (
                  <div
                    className="absolute inset-0 bg-blue-100/40"
                  />
                )}

                {/* 日付 */}
                <div
                  className={`relative text-[11px] font-semibold ${
                    isToday ? 'text-blue-700' : isWeekend ? 'text-rose-500' : 'text-slate-600'
                  }`}
                >
                  {day}
                </div>
                {/* 曜日 */}
                <div
                  className={`relative text-[10px] ${
                    isToday ? 'text-blue-600' : isWeekend ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {weekday}
                </div>

                {/* 縦線 */}
                {index > 0 && (
                  <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 週・月表示の場合は従来通り
  return (
    <div
      className="relative border-b border-slate-200 bg-white"
      style={{ height: `${height}px`, minWidth: `${containerWidth}px` }}
    >
      {ticks.map((tick, index) => {
        const x = index * tickWidth;
        const isWeekend = tick.isWeekend;

        return (
          <div
            key={index}
            className="absolute flex flex-col items-center justify-center"
            style={{
              left: `${x}px`,
              width: `${tickWidth}px`,
              height: '100%'
            }}
          >
            {/* 日付ラベル */}
            <div
              className={`text-[11px] font-semibold ${
                isWeekend ? 'text-rose-500' : 'text-slate-600'
              }`}
            >
              {tick.label}
            </div>
            {/* 曜日ラベル */}
            <div
              className={`text-[10px] ${
                isWeekend ? 'text-rose-400' : 'text-slate-400'
              }`}
            >
              {tick.date.toLocaleDateString('ja-JP', { weekday: 'short' })}
            </div>

            {/* 縦線 */}
            {index > 0 && (
              <div
                className="absolute left-0 top-0 bottom-0 w-px bg-slate-200"
                style={{ height: '100%' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
