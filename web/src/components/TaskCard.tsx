import { BellRing, CalendarPlus, CheckCircle2, Trash2 } from 'lucide-react';
import React from 'react';
import { useJapaneseHolidaySet, isJapaneseHoliday } from '../lib/japaneseHolidays';
import { formatJapaneseEra } from '../lib/date';
import { STATUS_PROGRESS } from '../lib/constants';

interface TaskCardProps {
  id: string;
  name: string;
  projectLabel: string;
  assignee: string;
  schedule: string;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  status: string;
  progress?: number;
  stageName?: string;  // 工程名
  onComplete(): void;
  onDelete?(): void;
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
  scheduleStart,
  scheduleEnd,
  progress,
  status,
  stageName,
  onComplete,
  onDelete,
  onSeedReminders,
  onCalendarSync,
  seedBusy,
  calendarBusy,
}: TaskCardProps) {
  const holidaySet = useJapaneseHolidaySet();
  const isHoliday = scheduleEnd ? isJapaneseHoliday(scheduleEnd, holidaySet) : false;
  const japaneseEra = scheduleEnd ? formatJapaneseEra(scheduleEnd) : '';
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
        {stageName && (
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
            {stageName}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <span>{schedule}</span>
        {isHoliday && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
            祝日
          </span>
        )}
        {japaneseEra && (
          <span className="text-[11px] text-slate-400">（和暦 {japaneseEra}）</span>
        )}
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-slate-800" style={{ width: `${pct}%` }} />
      </div>
      {(onSeedReminders || onCalendarSync || onDelete) ? (
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
          {onDelete ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-2.5 py-1 text-rose-600 transition hover:bg-rose-50"
              onClick={onDelete}
              title="タスクを削除"
            >
              <Trash2 className="h-3.5 w-3.5" /> 削除
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
