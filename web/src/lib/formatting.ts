import { format } from 'date-fns';
import type { DateRange, WorkloadScale } from './workload';

export function formatHours(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
}

export function formatCurrency(value: number): string {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

export function formatPeriodLabel(range: DateRange, scale: WorkloadScale): string {
  if (scale === 'week') {
    return `${format(range.start, 'M/d')} 〜 ${format(range.end, 'M/d')}`;
  }
  if (scale === 'month') {
    return format(range.start, 'yyyy年M月');
  }
  return format(range.start, 'yyyy年');
}

export function escapeCsvValue(value: string): string {
  const normalized = value ?? '';
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export function downloadCsv(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
