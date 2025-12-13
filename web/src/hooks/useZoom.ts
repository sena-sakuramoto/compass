import { useEffect, useState, useRef, useCallback } from 'react';

interface UseZoomOptions {
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
  initialZoom?: number;
}

export function useZoom(options: UseZoomOptions = {}) {
  const {
    minZoom = 0.5,
    maxZoom = 2.0,
    zoomStep = 0.1,
    initialZoom = 1.0,
  } = options;

  const [zoom, setZoom] = useState(initialZoom);
  const touchStartDistance = useRef<number | null>(null);
  const lastZoom = useRef(initialZoom);

  const clampZoom = useCallback((value: number) => {
    return Math.min(Math.max(value, minZoom), maxZoom);
  }, [minZoom, maxZoom]);

  const zoomIn = useCallback(() => {
    setZoom(prev => clampZoom(prev + zoomStep));
  }, [clampZoom, zoomStep]);

  const zoomOut = useCallback(() => {
    setZoom(prev => clampZoom(prev - zoomStep));
  }, [clampZoom, zoomStep]);

  const resetZoom = useCallback(() => {
    setZoom(initialZoom);
  }, [initialZoom]);

  const setZoomLevel = useCallback((level: number) => {
    setZoom(clampZoom(level));
  }, [clampZoom]);

  // キーボードショートカット: Ctrl/Cmd + +/- でズーム
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          zoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          zoomOut();
        } else if (e.key === '0') {
          e.preventDefault();
          resetZoom();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom]);

  // タッチデバイスでのピンチズーム
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        touchStartDistance.current = distance;
        lastZoom.current = zoom;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartDistance.current !== null) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );

        const scale = distance / touchStartDistance.current;
        const newZoom = lastZoom.current * scale;
        setZoom(clampZoom(newZoom));
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchStartDistance.current = null;
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [zoom, clampZoom]);

  // ホイールズーム（Ctrl/Cmd押しながら）
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
        setZoom(prev => clampZoom(prev + delta));
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [clampZoom, zoomStep]);

  return {
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoomLevel,
  };
}
