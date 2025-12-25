import { useEffect, useState } from 'react';
import { listJapaneseHolidays, type JapaneseHoliday } from './api';
import { getCachedIdToken } from './authToken';
import { formatDate, parseDate } from './date';

type HolidaySet = Set<string>;

interface CacheEntry {
  set: HolidaySet;
  fetchedAt: number;
}

const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
let cached: CacheEntry | null = null;
let pendingPromise: Promise<void> | null = null;

function normalizeDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const parsed = parseDate(value);
  if (!parsed) return null;
  return formatDate(parsed);
}

async function ensureCache(): Promise<void> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return;
  }
  const token = await getCachedIdToken();
  if (!token) {
    return;
  }
  if (!pendingPromise) {
    pendingPromise = listJapaneseHolidays()
      .then(({ holidays }) => {
        const set: HolidaySet = new Set(
          holidays.map((holiday: JapaneseHoliday) => holiday.date)
        );
        cached = {
          set,
          fetchedAt: Date.now(),
        };
      })
      .finally(() => {
        pendingPromise = null;
      });
  }
  return pendingPromise;
}

export function useJapaneseHolidaySet(enabled: boolean = true): HolidaySet | null {
  const [holidaySet, setHolidaySet] = useState<HolidaySet | null>(
    cached?.set ?? null
  );

  useEffect(() => {
    if (!enabled) {
      setHolidaySet(null);
      return;
    }
    let mounted = true;
    ensureCache()
      .then(() => {
        if (mounted && cached) {
          setHolidaySet(cached.set);
        }
      })
      .catch((error) => {
        console.error('Failed to load Japanese holidays:', error);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return holidaySet;
}

export function isJapaneseHoliday(date: string | Date | null | undefined, holidaySet?: HolidaySet | null): boolean {
  if (!holidaySet) return false;
  const normalized = normalizeDate(date);
  if (!normalized) return false;
  return holidaySet.has(normalized);
}
