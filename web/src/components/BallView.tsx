import { useMemo, useState } from 'react';
import type { Project, Task } from '../lib/types';

interface BallViewProps {
  tasks: Task[];
  projects: Project[];
  currentUserName: string;
  onTaskClick: (task: Task) => void;
}

type BallFilter = 'mine' | 'waiting' | 'all';

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function BallView({ tasks, projects, currentUserName, onTaskClick }: BallViewProps) {
  const [filter, setFilter] = useState<BallFilter>('mine');
  const normalizedCurrentUser = normalizeText(currentUserName).toLowerCase();

  const categorized = useMemo(() => {
    const activeTasks = tasks.filter((task) => task.ステータス !== '完了' && task.type !== 'stage');
    const mine: Task[] = [];
    const waiting: Task[] = [];
    const all = [...activeTasks];

    const isCurrentUser = (name: string) => normalizeText(name).toLowerCase() === normalizedCurrentUser;
    const sortByDeadline = (a: Task, b: Task) => {
      const deadlineA = a.responseDeadline || a.期限 || '9999-12-31';
      const deadlineB = b.responseDeadline || b.期限 || '9999-12-31';
      return deadlineA.localeCompare(deadlineB);
    };

    for (const task of activeTasks) {
      const holder = normalizeText(task.ballHolder);
      const assignee = normalizeText(task.assignee || task.担当者);
      const effectiveHolder = holder || assignee;

      if (effectiveHolder && isCurrentUser(effectiveHolder)) {
        mine.push(task);
      } else if (assignee && isCurrentUser(assignee) && holder && !isCurrentUser(holder)) {
        waiting.push(task);
      }
    }

    mine.sort(sortByDeadline);
    waiting.sort(sortByDeadline);
    all.sort(sortByDeadline);
    return { mine, waiting, all };
  }, [normalizedCurrentUser, tasks]);

  const filteredTasks = filter === 'mine' ? categorized.mine : filter === 'waiting' ? categorized.waiting : categorized.all;

  const getProjectName = (projectId: string) => projects.find((project) => project.id === projectId)?.物件名 || '';

  const getDeadlineColor = (deadline?: string | null) => {
    if (!deadline) return 'text-slate-300';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limit = new Date(`${deadline}T00:00:00`);
    const diffDays = Math.ceil((limit.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'text-red-600 font-bold';
    if (diffDays <= 1) return 'text-slate-900 font-semibold';
    if (diffDays <= 3) return 'text-slate-700';
    return 'text-slate-400';
  };

  const getHolderLabel = (task: Task) => {
    const holder = normalizeText(task.ballHolder);
    const assignee = normalizeText(task.assignee || task.担当者);
    const effectiveHolder = holder || assignee;
    if (!effectiveHolder) return '未設定';
    if (normalizedCurrentUser && effectiveHolder.toLowerCase() === normalizedCurrentUser) return '自分';
    return effectiveHolder;
  };

  return (
    <div className="mx-auto max-w-lg px-1 py-4">
      <div className="mb-4 grid grid-cols-3 gap-2">
        {([
          { key: 'mine', label: '自分ボール', count: categorized.mine.length },
          { key: 'waiting', label: '相手ボール', count: categorized.waiting.length },
          { key: 'all', label: 'すべて', count: categorized.all.length },
        ] as const).map((option) => (
          <button
            key={option.key}
            onClick={() => setFilter(option.key)}
            className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
              filter === option.key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {option.label}
            <span className="ml-1 text-xs opacity-70">({option.count})</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filteredTasks.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">該当するゴールはありません</p>
        )}
        {filteredTasks.map((task) => (
          <button
            key={task.id}
            onClick={() => onTaskClick(task)}
            className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300"
          >
            <p className="mb-1 text-xs text-slate-400">{getProjectName(task.projectId)}</p>
            <p className="mb-2 text-sm font-medium text-slate-900">{task.タスク名}</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                    getHolderLabel(task) === '自分'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {getHolderLabel(task)}
                </span>
                {task.ballNote && (
                  <span className="truncate text-xs text-slate-400">{task.ballNote}</span>
                )}
              </div>
              <span className={`text-xs ${getDeadlineColor(task.responseDeadline || task.期限)}`}>
                {task.responseDeadline || task.期限 || '期限なし'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
