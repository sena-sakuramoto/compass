import React from 'react';
import { SwipeBallCard } from '../SwipeBallCard';

interface BottomSheetItemProps {
  name: string;
  estimateLabel?: string | null;
  waitingFor?: string | null;    // e.g., "田中" — shows "→ 田中"
  deadlineLabel?: string | null; // e.g., "催促3/20"
  overdue?: boolean;
  onComplete: () => void;
  onThrow?: () => void;
  onPullBack?: () => void;
  onTap: () => void;
}

export function BottomSheetItem({
  name, estimateLabel, waitingFor, deadlineLabel, overdue,
  onComplete, onThrow, onPullBack, onTap,
}: BottomSheetItemProps) {
  return (
    <SwipeBallCard onThrow={onThrow} onPullBack={onPullBack}>
      <div className="flex items-center gap-3 py-3 border-b border-gray-100" onClick={onTap}>
        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          {waitingFor ? (
            <>
              <span className="text-sm text-gray-500">
                → {waitingFor}
                {deadlineLabel && <span className="ml-2 text-xs text-gray-400">{deadlineLabel}</span>}
              </span>
              <span className="text-sm text-gray-900 truncate block">{name}</span>
            </>
          ) : (
            <>
              <span className={`text-sm truncate block ${overdue ? 'text-red-500' : 'text-gray-900'}`}>
                {name}
              </span>
              {estimateLabel && <span className="text-xs text-gray-400">{estimateLabel}</span>}
            </>
          )}
        </div>
        {!waitingFor && (
          <button
            className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0 hover:border-gray-500 active:bg-gray-900 active:border-gray-900 transition-colors"
            onClick={(e) => { e.stopPropagation(); onComplete(); }}
            aria-label="完了"
          />
        )}
      </div>
    </SwipeBallCard>
  );
}
