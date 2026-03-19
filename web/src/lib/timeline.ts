// Pure timeline placement and free slot logic for the "today" view.

export interface TimelineTask {
  id: string;
  name: string;
  startTime: string | null; // "HH:MM" format
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

/** Parse "HH:MM" string to total minutes from midnight. */
function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Place tasks on a timeline within [dayStart, dayEnd].
 *
 * - Tasks with `startTime` are placed at their specified time.
 * - Tasks without `startTime` are auto-placed sequentially starting from
 *   `dayStart`, skipping over any fixed-time task blocks (with `gap` minutes
 *   of breathing room between consecutive placements).
 */
export function computeTimelinePlacements(
  tasks: TimelineTask[],
  dayStart: number,
  dayEnd: number,
  gap: number,
): TimelinePlacement[] {
  const DEFAULT_DUR = DEFAULT_DURATION;

  // Split into fixed and auto groups (preserve original order for auto).
  const fixed: TimelinePlacement[] = [];
  const autoTasks: TimelineTask[] = [];

  for (const task of tasks) {
    if (task.startTime !== null) {
      const start = parseTime(task.startTime);
      const duration = task.estimateMinutes ?? DEFAULT_DUR;
      fixed.push({ id: task.id, startMinutes: start, endMinutes: start + duration });
    } else {
      autoTasks.push(task);
    }
  }

  // Sort fixed placements by start time so we can skip over them.
  const sortedFixed = [...fixed].sort((a, b) => a.startMinutes - b.startMinutes);

  // Auto-place tasks sequentially, advancing a cursor past any overlapping fixed blocks.
  let cursor = dayStart;
  const auto: TimelinePlacement[] = [];

  for (const task of autoTasks) {
    const duration = task.estimateMinutes ?? DEFAULT_DUR;

    // Advance cursor past any fixed tasks that overlap the candidate [cursor, cursor+duration].
    let advanced = true;
    while (advanced) {
      advanced = false;
      for (const fp of sortedFixed) {
        // If the fixed task starts before cursor+duration and ends after cursor,
        // there is an overlap — push cursor past the fixed task end + gap.
        if (fp.startMinutes < cursor + duration && fp.endMinutes > cursor) {
          cursor = fp.endMinutes + gap;
          advanced = true;
          break; // restart the check after moving cursor
        }
      }
    }

    const start = cursor;
    const end = start + duration;
    auto.push({ id: task.id, startMinutes: start, endMinutes: end });
    cursor = end + gap;
  }

  // Merge fixed and auto, preserving original task order.
  const placementMap = new Map<string, TimelinePlacement>();
  for (const p of [...fixed, ...auto]) {
    placementMap.set(p.id, p);
  }

  // Clamp endMinutes to dayEnd so one huge task doesn't eat the whole timeline
  return tasks
    .map(t => placementMap.get(t.id))
    .filter((p): p is TimelinePlacement => p !== undefined)
    .map(p => ({
      ...p,
      endMinutes: Math.min(p.endMinutes, dayEnd),
    }));
}

/**
 * Compute free (unoccupied) slots within [dayStart, dayEnd] given a list of
 * placements. Only slots with positive duration are returned.
 */
export function computeFreeSlots(
  placements: TimelinePlacement[],
  dayStart: number,
  dayEnd: number,
): FreeSlot[] {
  if (placements.length === 0) {
    return [{ startMinutes: dayStart, endMinutes: dayEnd, durationMinutes: dayEnd - dayStart }];
  }

  // Sort placements by start time.
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
    // Advance cursor to the end of this placement (never go backwards).
    if (p.endMinutes > cursor) {
      cursor = p.endMinutes;
    }
  }

  // Trailing free time.
  if (cursor < dayEnd) {
    slots.push({
      startMinutes: cursor,
      endMinutes: dayEnd,
      durationMinutes: dayEnd - cursor,
    });
  }

  return slots;
}

/**
 * Suggest tray items that fit within `freeMinutes`, sorted by deadline
 * (closest first; items with no deadline go last). Returns at most `max` items.
 */
export function suggestChips(
  trayItems: ChipCandidate[],
  freeMinutes: number,
  max = 3,
): ChipCandidate[] {
  const fitting = trayItems.filter(
    item => (item.estimateMinutes ?? DEFAULT_DURATION) <= freeMinutes,
  );

  fitting.sort((a, b) => {
    if (a.deadline === null && b.deadline === null) return 0;
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline.localeCompare(b.deadline);
  });

  return fitting.slice(0, max);
}

/** Format total minutes as "HH:MM" (zero-padded hours). */
export function formatMinutesAsTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format a duration in minutes as a Japanese string e.g. "30分" or "1時間30分". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}
