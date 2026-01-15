import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { DangerTaskInfo } from '../../lib/gantt';

interface DangerTasksModalProps {
  tasks: DangerTaskInfo[];
  onClose: () => void;
}

export function DangerTasksModal({ tasks, onClose }: DangerTasksModalProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const dueTodayTasks = tasks.filter((task) => task.daysDiff === 0);
  const otherDangerTasks = tasks.filter((task) => task.daysDiff !== 0);

  const renderTaskCard = (task: DangerTaskInfo) => (
    <div
      key={task.id}
      className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{task.name}</p>
          <p className="text-xs text-slate-500">
            {task.projectName} ・ {task.status}
          </p>
          <p className="mt-1 text-xs text-slate-500">担当: {task.assignee}</p>
        </div>
        <div className="text-right text-sm font-semibold text-rose-600">{task.urgencyLabel}</div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>期限: {task.dueDateLabel}</span>
        {task.daysDiff < 0 ? (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">要対応</span>
        ) : task.daysDiff === 0 ? (
          <span className="rounded-full bg-amber-100/70 px-2 py-0.5 text-amber-700">本日締切</span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">要確認</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">リマインド</p>
            <h3 className="text-lg font-semibold text-slate-900">要注意タスク</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[360px] overflow-y-auto px-6 py-4 space-y-5">
          {dueTodayTasks.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span className="text-slate-900">今日が期限のタスク</span>
                <span>{dueTodayTasks.length}件</span>
              </div>
              <div className="space-y-3">
                {dueTodayTasks.map(renderTaskCard)}
              </div>
            </section>
          )}
          {otherDangerTasks.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span className="text-slate-900">期限が迫っている / 超過タスク</span>
                <span>{otherDangerTasks.length}件</span>
              </div>
              <div className="space-y-3">
                {otherDangerTasks.map(renderTaskCard)}
              </div>
            </section>
          )}
          {tasks.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">危険なタスクはありません。</p>
          )}
        </div>
        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
