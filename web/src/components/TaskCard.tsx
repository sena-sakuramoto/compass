import { BellRing, CalendarPlus, CheckCircle2 } from 'lucide-react';
import React from 'react';
import { STATUS_PROGRESS } from '../lib/constants';

interface TaskCardProps {
  id: string;
  name: string;
  projectLabel: string;
  assignee: string;
  schedule: string;
  status: string;
  progress?: number;
  onComplete(): void;
  onSeedReminders?(): void;
  onCalendarSync?(): void;
  seedBusy?: boolean;
  calendarBusy?: boolean;
}

export function TaskCard({
  name,
  projectLabel,
  assignee,
  schedule,
  progress,
  status,
  onComplete,
  onSeedReminders,
  onCalendarSync,
  seedBusy,
  calendarBusy,
}: TaskCardProps) {
  const pct = Math.round(computeProgress(progress, status) * 100);
  const handleClick = () => onComplete();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-slate-800">
          {name}
        </div>
        <button
          type="button"
          className="text-slate-600 transition hover:text-slate-900"
          onClick={handleClick}
          title="完了にする"
        >
          <CheckCircle2 className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-1 text-xs text-slate-600">
        {projectLabel} · {assignee || '未設定'}
      </div>
      <div className="mt-1 text-xs text-slate-500">{schedule}</div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-slate-800" style={{ width: `${pct}%` }} />
      </div>
      {(onSeedReminders || onCalendarSync) ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {onSeedReminders ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
              onClick={onSeedReminders}
              disabled={seedBusy}
            >
              <BellRing className="h-3.5 w-3.5" /> 通知
            </button>
          ) : null}
          {onCalendarSync ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
              onClick={onCalendarSync}
              disabled={calendarBusy}
            >
              <CalendarPlus className="h-3.5 w-3.5" /> カレンダー
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function computeProgress(progress?: number, status?: string) {
  if (typeof progress === 'number' && !Number.isNaN(progress)) {
    return Math.min(1, Math.max(0, progress));
  }
  if (!status) return 0;
  return STATUS_PROGRESS[status] ?? 0;
}
