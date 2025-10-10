import { Search } from 'lucide-react';
import React from 'react';

interface Option {
  label: string;
  value: string;
}

interface FiltersProps {
  projects: Option[];
  assignees: Option[];
  statuses: Option[];
  project: string;
  assignee: string;
  status: string;
  query: string;
  onProjectChange(value: string): void;
  onAssigneeChange(value: string): void;
  onStatusChange(value: string): void;
  onQueryChange(value: string): void;
  onReset?(): void;
  hasActiveFilters?: boolean;
  resultCount?: number;
}

const baseSelectClass = 'rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800';

export function Filters(props: FiltersProps) {
  const {
    projects,
    assignees,
    statuses,
    project,
    assignee,
    status,
    query,
    onProjectChange,
    onAssigneeChange,
    onStatusChange,
    onQueryChange,
    onReset,
    hasActiveFilters,
    resultCount,
  } = props;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <select
            className={`${baseSelectClass} w-full md:w-[220px]`}
            value={project}
            onChange={(e) => onProjectChange(e.target.value)}
          >
            {projects.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className={`${baseSelectClass} w-full md:w-[160px]`}
            value={assignee}
            onChange={(e) => onAssigneeChange(e.target.value)}
          >
            {assignees.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className={`${baseSelectClass} w-full md:w-[160px]`}
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            {statuses.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
              placeholder="検索（タスク名・担当者・プロジェクト）"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </div>
          {onReset && hasActiveFilters ? (
            <button
              type="button"
              onClick={onReset}
              className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              条件をクリア
            </button>
          ) : null}
        </div>
      </div>
      {typeof resultCount === 'number' ? (
        <div className="text-xs text-slate-500 md:text-right">表示件数: {resultCount}</div>
      ) : null}
    </div>
  );
}
