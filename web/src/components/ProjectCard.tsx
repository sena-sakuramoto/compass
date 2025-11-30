import React from 'react';
import { FolderOpen, ExternalLink, Users2, Briefcase, Pencil, HardHat, Banknote, Building2 } from 'lucide-react';

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
  folderUrl?: string;
  施工費?: number;
  クライアント?: string;
  営業?: string;
  PM?: string;
  設計?: string;
  施工管理?: string;
  onClick?: () => void;
}

const statusTone: Record<string, string> = {
  完了: 'bg-slate-200 text-slate-700',
  進行中: 'bg-slate-200 text-slate-700',
  未着手: 'bg-slate-100 text-slate-600',
  確認待ち: 'bg-slate-200 text-slate-700',
  保留: 'bg-slate-100 text-slate-600',
  計画中: 'bg-slate-100 text-slate-600',
  見積: 'bg-slate-200 text-slate-700',
  実施中: 'bg-slate-200 text-slate-700',
  設計中: 'bg-slate-200 text-slate-700',
};

const priorityTone: Record<string, string> = {
  高: 'bg-rose-100 text-rose-700',
  中: 'bg-slate-100 text-slate-600',
  低: 'bg-slate-50 text-slate-500',
};

function progressColor(pct: number) {
  return 'bg-slate-700';
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
  folderUrl,
  施工費,
  クライアント,
  営業,
  PM,
  設計,
  施工管理,
  onClick,
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

      {/* 施工費 */}
      {施工費 !== undefined && 施工費 !== null && (
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">
          <Banknote className="w-4 h-4 text-slate-500" />
          <span>{施工費.toLocaleString()}円</span>
        </div>
      )}

      {/* クライアント */}
      {クライアント && (
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">
          <Building2 className="w-4 h-4 text-slate-500" />
          <span>{クライアント}</span>
        </div>
      )}

      {/* メンバー情報 */}
      {(営業 || PM || 設計 || 施工管理) && (
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          {営業 && (
            <div className="flex items-center gap-1 truncate">
              <Briefcase className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">営業：{営業}</span>
            </div>
          )}
          {PM && (
            <div className="flex items-center gap-1 truncate">
              <Users2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">PM：{PM}</span>
            </div>
          )}
          {設計 && (
            <div className="flex items-center gap-1 truncate">
              <Pencil className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">設計：{設計}</span>
            </div>
          )}
          {施工管理 && (
            <div className="flex items-center gap-1 truncate">
              <HardHat className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">施工管理：{施工管理}</span>
            </div>
          )}
        </div>
      )}

      {folderUrl && (
        <a
          href={folderUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          フォルダを開く
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}
