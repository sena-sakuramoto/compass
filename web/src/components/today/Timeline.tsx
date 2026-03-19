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

    const showNow = isToday && nowMinutes >= dayStart && nowMinutes <= dayEnd;

    for (const slot of freeSlots) {
      // Split free slot at current time so the now-line appears inside it
      if (showNow && nowMinutes > slot.startMinutes && nowMinutes < slot.endMinutes) {
        items.push({
          type: 'free',
          slot: { startMinutes: slot.startMinutes, endMinutes: nowMinutes, durationMinutes: nowMinutes - slot.startMinutes },
          sortKey: slot.startMinutes,
        });
        items.push({ type: 'now', sortKey: nowMinutes });
        items.push({
          type: 'free',
          slot: { startMinutes: nowMinutes, endMinutes: slot.endMinutes, durationMinutes: slot.endMinutes - nowMinutes },
          sortKey: nowMinutes + 0.1, // just after the now line
        });
      } else {
        items.push({ type: 'free', slot, sortKey: slot.startMinutes });
      }
    }

    // If now doesn't fall inside a free slot, still show it
    if (showNow && !items.some(e => e.type === 'now')) {
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

      {/* Trailing free time + day end marker */}
      {(() => {
        // Find the latest end time from all entries
        let lastEnd = dayStart;
        for (const e of entries) {
          if (e.type === 'task') lastEnd = Math.max(lastEnd, e.placement.endMinutes);
          if (e.type === 'free') lastEnd = Math.max(lastEnd, e.slot.endMinutes);
        }
        const remaining = dayEnd - lastEnd;
        return (
          <>
            {remaining > 0 && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-400 w-12 pt-4 text-right shrink-0">
                  {formatMinutesAsTime(lastEnd)}
                </span>
                <div className="flex-1">
                  <FreeSlot
                    durationMinutes={remaining}
                    chips={suggestChips(trayItems, remaining)}
                    onChipTap={(chip) => onChipPlace(chip, lastEnd)}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-gray-300 w-12 text-right shrink-0">
                {formatMinutesAsTime(dayEnd)}
              </span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
          </>
        );
      })()}
    </div>
  );
}
