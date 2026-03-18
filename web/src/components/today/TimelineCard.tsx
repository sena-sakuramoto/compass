import React from 'react';
import { SwipeBallCard } from '../SwipeBallCard';
import { formatMinutesAsTime, formatDuration } from '../../lib/timeline';

interface TimelineCardProps {
  name: string;
  startMinutes: number;
  endMinutes: number;
  onComplete: () => void;
  onThrow?: () => void;
  onTap: () => void;
  animateOut?: 'complete' | 'pass' | null;
  onAnimationEnd?: () => void;
}

export function TimelineCard({
  name, startMinutes, endMinutes,
  onComplete, onThrow, onTap,
  animateOut, onAnimationEnd,
}: TimelineCardProps) {
  const duration = endMinutes - startMinutes;
  const timeLabel = `${formatMinutesAsTime(startMinutes)} - ${formatMinutesAsTime(endMinutes)}`;

  const animClass =
    animateOut === 'complete' ? 'animate-shrink-out'
    : animateOut === 'pass' ? 'animate-slide-right-out'
    : '';

  return (
    <SwipeBallCard onThrow={onThrow}>
      <div
        className={`flex items-center gap-3 ${animClass}`}
        onAnimationEnd={onAnimationEnd}
        onClick={onTap}
      >
        <div className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-[15px] font-semibold text-gray-900 leading-snug">{name}</p>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {timeLabel}
            <span className="ml-2">{formatDuration(duration)}</span>
          </p>
        </div>
        <button
          className="w-7 h-7 rounded-full border-2 border-gray-300 shrink-0 hover:border-gray-500 active:bg-gray-900 active:border-gray-900 transition-colors"
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          aria-label="完了"
        />
      </div>
    </SwipeBallCard>
  );
}
