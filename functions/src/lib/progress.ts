export const STATUS_PROGRESS: Record<string, number> = {
  '未着手': 0,
  '進行中': 0.5,
  '確認待ち': 0.6,
  '保留': 0.2,
  '完了': 1,
};

export interface TaskProgressInput {
  projectId: string;
  タスク名: string;
  担当者?: string | null;
  assignee?: string | null;
  優先度?: string | null;
  ステータス: string;
  予定開始日?: string | null;
  期限?: string | null;
  実績開始日?: string | null;
  実績完了日?: string | null;
  start?: string | null;
  end?: string | null;
  ['工数見積(h)']?: number | null;
  ['工数実績(h)']?: number | null;
  progress?: number | null;
}

export interface DerivedTaskFields {
  progress: number;
  start: string | null;
  end: string | null;
  duration_days: number;
  assignee: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  const result = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(result) ? result : 0;
}

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function deriveTaskFields(input: TaskProgressInput): DerivedTaskFields {
  const estimate = toNumber(input['工数見積(h)']);
  const actual = toNumber(input['工数実績(h)']);

  let progress = typeof input.progress === 'number' ? input.progress : undefined;
  if (estimate > 0 && actual >= 0) {
    progress = Math.max(0, Math.min(1, actual / estimate));
  }
  if (progress == null || Number.isNaN(progress)) {
    progress = STATUS_PROGRESS[input.ステータス] ?? 0;
  }
  progress = Math.max(0, Math.min(1, progress));

  const startCandidate = input.start ?? input.予定開始日 ?? input.実績開始日 ?? null;
  const endCandidate = input.end ?? input.期限 ?? input.実績完了日 ?? null;

  const startDate = toDate(startCandidate);
  const endDate = toDate(endCandidate) ?? startDate;

  let duration = 0;
  if (startDate && endDate) {
    duration = Math.max(0, Math.ceil((endDate.getTime() - startDate.getTime()) / DAY_MS));
  }

  const assignee = input.assignee ?? input.担当者 ?? null;

  return {
    progress,
    start: formatDate(startDate),
    end: formatDate(endDate),
    duration_days: duration,
    assignee,
  };
}
