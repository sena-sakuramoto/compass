import React from 'react';
import { Users } from 'lucide-react';

interface ProjectCardProps {
  id: string;
  name: string;
  status: string;
  start?: string;
  due?: string;
  progress: number;
  tasks: number;
  priority?: string;
  dueLabel?: string;
  overdue?: boolean;
  openTasks?: number;
  onClick?: () => void;
  onManageMembers?: (e: React.MouseEvent) => void;
}

const statusTone: Record<string, string> = {
  完了: 'bg-emerald-100 text-emerald-700',
  進行中: 'bg-sky-100 text-sky-700',
  未着手: 'bg-slate-100 text-slate-700',
  確認待ち: 'bg-amber-100 text-amber-700',
  保留: 'bg-amber-100 text-amber-700',
  計画中: 'bg-slate-100 text-slate-700',
  見積: 'bg-purple-100 text-purple-700',
  実施中: 'bg-sky-100 text-sky-700',
  設計中: 'bg-sky-100 text-sky-700',
};

const priorityTone: Record<string, string> = {
  高: 'bg-rose-100 text-rose-700',
  中: 'bg-amber-100 text-amber-700',
  低: 'bg-slate-100 text-slate-600',
};

function progressColor(pct: number) {
  if (pct >= 90) return 'bg-emerald-500';
  if (pct >= 60) return 'bg-sky-500';
  if (pct >= 30) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function ProjectCard({
  name,
  status,
  start,
  due,
  progress,
  tasks,
  priority,
  dueLabel,
  overdue,
  openTasks,
  onClick,
  onManageMembers,
}: ProjectCardProps) {
  const pct = Math.round(progress * 100);
  const statusClass = statusTone[status] ?? 'bg-slate-100 text-slate-600';
  const priorityClass = priority ? priorityTone[priority] ?? 'bg-slate-100 text-slate-600' : '';

  return (
    <div 
      className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClass}`}>{status || 'ステータス未設定'}</span>
        {priority ? (
          <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${priorityClass}`}>優先度: {priority}</span>
        ) : null}
      </div>
      <div>
        <div className="line-clamp-2 text-base font-semibold text-slate-900" title={name}>
          {name}
        </div>
        {dueLabel ? (
          <div className={`mt-1 text-xs ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>{dueLabel}</div>
        ) : null}
      </div>
      <div className="space-y-2 text-xs text-slate-500">
        <div className="flex items-center justify-between">
          <span>{start || '未設定'}</span>
          <span>{due || '未設定'}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-2 rounded-full ${progressColor(pct)}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>進捗 {pct}%</span>
          <span>タスク {tasks}</span>
        </div>
        {typeof openTasks === 'number' ? (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>未完了 {openTasks}</span>
            <span>完了 {Math.max(tasks - openTasks, 0)}</span>
          </div>
        ) : null}
      </div>
      {onManageMembers && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onManageMembers(e);
          }}
          className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <Users className="w-4 h-4" />
          メンバー管理
        </button>
      )}
    </div>
  );
}
