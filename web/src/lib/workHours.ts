const STORAGE_KEY = 'compass:workHours';

export interface WorkHours {
  startHour: number; // 0-23
  endHour: number;   // 0-23
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
      parsed.startHour < parsed.endHour
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

export function workHoursToMinutes(hours: WorkHours) {
  return {
    dayStart: hours.startHour * 60,
    dayEnd: hours.endHour * 60,
  };
}
