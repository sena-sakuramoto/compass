import { useState, useCallback, useRef, useEffect } from 'react';

export interface FeedbackEntry {
  type: 'complete' | 'pass';
  undoFn: (() => void) | null;
}

export interface FeedbackBarState {
  visible: boolean;
  completeCount: number;
  passCount: number;
  totalCount: number;
}

export function useFeedbackBar(autoDismissMs = 3000) {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state: FeedbackBarState = {
    visible: entries.length > 1, // Only show bar on 2nd+ action
    completeCount: entries.filter(e => e.type === 'complete').length,
    passCount: entries.filter(e => e.type === 'pass').length,
    totalCount: entries.length,
  };

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setEntries([]);
    }, autoDismissMs);
  }, [autoDismissMs]);

  const push = useCallback((entry: FeedbackEntry) => {
    setEntries(prev => [...prev, entry]);
    resetTimer();
  }, [resetTimer]);

  const undoLast = useCallback(() => {
    setEntries(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.undoFn) last.undoFn();
      return prev.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setEntries([]);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { state, push, undoLast, clear };
}
