import React from 'react';
import { BellRing, CalendarPlus } from 'lucide-react';
import { computeProgress } from './TaskCard';

export interface TaskTableRow {
  id: string;
  name: string;
  projectLabel: string;
  assignee: string;
  schedule: string;
  effort: string;
  priority: string;
  status: string;
  progress?: number;
}

interface TaskTableProps {
  rows: TaskTableRow[];
  onToggle(id: string, checked: boolean): void;
  onSeedReminders?(id: string): Promise<void> | void;
  onCalendarSync?(id: string): Promise<void> | void;
  seedBusyIds?: ReadonlySet<string>;
  calendarBusyIds?: ReadonlySet<string>;
}

export function TaskTable({ rows, onToggle, onSeedReminders, onCalendarSync, seedBusyIds, calendarBusyIds }: TaskTableProps) {
  const showActions = Boolean(onSeedReminders || onCalendarSync);
  return (
    <div className="overflow-auto rounded-2xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="p-3 text-left">完了</th>
            <th className="p-3 text-left">タスク名</th>
            <th className="p-3 text-left">プロジェクト</th>
            <th className="p-3 text-left">担当者</th>
            <th className="p-3 text-left">予定</th>
            <th className="p-3 text-left">工数(h)</th>
            <th className="p-3 text-left">進捗</th>
            <th className="p-3 text-left">優先度</th>
            <th className="p-3 text-left">ステータス</th>
            {showActions ? <th className="p-3 text-left">通知/同期</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct = Math.round(computeProgress(row.progress, row.status) * 100);
            return (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="p-3">
                  <input
                    type="checkbox"
                    onChange={(e) => onToggle(row.id, e.currentTarget.checked)}
                    aria-label="完了にする"
                  />
                </td>
                <td className="p-3 font-medium text-slate-800">{row.name}</td>
                <td className="p-3 text-slate-600">{row.projectLabel}</td>
                <td className="p-3 text-slate-600">{row.assignee || '未設定'}</td>
                <td className="p-3 text-slate-600">{row.schedule}</td>
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
