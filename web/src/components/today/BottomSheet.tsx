import React, { useState, useCallback } from 'react';

interface BottomSheetProps {
  title: string;
  count: number;
  children: React.ReactNode;
}

export function BottomSheet({ title, count, children }: BottomSheetProps) {
  const [expanded, setExpanded] = useState(true);
  const toggleExpanded = useCallback(() => setExpanded(prev => !prev), []);

  return (
    <div className="border-t border-gray-200 bg-white md:hidden">
      {/* Header — always visible */}
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer"
        onClick={toggleExpanded}
      >
        <span className="text-[15px] font-semibold text-gray-900">{title}</span>
        <span className="text-sm text-gray-400">{count}件</span>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-5 pb-4">
          {count === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              ＋ボタンで何でも入れておけます
            </p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
