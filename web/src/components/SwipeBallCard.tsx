import { useRef, useState, useCallback } from 'react';

interface SwipeBallCardProps {
  children: React.ReactNode;
  /** Called on right swipe — "throw ball" to the other person */
  onThrow?: () => void;
  /** Called on left swipe — "pull ball back" to yourself */
  onPullBack?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}

const SWIPE_THRESHOLD = 80;
const MAX_OFFSET = 120;

export function SwipeBallCard({ children, onThrow, onPullBack, disabled, ariaLabel }: SwipeBallCardProps) {
  const startX = useRef(0);
  const startY = useRef(0);
  const suppressClick = useRef(false);
  const swipingRef = useRef(false);
  const offsetXRef = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lockedAxis = useRef<'x' | 'y' | null>(null);
  const setOffset = useCallback((value: number) => {
    offsetXRef.current = value;
    setOffsetX(value);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    suppressClick.current = false;
    swipingRef.current = true;
    lockedAxis.current = null;
    setSwiping(true);
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipingRef.current || disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Lock axis after 10px movement
    if (lockedAxis.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      lockedAxis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }

    if (lockedAxis.current === 'y') return;
    if (lockedAxis.current === 'x') {
      e.preventDefault();
      if (Math.abs(dx) > 18) {
        suppressClick.current = true;
      }
    }

    const clamped = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dx));
    setOffset(clamped);
  }, [disabled, setOffset]);

  const handleTouchEnd = useCallback(() => {
    if (!swipingRef.current) return;
    swipingRef.current = false;
    setSwiping(false);
    const currentOffset = offsetXRef.current;

    if (currentOffset > SWIPE_THRESHOLD && onThrow) {
      setDismissed(true);
      setOffset(300);
      setTimeout(() => {
        onThrow();
        setDismissed(false);
        setOffset(0);
      }, 250);
    } else if (currentOffset < -SWIPE_THRESHOLD && onPullBack) {
      setDismissed(true);
      setOffset(-300);
      setTimeout(() => {
        onPullBack();
        setDismissed(false);
        setOffset(0);
      }, 250);
    } else {
      setOffset(0);
    }
    lockedAxis.current = null;
  }, [onThrow, onPullBack, setOffset]);

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
    }
  }, []);

  const interactive = !disabled && Boolean(onThrow || onPullBack);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!interactive) return;
      if (e.key === 'ArrowRight' && onThrow) {
        e.preventDefault();
        onThrow();
        return;
      }
      if (e.key === 'ArrowLeft' && onPullBack) {
        e.preventDefault();
        onPullBack();
      }
    },
    [interactive, onPullBack, onThrow]
  );

  const progress = Math.abs(offsetX) / SWIPE_THRESHOLD;
  const isThrow = offsetX > 0;
  const isPull = offsetX < 0;

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      role={interactive ? 'group' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {/* Background hint */}
      <div className="absolute inset-0 flex items-center justify-between px-4">
        <div className={`flex items-center gap-1 text-xs font-medium transition-opacity ${isPull && progress > 0.3 ? 'opacity-100' : 'opacity-0'}`}>
          <span className="text-slate-600">← 自分に戻す</span>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium transition-opacity ${isThrow && progress > 0.3 ? 'opacity-100' : 'opacity-0'}`}>
          <span className="text-slate-600">相手に渡す →</span>
        </div>
      </div>

      {/* Swipeable content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClickCapture={handleClickCapture}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? 'none' : 'transform 0.25s ease-out',
          opacity: dismissed ? 0.5 : 1,
          touchAction: 'pan-y',
        }}
        className="relative z-10"
      >
        {children}
      </div>
    </div>
  );
}
