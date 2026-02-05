import { useState, useCallback, useEffect, useRef } from 'react';
import { normalizeSnapshot, SAMPLE_SNAPSHOT, shiftSnapshotDates } from '../lib/normalize';
import { todayString } from '../lib/date';
import type { CompassState, SnapshotPayload } from '../lib/types';

const LOCAL_KEY = 'apdw_compass_snapshot_v1';
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true' || (typeof window !== 'undefined' && window.location.hostname === 'compass-demo.web.app');

export function useSnapshot() {
  const [state, setState] = useState<CompassState>(() => {
    const sourceSnapshot = DEMO_MODE ? shiftSnapshotDates(SAMPLE_SNAPSHOT) : SAMPLE_SNAPSHOT;
    const normalized = normalizeSnapshot(sourceSnapshot);
    if (typeof window === 'undefined' || DEMO_MODE) {
      return {
        projects: normalized.projects,
        tasks: normalized.tasks,
        people: normalized.people,
      };
    }
    try {
      const cached = localStorage.getItem(LOCAL_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as SnapshotPayload;
        const restored = normalizeSnapshot(parsed);
        return {
          projects: restored.projects,
          tasks: restored.tasks,
          people: restored.people,
        };
      }
    } catch (err) {
      console.warn('Failed to load cached snapshot', err);
    }
    return {
      projects: normalized.projects,
      tasks: normalized.tasks,
      people: normalized.people,
    };
  });

  // Undo/Redo用の履歴管理
  const [history, setHistory] = useState<CompassState[]>([state]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoingRef = useRef(false);

  // 状態を変更し、履歴に追加
  const setStateWithHistory = useCallback((newState: CompassState | ((prev: CompassState) => CompassState)) => {
    if (isUndoingRef.current) {
      // undo/redo中は履歴に追加しない
      setState(newState);
      return;
    }

    setState((prevState) => {
      const nextState = typeof newState === 'function' ? newState(prevState) : newState;

      // 履歴に追加（現在位置より後の履歴は削除）
      setHistory((prevHistory) => {
        // 現在位置より後を削除して新しい状態を追加
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        newHistory.push(nextState);
        // 履歴は最大50件まで保持
        if (newHistory.length > 50) {
          newHistory.shift();
        } else {
          setHistoryIndex(newHistory.length - 1);
        }
        return newHistory;
      });

      return nextState;
    });
  }, [historyIndex]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;

    isUndoingRef.current = true;
    const previousState = history[historyIndex - 1];
    if (previousState) {
      setState(previousState);
      setHistoryIndex((prev) => prev - 1);
    }
    isUndoingRef.current = false;
  }, [history, historyIndex]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;

    isUndoingRef.current = true;
    const nextState = history[historyIndex + 1];
    if (nextState) {
      setState(nextState);
      setHistoryIndex((prev) => prev + 1);
    }
    isUndoingRef.current = false;
  }, [history, historyIndex]);

  useEffect(() => {
    if (typeof window === 'undefined' || DEMO_MODE) return;
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({
        generated_at: todayString(),
        projects: state.projects,
        tasks: state.tasks,
        people: state.people,
      })
    );
  }, [state]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return [state, setStateWithHistory, undo, redo, canUndo, canRedo] as const;
}
