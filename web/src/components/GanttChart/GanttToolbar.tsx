// ツールバーコンポーネント

import React from 'react';
import type { ViewMode } from './types';

interface GanttToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onToday?: () => void;
  className?: string;
}

export const GanttToolbar: React.FC<GanttToolbarProps> = ({
  viewMode,
  onViewModeChange,
  onZoomIn,
  onZoomOut,
  onToday,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-1.5 py-1 text-xs font-medium shadow-md ${className}`}
    >
      <button
        onClick={() => onViewModeChange('day')}
        className={`px-2 py-1 rounded-full transition-colors ${
          viewMode === 'day' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        日
      </button>
      <button
        onClick={() => onViewModeChange('week')}
        className={`px-2 py-1 rounded-full transition-colors ${
          viewMode === 'week' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        週
      </button>
      <button
        onClick={() => onViewModeChange('month')}
        className={`px-2 py-1 rounded-full transition-colors ${
          viewMode === 'month' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        月
      </button>
      <div className="ml-1 flex items-center gap-1 border-l border-slate-100 pl-1">
        <button
          onClick={onToday}
          className="px-2 py-1 rounded-full text-slate-600 hover:bg-slate-100"
          title="今日に移動"
        >
          今日
        </button>
      </div>
      <div className="hidden md:flex items-center gap-1 border-l border-slate-100 pl-1">
        <button
          onClick={onZoomOut}
          className="px-2 py-1 rounded-full text-slate-600 hover:bg-slate-100"
          title="縮小"
        >
          －
        </button>
        <button
          onClick={onZoomIn}
          className="px-2 py-1 rounded-full text-slate-600 hover:bg-slate-100"
          title="拡大"
        >
          ＋
        </button>
      </div>
    </div>
  );
};
