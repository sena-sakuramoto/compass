import { Search, Filter, X } from 'lucide-react';
import React, { useState } from 'react';

interface Option {
  label: string;
  value: string;
}

export interface QuickFilters {
  priority?: string;
  sprint?: string;
  overdue?: boolean;
  dueSoon?: boolean; // 期限が7日以内
}

export type GroupByOption = '' | 'project' | 'assignee' | 'status' | 'priority' | 'sprint';

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
  // New props for enhanced filtering
  quickFilters?: QuickFilters;
  onQuickFiltersChange?(filters: QuickFilters): void;
  groupBy?: GroupByOption;
  onGroupByChange?(groupBy: GroupByOption): void;
  sprints?: Option[];
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
    quickFilters = {},
    onQuickFiltersChange,
    groupBy = '',
    onGroupByChange,
    sprints = [],
  } = props;

  const [showQuickFilters, setShowQuickFilters] = useState(false);

  const handleQuickFilterChange = (key: keyof QuickFilters, value: any) => {
    if (!onQuickFiltersChange) return;
    const newFilters = { ...quickFilters };
    if (newFilters[key] === value) {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    onQuickFiltersChange(newFilters);
  };

  const hasQuickFilters = Object.keys(quickFilters).length > 0;
  const quickFilterCount = Object.keys(quickFilters).length;

  return (
    <div className="flex flex-col gap-3">
      {/* 基本フィルタ行 */}
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

      {/* クイックフィルタとグループ化 */}
      {onQuickFiltersChange && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowQuickFilters(!showQuickFilters)}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                hasQuickFilters
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Filter size={14} />
              クイックフィルタ
              {quickFilterCount > 0 && (
                <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-xs text-white">
                  {quickFilterCount}
                </span>
              )}
            </button>

            {onGroupByChange && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">グループ化:</span>
                <select
                  value={groupBy}
                  onChange={(e) => onGroupByChange(e.target.value as GroupByOption)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
                >
                  <option value="">なし</option>
                  <option value="project">プロジェクト</option>
                  <option value="assignee">担当者</option>
                  <option value="status">ステータス</option>
                  <option value="priority">優先度</option>
                  <option value="sprint">スプリント</option>
                </select>
              </div>
            )}
          </div>

          {showQuickFilters && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-3">
                {/* 優先度フィルタ */}
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700">
                    優先度
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['高', '中', '低'].map((priority) => (
                      <button
                        key={priority}
                        onClick={() => handleQuickFilterChange('priority', priority)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                          quickFilters.priority === priority
                            ? priority === '高'
                              ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-500'
                              : priority === '中'
                              ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-500'
                              : 'bg-slate-200 text-slate-700 ring-2 ring-slate-500'
                            : 'bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {priority}
                      </button>
                    ))}
                  </div>
                </div>

                {/* スプリントフィルタ */}
                {sprints.length > 0 && (
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-700">
                      スプリント
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {sprints.map((sprint) => (
                        <button
                          key={sprint.value}
                          onClick={() => handleQuickFilterChange('sprint', sprint.value)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                            quickFilters.sprint === sprint.value
                              ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                              : 'bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {sprint.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 期限フィルタ */}
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700">
                    期限
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleQuickFilterChange('overdue', true)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        quickFilters.overdue
                          ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-500'
                          : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      期限超過
                    </button>
                    <button
                      onClick={() => handleQuickFilterChange('dueSoon', true)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        quickFilters.dueSoon
                          ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-500'
                          : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      期限7日以内
                    </button>
                  </div>
                </div>

                {hasQuickFilters && (
                  <button
                    onClick={() => onQuickFiltersChange({})}
                    className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    <X size={14} />
                    クイックフィルタをクリア
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 結果件数 */}
      {typeof resultCount === 'number' ? (
        <div className="text-xs text-slate-500 md:text-right">表示件数: {resultCount}</div>
      ) : null}
    </div>
  );
}
