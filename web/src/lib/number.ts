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
