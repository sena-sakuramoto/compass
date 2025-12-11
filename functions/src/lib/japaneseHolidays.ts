import { db, FieldValue } from './firestore';

const HOLIDAY_SOURCE_URL = 'https://holidays-jp.github.io/api/v1/date.json';
const CACHE_COLLECTION = 'system';
const CACHE_DOC_ID = 'japanese_holidays';
const MEMORY_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const PERSISTED_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export interface JapaneseHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

interface HolidayCache {
  holidays: JapaneseHoliday[];
  updatedAt: number;
  sourceUpdatedAt?: string;
}

let memoryCache: HolidayCache | null = null;

function normalizeDate(date: string): string {
  if (!date) return '';
  return date.replace(/\./g, '-').replace(/\//g, '-');
}

async function downloadHolidays(): Promise<HolidayCache> {
  const response = await fetch(HOLIDAY_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download holiday list: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, string>;
  const holidays: JapaneseHoliday[] = Object.entries(data)
    .map(([date, name]) => ({
      date: normalizeDate(date),
      name: name.trim(),
    }))
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const sourceUpdatedAt =
    response.headers.get('last-modified') ?? new Date().toISOString();

  return {
    holidays,
    updatedAt: Date.now(),
    sourceUpdatedAt,
  };
}

async function loadFromFirestore(): Promise<HolidayCache | null> {
  const docRef = db.collection(CACHE_COLLECTION).doc(CACHE_DOC_ID);
  const snapshot = await docRef.get();
  if (!snapshot.exists) return null;

  const data = snapshot.data();
  if (!data?.holidays) return null;

  const fetchedAtTimestamp = data.fetchedAt?.toDate?.() ?? null;
  const fetchedAtMs = fetchedAtTimestamp?.getTime();
  if (!fetchedAtMs) return null;

  return {
    holidays: data.holidays as JapaneseHoliday[],
    updatedAt: fetchedAtMs,
    sourceUpdatedAt: data.sourceUpdatedAt,
  };
}

async function persistToFirestore(cache: HolidayCache): Promise<void> {
  const docRef = db.collection(CACHE_COLLECTION).doc(CACHE_DOC_ID);
  await docRef.set(
    {
      holidays: cache.holidays,
      fetchedAt: FieldValue.serverTimestamp(),
      sourceUpdatedAt: cache.sourceUpdatedAt,
    },
    { merge: true }
  );
}

export async function getJapaneseHolidays(forceRefresh = false): Promise<HolidayCache> {
  const now = Date.now();

  if (
    !forceRefresh &&
    memoryCache &&
    now - memoryCache.updatedAt < MEMORY_CACHE_TTL_MS
  ) {
    return memoryCache;
  }

  if (!forceRefresh) {
    try {
      const persisted = await loadFromFirestore();
      if (persisted && now - persisted.updatedAt < PERSISTED_CACHE_TTL_MS) {
        memoryCache = persisted;
        return persisted;
      }
    } catch (error) {
      console.warn('[Holidays] Failed to load cache from Firestore:', error);
    }
  }

  const fresh = await downloadHolidays();
  memoryCache = fresh;
  try {
    await persistToFirestore(fresh);
  } catch (error) {
    console.warn('[Holidays] Failed to persist cache:', error);
  }
  return fresh;
}
