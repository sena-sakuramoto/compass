import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { TimelineCard } from './TimelineCard';
import { FreeSlot } from './FreeSlot';
import { CurrentTimeLine } from './CurrentTimeLine';
import {
  computeTimelinePlacements,
  computeFreeSlots,
  suggestChips,
  formatMinutesAsTime,
  type TimelineTask,
  type ChipCandidate,
} from '../../lib/timeline';

interface TimelineTaskWithHandlers extends TimelineTask {
  onComplete: () => void;
  onThrow?: () => void;
  onTap: () => void;
}

interface TimelineProps {
  tasks: TimelineTaskWithHandlers[];
  trayItems: ChipCandidate[];
  dayStart: number;
  dayEnd: number;
  gap: number;
  isToday: boolean;
  onChipPlace: (item: ChipCandidate, startMinutes: number) => void;
  /** Externally triggered animation state per task id */
  animatingOut?: Record<string, 'complete' | 'pass'>;
  onAnimationEnd?: (id: string) => void;
}

export function Timeline({
  tasks, trayItems, dayStart, dayEnd, gap, isToday, onChipPlace,
  animatingOut: externalAnimatingOut, onAnimationEnd: externalOnAnimationEnd,
}: TimelineProps) {
  const animatingOut = externalAnimatingOut ?? {};
  const nowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (nowRef.current) {
      nowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, []);

  const placements = useMemo(
    () => computeTimelinePlacements(tasks, dayStart, dayEnd, gap),
    [tasks, dayStart, dayEnd, gap],
  );

  const freeSlots = useMemo(
    () => computeFreeSlots(placements, dayStart, dayEnd),
    [placements, dayStart, dayEnd],
  );

  const [nowMinutes, setNowMinutes] = React.useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  type Entry =
    | { type: 'task'; placement: typeof placements[0]; task: TimelineTaskWithHandlers }
    | { type: 'free'; slot: typeof freeSlots[0] }
    | { type: 'now' };

  const entries = useMemo(() => {
    const items: (Entry & { sortKey: number })[] = [];

    for (const p of placements) {
      const task = tasks.find(t => t.id === p.id);
      if (task) {
        items.push({ type: 'task', placement: p, task, sortKey: p.startMinutes });
      }
    }

    for (const slot of freeSlots) {
      items.push({ type: 'free', slot, sortKey: slot.startMinutes });
    }

    if (isToday && nowMinutes >= dayStart && nowMinutes <= dayEnd) {
      items.push({ type: 'now', sortKey: nowMinutes });
    }

    return items.sort((a, b) => a.sortKey - b.sortKey);
  }, [placements, freeSlots, tasks, isToday, nowMinutes, dayStart, dayEnd]);

  const handleAnimationEnd = useCallback((id: string) => {
    externalOnAnimationEnd?.(id);
  }, [externalOnAnimationEnd]);

  return (
    <div className="px-5 pb-4">
      {entries.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">
          何もない一日。新しく追加するか、あとで整理から持ってきましょう
        </div>
      )}

      {entries.map((entry, i) => {
        if (entry.type === 'now') {
          return <div key="now" ref={nowRef}><CurrentTimeLine /></div>;
        }

        if (entry.type === 'free') {
          const chips = suggestChips(trayItems, entry.slot.durationMinutes);
          return (
            <div key={`free-${entry.slot.startMinutes}`}>
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-400 w-12 pt-4 text-right shrink-0">
                  {formatMinutesAsTime(entry.slot.startMinutes)}
                </span>
                <div className="flex-1">
                  <FreeSlot
                    durationMinutes={entry.slot.durationMinutes}
                    chips={chips}
                    onChipTap={(chip) => onChipPlace(chip, entry.slot.startMinutes)}
                  />
                </div>
              </div>
              <div className="flex items-start gap-3 mb-2">
                <span className="text-xs text-gray-300 w-12 text-right shrink-0">
                  {formatMinutesAsTime(entry.slot.endMinutes)}
                </span>
                <div className="flex-1 border-t border-gray-100" />
              </div>
            </div>
          );
        }

        const { placement, task } = entry;
        return (
          <div key={task.id} className="flex items-start gap-3 mb-2">
            <span className="text-xs text-gray-400 w-12 pt-3 text-right shrink-0">
              {formatMinutesAsTime(placement.startMinutes)}
            </span>
            <div className="flex-1">
              <TimelineCard
                name={task.name}
                startMinutes={placement.startMinutes}
                endMinutes={placement.endMinutes}
                onComplete={task.onComplete}
                onThrow={task.onThrow}
                onTap={task.onTap}
                animateOut={animatingOut[task.id] ?? null}
                onAnimationEnd={() => handleAnimationEnd(task.id)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
