# Mobile Today Screen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mobile TasksPage with an Any Planner-inspired "today" screen featuring a continuous timeline, bottom sheet tray, and subtle card-based feedback.

**Architecture:** TodayView is rendered **inside** TasksPage's mobile section (replacing L1916-2090). It is NOT a replacement for TasksPage itself — TasksPage's internal ball handlers, task state, and desktop rendering remain untouched. TodayView receives Task objects and callback functions directly from TasksPage's scope. The new component orchestrates: DateHeader, Timeline, BottomSheet, FeedbackBar, QuickAddSheet.

**IMPORTANT — Integration architecture:** Ball handlers (`handleBallThrow`, `handleBallPullBack`, `applyBallHolderWithUndo`) are defined INSIDE TasksPage, not at App.tsx level. TodayView must be rendered from within TasksPage to access these. All callbacks pass `Task` objects (not string IDs) to match existing handler signatures.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS. No new dependencies. Bottom sheet uses CSS transitions + touch events (same pattern as SwipeBallCard). Animations via CSS transitions/keyframes.

**Spec:** `docs/superpowers/specs/2026-03-18-mobile-today-screen-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `web/src/components/today/TodayView.tsx` | Orchestrator — date state, data preparation, layout |
| `web/src/components/today/DateHeader.tsx` | Large date, prev/next, week row |
| `web/src/components/today/Timeline.tsx` | Time axis, task cards, free slots, current time line |
| `web/src/components/today/TimelineCard.tsx` | Single task card on timeline (title, time, duration, ○) |
| `web/src/components/today/FreeSlot.tsx` | Free time block with chip suggestions |
| `web/src/components/today/BottomSheet.tsx` | Draggable tray — あとで整理 |
| `web/src/components/today/BottomSheetItem.tsx` | Single item in the tray |
| `web/src/components/today/FeedbackBar.tsx` | "✓ N件 元に戻す" counter bar |
| `web/src/components/today/QuickAddSheet.tsx` | FAB + quick add modal |
| `web/src/components/today/CurrentTimeLine.tsx` | Yellow horizontal line + time badge |
| `web/src/lib/timeline.ts` | Pure functions: time placement, free slot calculation, chip suggestion |
| `web/src/hooks/useFeedbackBar.ts` | State management for feedback counter + undo queue |

### Modified Files

| File | Change |
|------|--------|
| `web/src/App.tsx` | Inside TasksPage: replace mobile JSX (L1916-2090) with `<TodayView />`. Remove old mobile useMemos/render functions (L1489-1720). Keep ball handlers (used by TodayView via props). Keep desktop view. |
| `web/src/components/SwipeBallCard.tsx` | No changes needed — reused as-is |
| `web/src/components/BottomNavBar.tsx` | No changes needed |

### Prerequisites

Before Task 1, verify vitest is available:
```bash
cd web && npx vitest --version
```
If not installed: `pnpm add -D vitest` and add to `vite.config.ts`:
```typescript
/// <reference types="vitest" />
export default defineConfig({
  // ... existing config
  test: { globals: true },
});
```

---

## Task 1: Pure Timeline Logic (`lib/timeline.ts`)

No UI. Pure functions that the Timeline component will consume.

**Files:**
- Create: `web/src/lib/timeline.ts`
- Reference: `web/src/App.tsx:131-134` (constants), `web/src/App.tsx:1560-1600` (existing logic)

- [ ] **Step 1: Write tests for `computeTimelinePlacements`**

Create `web/src/lib/__tests__/timeline.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  computeTimelinePlacements,
  computeFreeSlots,
  suggestChips,
  type TimelinePlacement,
} from '../timeline';

describe('computeTimelinePlacements', () => {
  const DAY_START = 8 * 60; // 8:00
  const DAY_END = 20 * 60;  // 20:00
  const GAP = 20;

  it('places a task with startTime at its specified time', () => {
    const tasks = [
      { id: '1', name: 'Meeting', startTime: '10:00', estimateMinutes: 60 },
    ];
    const result = computeTimelinePlacements(tasks, DAY_START, DAY_END, GAP);
    expect(result[0].startMinutes).toBe(600); // 10:00
    expect(result[0].endMinutes).toBe(660);   // 11:00
  });

  it('auto-places tasks without startTime sequentially from day start', () => {
    const tasks = [
      { id: '1', name: 'Task A', startTime: null, estimateMinutes: 60 },
      { id: '2', name: 'Task B', startTime: null, estimateMinutes: 30 },
    ];
    const result = computeTimelinePlacements(tasks, DAY_START, DAY_END, GAP);
    expect(result[0].startMinutes).toBe(DAY_START);       // 8:00
    expect(result[0].endMinutes).toBe(DAY_START + 60);    // 9:00
    expect(result[1].startMinutes).toBe(DAY_START + 60 + GAP); // 9:20
  });

  it('auto-placed tasks avoid fixed-time tasks', () => {
    const tasks = [
      { id: '1', name: 'Fixed', startTime: '08:00', estimateMinutes: 60 },
      { id: '2', name: 'Auto', startTime: null, estimateMinutes: 30 },
    ];
    const result = computeTimelinePlacements(tasks, DAY_START, DAY_END, GAP);
    const auto = result.find(r => r.id === '2')!;
    expect(auto.startMinutes).toBe(DAY_START + 60 + GAP); // after fixed + gap
  });

  it('uses default 30min for tasks without estimate', () => {
    const tasks = [
      { id: '1', name: 'No estimate', startTime: null, estimateMinutes: null },
    ];
    const result = computeTimelinePlacements(tasks, DAY_START, DAY_END, GAP);
    expect(result[0].endMinutes - result[0].startMinutes).toBe(30);
  });
});

describe('computeFreeSlots', () => {
  const DAY_START = 8 * 60;
  const DAY_END = 20 * 60;

  it('returns full day as free when no tasks', () => {
    const result = computeFreeSlots([], DAY_START, DAY_END);
    expect(result).toEqual([{ startMinutes: DAY_START, endMinutes: DAY_END, durationMinutes: 720 }]);
  });

  it('returns gaps between tasks', () => {
    const placements = [
      { id: '1', startMinutes: 480, endMinutes: 540 },  // 8:00-9:00
      { id: '2', startMinutes: 660, endMinutes: 720 },  // 11:00-12:00
    ];
    const result = computeFreeSlots(placements, DAY_START, DAY_END);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ startMinutes: 540, endMinutes: 660, durationMinutes: 120 }); // 9:00-11:00
    expect(result[1]).toEqual({ startMinutes: 720, endMinutes: DAY_END, durationMinutes: 480 }); // 12:00-20:00
  });
});

describe('suggestChips', () => {
  it('returns items that fit in the free slot, sorted by deadline', () => {
    const trayItems = [
      { id: 'a', name: 'Big', estimateMinutes: 240, deadline: '2026-03-20' },
      { id: 'b', name: 'Small', estimateMinutes: 30, deadline: '2026-03-19' },
      { id: 'c', name: 'Medium', estimateMinutes: 60, deadline: '2026-03-18' },
    ];
    const result = suggestChips(trayItems, 120); // 2h free
    expect(result.map(r => r.id)).toEqual(['c', 'b']); // medium first (closest deadline), then small
    // 'Big' excluded (240 > 120)
  });

  it('returns max 3 chips', () => {
    const trayItems = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`, name: `Task ${i}`, estimateMinutes: 15, deadline: '2026-03-20',
    }));
    const result = suggestChips(trayItems, 120);
    expect(result).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/lib/__tests__/timeline.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `timeline.ts`**

Create `web/src/lib/timeline.ts`:

```typescript
export interface TimelineTask {
  id: string;
  name: string;
  startTime: string | null;
  estimateMinutes: number | null;
}

export interface TimelinePlacement {
  id: string;
  startMinutes: number;
  endMinutes: number;
}

export interface FreeSlot {
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

export interface ChipCandidate {
  id: string;
  name: string;
  estimateMinutes: number | null;
  deadline: string | null;
}

const DEFAULT_DURATION = 30;

function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function computeTimelinePlacements(
  tasks: TimelineTask[],
  dayStart: number,
  dayEnd: number,
  gap: number,
): TimelinePlacement[] {
  // First pass: place fixed-time tasks
  const fixed: TimelinePlacement[] = [];
  const auto: TimelineTask[] = [];

  for (const t of tasks) {
    if (t.startTime) {
      const start = parseTime(t.startTime);
      const dur = t.estimateMinutes ?? DEFAULT_DURATION;
      fixed.push({ id: t.id, startMinutes: start, endMinutes: start + dur });
    } else {
      auto.push(t);
    }
  }

  // Sort fixed by start time
  fixed.sort((a, b) => a.startMinutes - b.startMinutes);

  // Second pass: place auto tasks in gaps
  const all = [...fixed];
  let cursor = dayStart;

  for (const t of auto) {
    const dur = t.estimateMinutes ?? DEFAULT_DURATION;
    // Find next available slot after cursor that doesn't overlap fixed
    let start = cursor;
    for (const f of all) {
      if (start < f.endMinutes && start + dur > f.startMinutes) {
        start = f.endMinutes + gap;
      }
    }
    all.push({ id: t.id, startMinutes: start, endMinutes: start + dur });
    cursor = start + dur + gap;
  }

  all.sort((a, b) => a.startMinutes - b.startMinutes);
  return all;
}

export function computeFreeSlots(
  placements: Pick<TimelinePlacement, 'startMinutes' | 'endMinutes'>[],
  dayStart: number,
  dayEnd: number,
): FreeSlot[] {
  const sorted = [...placements].sort((a, b) => a.startMinutes - b.startMinutes);
  const slots: FreeSlot[] = [];
  let cursor = dayStart;

  for (const p of sorted) {
    if (p.startMinutes > cursor) {
      slots.push({
        startMinutes: cursor,
        endMinutes: p.startMinutes,
        durationMinutes: p.startMinutes - cursor,
      });
    }
    cursor = Math.max(cursor, p.endMinutes);
  }

  if (cursor < dayEnd) {
    slots.push({
      startMinutes: cursor,
      endMinutes: dayEnd,
      durationMinutes: dayEnd - cursor,
    });
  }

  return slots;
}

export function suggestChips(
  trayItems: ChipCandidate[],
  freeMinutes: number,
  max = 3,
): ChipCandidate[] {
  return trayItems
    .filter(item => {
      const est = item.estimateMinutes ?? DEFAULT_DURATION;
      return est <= freeMinutes;
    })
    .sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    })
    .slice(0, max);
}

export function formatMinutesAsTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/lib/__tests__/timeline.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/timeline.ts web/src/lib/__tests__/timeline.test.ts
git commit -m "feat(today): add pure timeline placement and free slot logic"
```

---

## Task 2: Feedback Bar Hook (`useFeedbackBar`)

Stateful hook for the "✓ N件 元に戻す" counter. No UI yet.

**Files:**
- Create: `web/src/hooks/useFeedbackBar.ts`
- Reference: Spec section "完了/渡しフィードバック"

- [ ] **Step 1: Write the hook**

Create `web/src/hooks/useFeedbackBar.ts`:

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useFeedbackBar.ts
git commit -m "feat(today): add useFeedbackBar hook for action counter + undo"
```

---

## Task 3: Bottom Sheet Component

The persistent "あとで整理" tray. Touch-driven, CSS transitions, no external deps.

**Files:**
- Create: `web/src/components/today/BottomSheet.tsx`
- Create: `web/src/components/today/BottomSheetItem.tsx`
- Reference: `web/src/components/SwipeBallCard.tsx` (touch handling pattern)

- [ ] **Step 1: Create BottomSheet**

Create `web/src/components/today/BottomSheet.tsx`:

```typescript
import React, { useRef, useState, useCallback } from 'react';

interface BottomSheetProps {
  title: string;
  count: number;
  children: React.ReactNode;
  /** Height of the collapsed peek area (header only) */
  peekHeight?: number;
}

export function BottomSheet({ title, count, children, peekHeight = 56 }: BottomSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
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

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  return (
    <div
      ref={sheetRef}
      className="fixed left-0 right-0 bg-white border-t border-gray-200 transition-transform duration-300 ease-out md:hidden will-change-transform"
      style={{
        bottom: 56, // BottomNav height
        height: '60vh',
        // Use transform instead of height for 60fps animation
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
      <div
        className="flex justify-center pt-2 pb-1 cursor-grab"
        onClick={toggleExpanded}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>

      {/* Header */}
      <div
        className="flex items-center justify-between px-5 pb-3"
        onClick={toggleExpanded}
      >
        <span className="text-[15px] font-semibold text-gray-900">{title}</span>
        <span className="text-sm text-gray-400">{count}件</span>
      </div>

      {/* Content (only visible when expanded) */}
      {expanded && (
        <div className="overflow-y-auto px-5 pb-4" style={{ maxHeight: 'calc(60vh - 80px)' }}>
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create BottomSheetItem**

Create `web/src/components/today/BottomSheetItem.tsx`:

```typescript
import React from 'react';
import { SwipeBallCard } from '../SwipeBallCard';

interface BottomSheetItemProps {
  name: string;
  estimateLabel?: string | null;
  waitingFor?: string | null;    // e.g., "田中" — if set, shows "→ 田中"
  deadlineLabel?: string | null; // e.g., "催促3/20"
  onComplete: () => void;
  onThrow?: () => void;
  onPullBack?: () => void;
  onTap: () => void;
}

export function BottomSheetItem({
  name,
  estimateLabel,
  waitingFor,
  deadlineLabel,
  onComplete,
  onThrow,
  onPullBack,
  onTap,
}: BottomSheetItemProps) {
  return (
    <SwipeBallCard onThrow={onThrow} onPullBack={onPullBack}>
      <div
        className="flex items-center gap-3 py-3 border-b border-gray-100"
        onClick={onTap}
      >
        {/* Dot indicator */}
        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {waitingFor ? (
            <span className="text-sm text-gray-500">
              → {waitingFor}
              {deadlineLabel && (
                <span className="ml-2 text-xs text-gray-400">{deadlineLabel}</span>
              )}
            </span>
          ) : (
            <span className="text-sm text-gray-900 truncate block">{name}</span>
          )}
          {!waitingFor && estimateLabel && (
            <span className="text-xs text-gray-400">{estimateLabel}</span>
          )}
          {waitingFor && (
            <span className="text-sm text-gray-900 truncate block">{name}</span>
          )}
        </div>

        {/* Complete circle (only for non-waiting items) */}
        {!waitingFor && (
          <button
            className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0 hover:border-gray-500 active:bg-gray-900 active:border-gray-900 transition-colors"
            onClick={(e) => { e.stopPropagation(); onComplete(); }}
            aria-label="完了"
          />
        )}
      </div>
    </SwipeBallCard>
  );
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/today/
git commit -m "feat(today): add BottomSheet and BottomSheetItem components"
```

---

## Task 4: DateHeader Component

Large date display, week row, prev/next navigation.

**Files:**
- Create: `web/src/components/today/DateHeader.tsx`
- Reference: Any Planner screenshot, Spec section "ヘッダー / 日付エリア"

- [ ] **Step 1: Create DateHeader**

Create `web/src/components/today/DateHeader.tsx`:

```typescript
import React, { useMemo } from 'react';
import { startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DateHeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_MS = 86400000;

export function DateHeader({ selectedDate, onDateChange }: DateHeaderProps) {
  const today = useMemo(() => new Date(), []);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [selectedDate]);

  const goToday = () => onDateChange(new Date());
  const goPrev = () => onDateChange(new Date(selectedDate.getTime() - DAY_MS));
  const goNext = () => onDateChange(new Date(selectedDate.getTime() + DAY_MS));

  const day = selectedDate.getDate();
  const monthYear = format(selectedDate, 'M月 yyyy', { locale: ja });
  const isToday = isSameDay(selectedDate, today);

  return (
    <div className="px-5 pt-4 pb-2">
      {/* Date + Navigation */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-[44px] font-bold leading-none tracking-tight text-gray-900">
            {day}
          </span>
          <span className="block text-sm text-gray-400 mt-0.5">{monthYear}</span>
        </div>
        <div className="flex items-center gap-1 mt-2">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-full hover:bg-gray-100 active:bg-gray-200"
            aria-label="前日"
          >
            <ChevronLeft size={18} className="text-gray-500" />
          </button>
          <button
            onClick={goToday}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              isToday
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            今日
          </button>
          <button
            onClick={goNext}
            className="p-1.5 rounded-full hover:bg-gray-100 active:bg-gray-200"
            aria-label="翌日"
          >
            <ChevronRight size={18} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Week row */}
      <div className="flex justify-between">
        {weekDays.map((d, i) => {
          const isSelected = isSameDay(d, selectedDate);
          return (
            <button
              key={i}
              className="flex flex-col items-center gap-1 w-10"
              onClick={() => onDateChange(d)}
            >
              <span className="text-[10px] text-gray-400">{DAY_LABELS[i]}</span>
              <span
                className={`text-sm w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                  isSelected
                    ? 'bg-gray-900 text-white font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/today/DateHeader.tsx
git commit -m "feat(today): add DateHeader with large date and week row"
```

---

## Task 5: Timeline Components (TimelineCard, FreeSlot, CurrentTimeLine)

The visual building blocks of the time axis.

**Files:**
- Create: `web/src/components/today/TimelineCard.tsx`
- Create: `web/src/components/today/FreeSlot.tsx`
- Create: `web/src/components/today/CurrentTimeLine.tsx`

- [ ] **Step 1: Create TimelineCard**

Create `web/src/components/today/TimelineCard.tsx`:

```typescript
import React, { useRef } from 'react';
import { SwipeBallCard } from '../SwipeBallCard';
import { formatMinutesAsTime, formatDuration } from '../../lib/timeline';

interface TimelineCardProps {
  name: string;
  startMinutes: number;
  endMinutes: number;
  onComplete: () => void;
  onThrow?: () => void;
  onTap: () => void;
  /** Animate out. 'complete' = shrink, 'pass' = slide right */
  animateOut?: 'complete' | 'pass' | null;
  onAnimationEnd?: () => void;
}

export function TimelineCard({
  name,
  startMinutes,
  endMinutes,
  onComplete,
  onThrow,
  onTap,
  animateOut,
  onAnimationEnd,
}: TimelineCardProps) {
  const duration = endMinutes - startMinutes;
  const timeLabel = `${formatMinutesAsTime(startMinutes)} - ${formatMinutesAsTime(endMinutes)}`;

  const animClass =
    animateOut === 'complete'
      ? 'animate-shrink-out'
      : animateOut === 'pass'
        ? 'animate-slide-right-out'
        : '';

  return (
    <SwipeBallCard onThrow={onThrow}>
      <div
        className={`flex items-center gap-3 ${animClass}`}
        onAnimationEnd={onAnimationEnd}
        onClick={onTap}
      >
        {/* Card body */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-[15px] font-semibold text-gray-900 leading-snug">{name}</p>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {timeLabel}
            <span className="ml-2">{formatDuration(duration)}</span>
          </p>
        </div>

        {/* Complete circle */}
        <button
          className="w-7 h-7 rounded-full border-2 border-gray-300 shrink-0 hover:border-gray-500 active:bg-gray-900 active:border-gray-900 transition-colors"
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          aria-label="完了"
        />
      </div>
    </SwipeBallCard>
  );
}
```

- [ ] **Step 2: Create FreeSlot**

Create `web/src/components/today/FreeSlot.tsx`:

```typescript
import React from 'react';
import { formatDuration } from '../../lib/timeline';
import type { ChipCandidate } from '../../lib/timeline';

interface FreeSlotProps {
  durationMinutes: number;
  chips: ChipCandidate[];
  onChipTap: (item: ChipCandidate) => void;
}

export function FreeSlot({ durationMinutes, chips, onChipTap }: FreeSlotProps) {
  return (
    <div className="py-4 flex flex-col items-center gap-2">
      <span className="text-sm text-gray-400">
        空き {formatDuration(durationMinutes)}
      </span>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {chips.map(chip => (
            <button
              key={chip.id}
              className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 active:bg-gray-300 transition-colors"
              onClick={() => onChipTap(chip)}
            >
              {chip.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create CurrentTimeLine**

Create `web/src/components/today/CurrentTimeLine.tsx`:

```typescript
import React, { useState, useEffect } from 'react';

export function CurrentTimeLine() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const h = now.getHours();
  const m = now.getMinutes();
  const label = `${h}:${m.toString().padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-400 text-gray-900">
        {label}
      </span>
      <div className="flex-1 h-px bg-yellow-400" />
    </div>
  );
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Add CSS animations to global styles**

Find the main CSS file (likely `web/src/index.css` or `web/src/App.css`) and add:

```css
@keyframes shrink-out {
  0% { opacity: 1; transform: scale(1); max-height: 100px; }
  100% { opacity: 0; transform: scale(0.95); max-height: 0; padding: 0; margin: 0; overflow: hidden; }
}
@keyframes slide-right-out {
  0% { opacity: 1; transform: translateX(0); }
  100% { opacity: 0; transform: translateX(100%); max-height: 0; padding: 0; margin: 0; }
}
.animate-shrink-out {
  animation: shrink-out 0.3s ease-out forwards;
}
.animate-slide-right-out {
  animation: slide-right-out 0.3s ease-out forwards;
}
```

- [ ] **Step 6: Commit**

```bash
git add web/src/components/today/ web/src/index.css
git commit -m "feat(today): add TimelineCard, FreeSlot, CurrentTimeLine components"
```

---

## Task 6: FeedbackBar Component

The thin "✓ N件 元に戻す" bar.

**Files:**
- Create: `web/src/components/today/FeedbackBar.tsx`
- Reference: `web/src/hooks/useFeedbackBar.ts`

- [ ] **Step 1: Create FeedbackBar**

Create `web/src/components/today/FeedbackBar.tsx`:

```typescript
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
```

Add to CSS:
```css
@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/today/FeedbackBar.tsx web/src/index.css
git commit -m "feat(today): add FeedbackBar component"
```

---

## Task 7: QuickAddSheet Component

FAB + lightweight add sheet.

**Files:**
- Create: `web/src/components/today/QuickAddSheet.tsx`
- Reference: Any Planner's add screen, Spec "クイック追加" section

- [ ] **Step 1: Create QuickAddSheet**

Create `web/src/components/today/QuickAddSheet.tsx`:

```typescript
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface QuickAddSheetProps {
  onAdd: (title: string, estimateMinutes: number | null, scheduled: boolean) => void;
}

const DURATION_OPTIONS = [
  { label: '15分', value: 15 },
  { label: '30分', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
  { label: '4h', value: 240 },
];

export function QuickAddSheet({ onAdd }: QuickAddSheetProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSubmit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed, estimate, false);
    setTitle('');
    setEstimate(null);
    // Keep sheet open for consecutive adds
  }, [title, estimate, onAdd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setTitle('');
    setEstimate(null);
  }, []);

  return (
    <>
      {/* FAB */}
      <button
        className="fixed w-14 h-14 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform md:hidden"
        style={{ bottom: 124, right: 20, zIndex: 20 }}
        onClick={() => setOpen(true)}
        aria-label="追加"
      >
        <Plus size={24} />
      </button>

      {/* Overlay + Sheet */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/20 md:hidden"
            style={{ zIndex: 50 }}
            onClick={handleClose}
          />
          <div
            className="fixed left-0 right-0 bottom-0 bg-white rounded-t-2xl px-5 pt-4 pb-8 md:hidden"
            style={{ zIndex: 50 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={handleClose} className="p-1">
                <X size={20} className="text-gray-400" />
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-full disabled:opacity-30"
                disabled={!title.trim()}
              >
                保存
              </button>
            </div>

            {/* Title input */}
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="タスク名を入力"
              className="w-full text-lg font-semibold text-gray-900 placeholder-gray-300 outline-none mb-4"
            />

            {/* Duration chips */}
            <div className="mb-2">
              <span className="text-xs text-gray-400 mb-2 block">所要時間</span>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      estimate === opt.value
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                    onClick={() => setEstimate(estimate === opt.value ? null : opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/today/QuickAddSheet.tsx
git commit -m "feat(today): add QuickAddSheet with FAB and duration chips"
```

---

## Task 8: Timeline Orchestrator (`Timeline.tsx`)

Assembles time labels + cards + free slots + current time line.

**Files:**
- Create: `web/src/components/today/Timeline.tsx`
- Reference: `web/src/lib/timeline.ts`, all Task 5 components

- [ ] **Step 1: Create Timeline**

Create `web/src/components/today/Timeline.tsx`:

```typescript
import React, { useMemo, useCallback, useState } from 'react';
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
}

export function Timeline({
  tasks,
  trayItems,
  dayStart,
  dayEnd,
  gap,
  isToday,
  onChipPlace,
}: TimelineProps) {
  const [animatingOut, setAnimatingOut] = useState<Record<string, 'complete' | 'pass'>>({});

  const placements = useMemo(
    () => computeTimelinePlacements(tasks, dayStart, dayEnd, gap),
    [tasks, dayStart, dayEnd, gap],
  );

  const freeSlots = useMemo(
    () => computeFreeSlots(placements, dayStart, dayEnd),
    [placements, dayStart, dayEnd],
  );

  // Build interleaved timeline entries sorted by startMinutes
  const nowMinutes = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
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
    setAnimatingOut(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return (
    <div className="px-5 pb-4">
      {entries.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">
          何もない一日。＋ボタンで追加しましょう
        </div>
      )}

      {entries.map((entry, i) => {
        if (entry.type === 'now') {
          return <CurrentTimeLine key="now" />;
        }

        if (entry.type === 'free') {
          const chips = suggestChips(trayItems, entry.slot.durationMinutes);
          return (
            <FreeSlot
              key={`free-${entry.slot.startMinutes}`}
              durationMinutes={entry.slot.durationMinutes}
              chips={chips}
              onChipTap={(chip) => onChipPlace(chip, entry.slot.startMinutes)}
            />
          );
        }

        const { placement, task } = entry;
        return (
          <div key={task.id} className="flex items-start gap-3 mb-2">
            {/* Time label */}
            <span className="text-xs text-gray-400 w-12 pt-3 text-right shrink-0">
              {formatMinutesAsTime(placement.startMinutes)}
            </span>

            {/* Card */}
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
```

- [ ] **Step 2: Verify compilation**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/today/Timeline.tsx
git commit -m "feat(today): add Timeline orchestrator component"
```

---

## Task 9: TodayView Orchestrator + App.tsx Integration

The top-level component that wires everything together.

**Files:**
- Create: `web/src/components/today/TodayView.tsx`
- Modify: `web/src/App.tsx` — replace mobile section with `<TodayView />`

- [ ] **Step 1: Create TodayView**

Create `web/src/components/today/TodayView.tsx`:

```typescript
import React, { useState, useMemo, useCallback } from 'react';
import { isSameDay, parseISO } from 'date-fns';
import { DateHeader } from './DateHeader';
import { Timeline } from './Timeline';
import { BottomSheet } from './BottomSheet';
import { BottomSheetItem } from './BottomSheetItem';
import { FeedbackBar } from './FeedbackBar';
import { QuickAddSheet } from './QuickAddSheet';
import { useFeedbackBar } from '../../hooks/useFeedbackBar';
import { getEffectiveBallHolder, getTaskAssigneeLabel } from '../../lib/ball';
import { formatDuration, type ChipCandidate } from '../../lib/timeline';
import type { Task } from '../../lib/types';

interface TodayViewProps {
  tasks: Task[];
  currentUserName: string;
  currentUserEmail: string;
  currentUserAliases: Set<string>;
  /** Takes Task object — matches handleComplete(task, true) inside TasksPage */
  onCompleteTask: (task: Task) => void;
  /** Takes Task object — matches handleBallThrow(task) inside TasksPage */
  onThrowBall: (task: Task) => void;
  /** Takes Task object — matches handleBallPullBack(task) inside TasksPage */
  onPullBackBall: (task: Task) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onCreateTask: (title: string, estimateMinutes: number | null) => void;
  /** Takes Task object — matches setEditingTask(task) inside TasksPage */
  onOpenTask: (task: Task) => void;
}

const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
const GAP = 20;

export function TodayView({
  tasks,
  currentUserName,
  currentUserEmail,
  currentUserAliases,
  onCompleteTask,
  onThrowBall,
  onPullBackBall,
  onUpdateTask,
  onCreateTask,
  onOpenTask,
}: TodayViewProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const feedback = useFeedbackBar();

  const isToday = useMemo(
    () => isSameDay(selectedDate, new Date()),
    [selectedDate],
  );

  // Categorize tasks: timeline vs tray
  const { timelineTasks, trayItems } = useMemo(() => {
    const timeline: Task[] = [];
    const tray: Task[] = [];

    for (const task of tasks) {
      if (task.ステータス === '完了') continue;

      const holder = getEffectiveBallHolder(task);
      const isMyBall = !holder || currentUserAliases.has(holder.toLowerCase());
      const assignee = getTaskAssigneeLabel(task);
      const isAssignedToMe = assignee && currentUserAliases.has(assignee.toLowerCase());

      // Check if task has a follow-up date that matches selectedDate
      const followUpToday = task.responseDeadline
        && isSameDay(parseISO(task.responseDeadline), selectedDate);

      if (!isMyBall && !followUpToday) {
        // Not my ball and no follow-up today → tray
        tray.push(task);
        continue;
      }

      // Check if task is scheduled for selected date
      const startDate = task['予定開始日'];
      const dueDate = task['期限'];
      const hasDate = startDate || dueDate;

      if (hasDate) {
        const taskDate = startDate || dueDate;
        if (taskDate && isSameDay(parseISO(taskDate), selectedDate)) {
          timeline.push(task);
        } else if (isMyBall && !startDate && !dueDate) {
          tray.push(task);
        } else {
          // Has date but not today
          // Only show if it spans today
          if (startDate && dueDate) {
            const start = parseISO(startDate);
            const end = parseISO(dueDate);
            if (selectedDate >= start && selectedDate <= end) {
              timeline.push(task);
              continue;
            }
          }
          tray.push(task);
        }
      } else if (isMyBall && isAssignedToMe) {
        // No date, my ball, assigned to me → tray (user decides when)
        tray.push(task);
      } else {
        tray.push(task);
      }
    }

    return { timelineTasks: timeline, trayItems: tray };
  }, [tasks, selectedDate, currentUserAliases]);

  // Transform for Timeline component
  const timelineData = useMemo(() =>
    timelineTasks.map(t => ({
      id: t.id,
      name: t['タスク名'] || '',
      startTime: (t as any).startTime ?? null,
      estimateMinutes: t['工数見積(h)'] ? t['工数見積(h)'] * 60 : null,
      onComplete: () => {
        feedback.push({
          type: 'complete',
          undoFn: () => onUpdateTask(t.id, { ステータス: t.ステータス }),
        });
        onCompleteTask(t);
      },
      onThrow: () => {
        feedback.push({
          type: 'pass',
          undoFn: () => onUpdateTask(t.id, { ballHolder: getEffectiveBallHolder(t) }),
        });
        onThrowBall(t);
      },
      onTap: () => onOpenTask(t),
    })),
    [timelineTasks, onCompleteTask, onThrowBall, onUpdateTask, onOpenTask, feedback],
  );

  // Transform tray items for chip suggestions
  const chipCandidates: ChipCandidate[] = useMemo(() =>
    trayItems
      .filter(t => {
        const holder = getEffectiveBallHolder(t);
        return !holder || currentUserAliases.has(holder.toLowerCase());
      })
      .map(t => ({
        id: t.id,
        name: t['タスク名'] || '',
        estimateMinutes: t['工数見積(h)'] ? t['工数見積(h)'] * 60 : null,
        deadline: t['期限'] ?? null,
      })),
    [trayItems, currentUserAliases],
  );

  const handleChipPlace = useCallback((chip: ChipCandidate, startMinutes: number) => {
    const h = Math.floor(startMinutes / 60);
    const m = startMinutes % 60;
    const startTime = `${h}:${m.toString().padStart(2, '0')}`;
    onUpdateTask(chip.id, { startTime } as any);
  }, [onUpdateTask]);

  const handleQuickAdd = useCallback((title: string, estimateMinutes: number | null) => {
    onCreateTask(title, estimateMinutes);
  }, [onCreateTask]);

  return (
    <div className="flex flex-col h-full md:hidden">
      <DateHeader selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* Scrollable timeline area */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 72 }} // space for bottom sheet peek
      >
        <Timeline
          tasks={timelineData}
          trayItems={chipCandidates}
          dayStart={DAY_START}
          dayEnd={DAY_END}
          gap={GAP}
          isToday={isToday}
          onChipPlace={handleChipPlace}
        />
      </div>

      {/* Bottom sheet */}
      <BottomSheet title="あとで整理" count={trayItems.length}>
        {trayItems.map(task => {
          const holder = getEffectiveBallHolder(task);
          const isMyBall = !holder || currentUserAliases.has(holder.toLowerCase());
          const waitingFor = !isMyBall ? holder : null;
          const estimate = task['工数見積(h)'];

          return (
            <BottomSheetItem
              key={task.id}
              name={task['タスク名'] || ''}
              estimateLabel={estimate ? formatDuration(estimate * 60) : null}
              waitingFor={waitingFor}
              deadlineLabel={
                task.responseDeadline
                  ? `催促${task.responseDeadline.slice(5).replace('-', '/')}`
                  : null
              }
              onComplete={() => onCompleteTask(task.id)}
              onThrow={() => onThrowBall(task.id)}
              onPullBack={!isMyBall ? () => onPullBackBall(task.id) : undefined}
              onTap={() => onOpenTask(task.id)}
            />
          );
        })}
      </BottomSheet>

      {/* Feedback bar */}
      <FeedbackBar state={feedback.state} onUndo={feedback.undoLast} />

      {/* FAB + Quick add */}
      <QuickAddSheet onAdd={handleQuickAdd} />
    </div>
  );
}
```

- [ ] **Step 2: Integrate into App.tsx**

In `web/src/App.tsx`, add import near the top of the file (alongside other component imports):
```typescript
import { TodayView } from './components/today/TodayView';
```

**IMPORTANT:** TodayView is rendered INSIDE TasksPage (not from App.tsx root). Search for the `{/* Mobile layout */}` comment or the `md:hidden` div around L1916.

Replace the mobile `md:hidden` block (approximately L1916-2090) with:
```tsx
{/* Mobile: TodayView */}
<div className="md:hidden h-full">
  <TodayView
    tasks={filteredTasks}
    currentUserName={currentUserName}
    currentUserEmail={currentUserEmail}
    currentUserAliases={currentUserAliases}
    onCompleteTask={(task) => handleComplete(task, true)}
    onThrowBall={(task) => handleBallThrow(task)}
    onPullBackBall={(task) => handleBallPullBack(task)}
    onUpdateTask={(id, updates) => updateTask(id, updates)}
    onCreateTask={(title, est) => {
      // Quick add — creates task with minimal fields
      // Use the same createTask function already available in TasksPage scope
      // Pass projectId from the first available project or leave empty
      createTask({
        タスク名: title,
        '工数見積(h)': est ? est / 60 : undefined,
        ステータス: '未着手',
      });
    }}
    onOpenTask={(task) => setEditingTask(task)}
  />
</div>
```

Verify that `handleComplete`, `handleBallThrow`, `handleBallPullBack`, `createTask`, `updateTask`, `setEditingTask`, `filteredTasks`, `currentUserName`, `currentUserEmail`, `currentUserAliases` are all accessible in the TasksPage scope. They should be — these are internal functions/state of TasksPage.

Keep all existing desktop rendering (`hidden md:block` sections) and ball handler functions unchanged.

- [ ] **Step 3: Remove unused mobile rendering functions**

After integration is working, remove from App.tsx:
- `renderMobileTimelineEntry` (L1610-1682)
- `renderMobileLaterEntry` (L1684-1720)
- `mobileTaskSections` useMemo (L1489-1518)
- `mobileTodayItems` useMemo (L1520-1528)
- `mobileWeekDays` useMemo (L1530-1542)
- `mobileSelectedItems` useMemo (L1544-1558)
- `mobileTimelineItems` useMemo (L1560-1582)
- `mobileFreeSlots` useMemo (L1584-1600)
- `mobileSummary` useMemo (L1602-1608)
- `mobileView` and `mobileSelectedDate` state (L1288-1289)

Also remove the now-unused `showBallUndoToast` (L1722-1754) since feedback is handled by `FeedbackBar`.

- [ ] **Step 4: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Manual test in browser**

Run: `cd web && npm run dev`
Open on mobile viewport (375px width). Verify:
- Date header shows large date, week row works
- Timeline shows tasks at time positions
- Free slots appear between tasks with "空き Xh" text
- Current time yellow line appears (if viewing today)
- ○ tap completes a task with shrink animation
- Right swipe triggers "pass" slide animation
- Bottom sheet peeks at bottom, expands on swipe up
- FAB opens quick add sheet
- Feedback bar appears on 2nd consecutive action

- [ ] **Step 6: Commit**

```bash
git add web/src/components/today/TodayView.tsx web/src/App.tsx
git commit -m "feat(today): integrate TodayView into App.tsx, remove old mobile rendering"
```

---

## Task 10: Conditionally Suppress Toasts on Mobile

The existing `applyBallHolderWithUndo` / `showBallUndoToast` are shared by both desktop and mobile. Desktop still needs toasts. The fix: TodayView handles its own feedback via `FeedbackBar`, and the ball handlers' toasts are suppressed only when called from TodayView.

**Files:**
- Modify: `web/src/App.tsx` — add `silent` parameter to ball handlers

- [ ] **Step 1: Add `silent` option to `applyBallHolderWithUndo`**

Find `applyBallHolderWithUndo` (search by function name, ~L1756). Add an optional `silent?: boolean` parameter. When `silent` is true, skip `pushToast()` and `showBallUndoToast()` calls:

```typescript
const applyBallHolderWithUndo = async (
  task: Task, newHolder: string | null, message: string, silent?: boolean
) => {
  const prev = task.ballHolder ?? null;
  await updateTask(task.id, { ballHolder: newHolder });
  if (!silent) {
    pushToast({ tone: 'success', title: message });
    showBallUndoToast(task, prev);
  }
};
```

Similarly update `handleBallThrow` and `handleBallPullBack` to accept and forward `silent`:
```typescript
const handleBallThrow = (task: Task, silent?: boolean) => { ... applyBallHolderWithUndo(task, ..., silent); };
const handleBallPullBack = (task: Task, silent?: boolean) => { ... applyBallHolderWithUndo(task, ..., silent); };
```

- [ ] **Step 2: Update TodayView integration to pass `silent: true`**

In the TasksPage JSX where TodayView is rendered, update callbacks:
```tsx
onThrowBall={(task) => handleBallThrow(task, true)}
onPullBackBall={(task) => handleBallPullBack(task, true)}
```

Desktop ball operations remain unchanged (no `silent` flag = toasts work as before).

- [ ] **Step 3: Verify build + test both mobile and desktop**

Run: `cd web && npm run build`
Expected: Clean build. Desktop toasts still work. Mobile uses FeedbackBar.

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx
git commit -m "refactor(today): add silent flag to ball handlers for mobile feedback"
```

---

## Task 11: Auto-Scroll to Current Time + Bottom Sheet Empty State

Small but spec-required behaviors.

**Files:**
- Modify: `web/src/components/today/Timeline.tsx` — scroll to now line
- Modify: `web/src/components/today/BottomSheet.tsx` — empty state
- Modify: `web/src/components/today/BottomSheetItem.tsx` — overdue styling

- [ ] **Step 1: Auto-scroll in Timeline**

In `Timeline.tsx`, add a ref for the "now" line and scroll to it on mount:

```typescript
const nowRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (nowRef.current) {
    nowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}, []); // Only on mount
```

Attach `ref={nowRef}` to the `<CurrentTimeLine />` wrapper div.

- [ ] **Step 2: Empty state in BottomSheet**

In `BottomSheet.tsx`, when expanded and `count === 0`, show:
```tsx
{expanded && count === 0 && (
  <p className="text-sm text-gray-400 text-center py-6">
    ＋ボタンで何でも入れておけます
  </p>
)}
```

- [ ] **Step 3: Overdue styling in BottomSheetItem**

Add optional `overdue?: boolean` prop. When true, show name in red:
```tsx
<span className={`text-sm truncate block ${overdue ? 'text-red-500' : 'text-gray-900'}`}>
  {name}
</span>
```

In TodayView, compute overdue: `task['期限'] && parseISO(task['期限']) < new Date()`.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/today/
git commit -m "feat(today): auto-scroll to now line, empty tray state, overdue styling"
```

---

## Post-Implementation Verification

After all tasks are complete:

- [ ] **Full build check**: `cd web && npm run build` — no errors
- [ ] **Test suite**: `cd web && npx vitest run` — all pass
- [ ] **Mobile viewport test** (375px): Complete user flow
  1. Open /tasks → see large date, empty timeline, bottom sheet peek
  2. Add task via FAB → appears in あとで整理
  3. Tap chip in free slot → task moves to timeline
  4. ○ tap to complete → card shrinks, disappears
  5. Right swipe to pass → card slides right, appears in tray as "waiting"
  6. Complete 3 tasks fast → feedback bar shows "✓ 3件 元に戻す"
  7. Tap 元に戻す → last task restored
  8. Previous/next day navigation works
  9. Bottom sheet expands/collapses smoothly
- [ ] **Desktop regression**: Desktop view at /tasks still works (unchanged)
