import React from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { KanbanSquare, BarChart3, List, FileText } from 'lucide-react';

interface ProjectLayoutProps {
  projectName?: string;
}

export function ProjectLayout({ projectName }: ProjectLayoutProps) {
  const { projectId } = useParams();

  const tabs = [
    { path: `/projects/${projectId}/board`, label: 'ボード', icon: KanbanSquare },
    { path: `/projects/${projectId}/gantt`, label: 'ロードマップ', icon: BarChart3 },
    { path: `/projects/${projectId}/backlog`, label: 'バックログ', icon: List },
    { path: `/projects/${projectId}/reports`, label: 'レポート', icon: FileText },
  ];

  return (
    <div className="space-y-4">
      {/* プロジェクトヘッダー */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{projectName || 'プロジェクト'}</h1>
        <p className="mt-2 text-sm text-slate-600">プロジェクトの詳細を管理します</p>
      </div>

      {/* タブナビゲーション */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <nav className="flex gap-2 p-4 border-b border-slate-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`
                }
              >
                <Icon size={16} />
                {tab.label}
              </NavLink>
            );
          })}
        </nav>

        {/* コンテンツエリア */}
        <div className="p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
