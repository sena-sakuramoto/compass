import React, { useRef, useState, useCallback } from 'react';

interface BottomSheetProps {
  title: string;
  count: number;
  children: React.ReactNode;
  peekHeight?: number; // Height of collapsed peek area (default 56)
}

export function BottomSheet({ title, count, children, peekHeight = 56 }: BottomSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const startYRef = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dy = e.changedTouches[0].clientY - startYRef.current;
    if (dy < -40) setExpanded(true);   // swipe up → expand
    if (dy > 40) setExpanded(false);   // swipe down → collapse
  }, []);

  const toggleExpanded = useCallback(() => setExpanded(prev => !prev), []);

  return (
    <div
      className="fixed left-0 right-0 bg-white border-t border-gray-200 transition-transform duration-300 ease-out md:hidden will-change-transform"
      style={{
        bottom: 56, // BottomNav height
        height: '60vh',
        transform: expanded ? 'translateY(0)' : `translateY(calc(60vh - ${peekHeight}px))`,
        zIndex: 10,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: 'hidden',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-2 pb-1 cursor-grab" onClick={toggleExpanded}>
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-3" onClick={toggleExpanded}>
        <span className="text-[15px] font-semibold text-gray-900">{title}</span>
        <span className="text-sm text-gray-400">{count}件</span>
      </div>

      {/* Content (only visible when expanded) */}
      {expanded && (
        <div className="overflow-y-auto px-5 pb-4" style={{ maxHeight: 'calc(60vh - 80px)' }}>
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
