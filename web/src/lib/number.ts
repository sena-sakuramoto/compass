export function clampToSingleDecimal(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const safeValue = Math.max(0, value);
  return Math.round(safeValue * 10) / 10;
}

export function parseHoursInput(raw: string): number {
  if (!raw) {
    return 0;
  }
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return clampToSingleDecimal(parsed);
}

export const ESTIMATE_HOUR_PRESETS = [0.25, 0.5, 1, 2, 4, 8] as const;

export function formatEstimateHours(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return '未設定';
  }

  if (value < 1) {
    return `${Math.round(value * 60)}分`;
  }

  if (Number.isInteger(value)) {
    return `${value}時間`;
  }

  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  if (minutes === 0) {
    return `${hours}時間`;
  }
  if (hours === 0) {
    return `${minutes}分`;
  }
  return `${hours}時間${minutes}分`;
}
