import React from 'react';
import type { FeedbackBarState } from '../../hooks/useFeedbackBar';

interface FeedbackBarProps {
  state: FeedbackBarState;
  onUndo: () => void;
}

export function FeedbackBar({ state, onUndo }: FeedbackBarProps) {
  if (!state.visible) return null;

  const parts: string[] = [];
  if (state.completeCount > 0) parts.push(`✓ ${state.completeCount}件`);
  if (state.passCount > 0) parts.push(`渡し ${state.passCount}件`);
  const label = parts.join('  ');

  return (
    <div
      className="fixed left-4 right-4 flex items-center justify-between px-4 py-2.5 bg-gray-900 text-white text-sm rounded-xl shadow-sm md:hidden animate-fade-in"
      style={{ bottom: 120, zIndex: 30 }}
    >
      <span>{label}</span>
      <button
        className="text-gray-300 hover:text-white text-xs font-medium"
        onClick={onUndo}
      >
        元に戻す
      </button>
    </div>
  );
}
