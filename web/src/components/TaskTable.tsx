import React from 'react';
import { BellRing, CalendarPlus, Trash2 } from 'lucide-react';
import { computeProgress } from './TaskCard';
import { useJapaneseHolidaySet, isJapaneseHoliday } from '../lib/japaneseHolidays';
import { formatJapaneseEra } from '../lib/date';

export interface TaskTableRow {
  id: string;
  name: string;
  projectLabel: string;
  assignee: string;
  schedule: string;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  effort: string;
  priority: string;
  status: string;
  progress?: number;
}

export type TaskTableSortKey =
  | 'completed'
  | 'name'
  | 'project'
  | 'assignee'
  | 'schedule'
  | 'effort'
  | 'progress'
  | 'priority'
  | 'status';

export type TaskTableSortDirection = 'asc' | 'desc';

interface TaskTableProps {
  rows: TaskTableRow[];
  onToggle(id: string, checked: boolean): void;
  onRowClick?(id: string): void;
  onDelete?(id: string): void;
  onSeedReminders?(id: string): Promise<void> | void;
  onCalendarSync?(id: string): Promise<void> | void;
  seedBusyIds?: ReadonlySet<string>;
  calendarBusyIds?: ReadonlySet<string>;
  sortKey?: TaskTableSortKey;
  sortDirection?: TaskTableSortDirection;
  onSortChange?(key: TaskTableSortKey, direction: TaskTableSortDirection): void;
}

export function TaskTable({
  rows,
  onToggle,
  onRowClick,
  onDelete,
  onSeedReminders,
  onCalendarSync,
  seedBusyIds,
  calendarBusyIds,
  sortKey = 'status',
  sortDirection = 'asc',
  onSortChange,
}: TaskTableProps) {
  const holidaySet = useJapaneseHolidaySet();
  const showActions = Boolean(onSeedReminders || onCalendarSync || onDelete);
  const renderSortButton = (key: TaskTableSortKey, label: string) => {
    const active = sortKey === key;
    const nextDirection = active && sortDirection === 'asc' ? 'desc' : 'asc';
    return (
      <button
        type="button"
        onClick={() => onSortChange?.(key, nextDirection)}
        className={`inline-flex items-center gap-1 text-left text-xs font-semibold transition ${
          active ? 'text-slate-900' : 'text-slate-600 hover:text-slate-800'
        }`}
      >
        <span>{label}</span>
        {active ? <span>{sortDirection === 'asc' ? '▲' : '▼'}</span> : <span className="text-slate-300">▲</span>}
      </button>
    );
  };
  return (
    <div className="overflow-auto rounded-2xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="p-3 text-left">{renderSortButton('completed', '完了')}</th>
            <th className="p-3 text-left">{renderSortButton('name', 'タスク名')}</th>
            <th className="p-3 text-left">{renderSortButton('project', 'プロジェクト')}</th>
            <th className="p-3 text-left">{renderSortButton('assignee', '担当者')}</th>
            <th className="p-3 text-left">{renderSortButton('schedule', '予定')}</th>
            <th className="p-3 text-left">{renderSortButton('effort', '工数(h)')}</th>
            <th className="p-3 text-left">{renderSortButton('progress', '進捗')}</th>
            <th className="p-3 text-left">{renderSortButton('priority', '優先度')}</th>
            <th className="p-3 text-left">{renderSortButton('status', 'ステータス')}</th>
            {showActions ? <th className="p-3 text-left">操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct = Math.round(computeProgress(row.progress, row.status) * 100);
            return (
              <tr
                key={row.id}
                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={(e) => {
                  // チェックボックスやボタンをクリックした場合は行クリックイベントを発火しない
                  if (
                    e.target instanceof HTMLInputElement ||
                    e.target instanceof HTMLButtonElement ||
                    (e.target as HTMLElement).closest('button')
                  ) {
                    return;
                  }
                  onRowClick?.(row.id);
                }}
              >
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={row.status === '完了'}
                    onChange={(e) => onToggle(row.id, e.currentTarget.checked)}
                    aria-label="完了にする"
                  />
                </td>
                <td className="p-3 font-medium text-slate-800">{row.name}</td>
                <td className="p-3 text-slate-600">{row.projectLabel}</td>
                <td className="p-3 text-slate-600">{row.assignee || '未設定'}</td>
                <td className="p-3 text-slate-600">
                  <div className="flex flex-col gap-1">
                    <span>{row.schedule}</span>
                    {(row.scheduleEnd || row.scheduleStart) && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        {row.scheduleEnd && isJapaneseHoliday(row.scheduleEnd, holidaySet) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                            祝日
                          </span>
                        )}
                        {row.scheduleEnd && (
                          <span>和暦 {formatJapaneseEra(row.scheduleEnd)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-3 text-slate-600">{row.effort}</td>
                <td className="p-3">
                  <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-slate-800" style={{ width: `${pct}%` }} />
                  </div>
                </td>
                <td className="p-3 text-slate-600">{row.priority}</td>
                <td className="p-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{row.status}</span>
                </td>
                {showActions ? (
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {onSeedReminders ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                          onClick={() => onSeedReminders(row.id)}
                          disabled={seedBusyIds?.has(row.id)}
                          title="通知ジョブを再生成"
                        >
                          <BellRing className="h-3.5 w-3.5" /> 通知
                        </button>
                      ) : null}
                      {onCalendarSync ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                          onClick={() => onCalendarSync(row.id)}
                          disabled={calendarBusyIds?.has(row.id)}
                          title="Google カレンダーに同期"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" /> カレンダー
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-2.5 py-1 text-xs text-rose-600 transition hover:bg-rose-50"
                          onClick={() => onDelete(row.id)}
                          title="タスクを削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> 削除
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
