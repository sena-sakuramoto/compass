const STORAGE_KEY = 'compass:workHours';

export interface WorkHours {
  startHour: number; // 0-23
  endHour: number;   // 0-23  (can be < startHour for overnight, e.g. 22:00-6:00)
}

const DEFAULT: WorkHours = { startHour: 8, endHour: 20 };

export function getWorkHours(): WorkHours {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.startHour === 'number' &&
      typeof parsed.endHour === 'number' &&
      parsed.startHour >= 0 && parsed.startHour <= 23 &&
      parsed.endHour >= 0 && parsed.endHour <= 23 &&
      parsed.startHour !== parsed.endHour
    ) {
      return parsed;
    }
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setWorkHours(hours: WorkHours): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hours));
}

/**
 * Convert work hours to timeline minutes.
 * For overnight shifts (e.g. 22:00-6:00), endMinutes wraps past 24h
 * so the timeline renders continuously (e.g. 1320 → 1800 = 22:00 → 30:00).
 */
export function workHoursToMinutes(hours: WorkHours) {
  const start = hours.startHour * 60;
  let end = hours.endHour * 60;
  if (end <= start) {
    end += 24 * 60; // wrap past midnight
  }
  return { dayStart: start, dayEnd: end };
}

/**
 * Total working minutes in a day.
 */
export function totalWorkMinutes(hours: WorkHours): number {
  const { dayStart, dayEnd } = workHoursToMinutes(hours);
  return dayEnd - dayStart;
}
