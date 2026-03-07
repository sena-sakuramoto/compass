import { useRef, useCallback, useEffect } from 'react';

interface SwipeBallCardProps {
  children: React.ReactNode;
  /** Called on right swipe — "throw ball" to the other person */
  onThrow?: () => void;
  /** Called on left swipe — "pull ball back" to yourself */
  onPullBack?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}

// Tuning
const SWIPE_THRESHOLD = 60;
const VELOCITY_THRESHOLD = 0.4; // px/ms
const DISMISS_DISTANCE = 320;
const RUBBER_FACTOR = 0.35;
const MAX_DRAG = 160;

export function SwipeBallCard({ children, onThrow, onPullBack, disabled, ariaLabel }: SwipeBallCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hintLeftRef = useRef<HTMLDivElement>(null);
  const hintRightRef = useRef<HTMLDivElement>(null);

  // Keep latest callbacks in refs so event handlers never go stale
  const onThrowRef = useRef(onThrow);
  const onPullBackRef = useRef(onPullBack);
  const disabledRef = useRef(disabled);
  useEffect(() => { onThrowRef.current = onThrow; }, [onThrow]);
  useEffect(() => { onPullBackRef.current = onPullBack; }, [onPullBack]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const currentX = useRef(0);
  const lockedAxis = useRef<'x' | 'y' | null>(null);
  const isDragging = useRef(false);
  const suppressClick = useRef(false);
  const rafId = useRef(0);

  const applyTransform = useCallback((x: number, animate: boolean) => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = animate
      ? 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.35s ease'
      : 'none';
    el.style.transform = `translateX(${x}px)`;
    el.style.opacity = Math.abs(x) > SWIPE_THRESHOLD ? '0.7' : '1';

    const progress = Math.min(Math.abs(x) / SWIPE_THRESHOLD, 1);
    if (hintLeftRef.current) hintLeftRef.current.style.opacity = x < -10 ? String(progress) : '0';
    if (hintRightRef.current) hintRightRef.current.style.opacity = x > 10 ? String(progress) : '0';
  }, []);

  const resetCard = useCallback(() => {
    applyTransform(0, true);
    if (hintLeftRef.current) hintLeftRef.current.style.opacity = '0';
    if (hintRightRef.current) hintRightRef.current.style.opacity = '0';
  }, [applyTransform]);

  // Stable handlers — never re-created, use refs for latest values
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (disabledRef.current) return;
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      startTime.current = Date.now();
      currentX.current = 0;
      lockedAxis.current = null;
      isDragging.current = true;
      suppressClick.current = false;
      el.style.transition = 'none';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || disabledRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      if (lockedAxis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        lockedAxis.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }
      if (lockedAxis.current === 'y') return;
      if (lockedAxis.current !== 'x') return;

      e.preventDefault();
      if (Math.abs(dx) > 12) suppressClick.current = true;

      let finalX = dx;
      if (dx > 0 && !onThrowRef.current) finalX = dx * RUBBER_FACTOR;
      else if (dx < 0 && !onPullBackRef.current) finalX = dx * RUBBER_FACTOR;
      finalX = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, finalX));
      currentX.current = finalX;

      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        applyTransform(finalX, false);
      });
    };

    const onTouchEnd = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      cancelAnimationFrame(rafId.current);

      const dx = currentX.current;
      const elapsed = Date.now() - startTime.current;
      const velocity = Math.abs(dx) / Math.max(elapsed, 1);

      const passedThreshold = Math.abs(dx) > SWIPE_THRESHOLD;
      const fastFlick = velocity > VELOCITY_THRESHOLD && Math.abs(dx) > 20;

      // Right swipe = throw
      if (dx > 0 && (passedThreshold || fastFlick) && onThrowRef.current) {
        applyTransform(DISMISS_DISTANCE, true);
        const cb = onThrowRef.current;
        setTimeout(() => {
          cb();
          requestAnimationFrame(() => {
            currentX.current = 0;
            resetCard();
          });
        }, 300);
        return;
      }

      // Left swipe = pull back
      if (dx < 0 && (passedThreshold || fastFlick) && onPullBackRef.current) {
        applyTransform(-DISMISS_DISTANCE, true);
        const cb = onPullBackRef.current;
        setTimeout(() => {
          cb();
          requestAnimationFrame(() => {
            currentX.current = 0;
            resetCard();
          });
        }, 300);
        return;
      }

      // Snap back
      currentX.current = 0;
      resetCard();
      lockedAxis.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [applyTransform, resetCard]); // stable deps only — callbacks via refs

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
      if (e.key === 'ArrowRight' && onThrowRef.current) { e.preventDefault(); onThrowRef.current(); }
      if (e.key === 'ArrowLeft' && onPullBackRef.current) { e.preventDefault(); onPullBackRef.current(); }
    },
    [interactive]
  );

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      role={interactive ? 'group' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {/* Background hints */}
      <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
        <div ref={hintLeftRef} className="flex items-center gap-1 text-xs font-medium opacity-0">
          <span className="text-blue-600">← 自分に戻す</span>
        </div>
        <div ref={hintRightRef} className="flex items-center gap-1 text-xs font-medium opacity-0">
          <span className="text-orange-600">相手に渡す →</span>
        </div>
      </div>

      {/* Swipeable card */}
      <div
        ref={cardRef}
        onClickCapture={handleClickCapture}
        className="relative z-10 will-change-transform"
        style={{ touchAction: 'pan-y' }}
      >
        {children}
      </div>
    </div>
  );
}
