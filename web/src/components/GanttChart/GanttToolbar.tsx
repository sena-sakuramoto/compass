// ツールバーコンポーネント

import React from 'react';
import type { ViewMode } from './types';

interface GanttToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export const GanttToolbar: React.FC<GanttToolbarProps> = ({
  viewMode,
  onViewModeChange,
  onZoomIn,
  onZoomOut
}) => {
  return (
    <div className="h-10 border-b border-slate-200 bg-white flex items-center justify-between px-4 gap-4">
      {/* ビューモード切替 */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
        <button
          onClick={() => onViewModeChange('day')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            viewMode === 'day'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          日
        </button>
        <button
          onClick={() => onViewModeChange('week')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            viewMode === 'week'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          週
        </button>
        <button
          onClick={() => onViewModeChange('month')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            viewMode === 'month'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          月
        </button>
      </div>

      {/* 右側：ズームボタン */}
      <div className="flex items-center gap-1">
        <button
          onClick={onZoomOut}
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          title="縮小"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={onZoomIn}
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          title="拡大"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
};
