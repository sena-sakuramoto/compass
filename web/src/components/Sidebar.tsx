import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  FolderKanban,
  ListChecks,
  BarChart3,
  KanbanSquare,
  FileText,
  Menu,
  X,
  ChevronRight,
  Settings
} from 'lucide-react';

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  visible: boolean;
  order: number;
}

interface SidebarProps {
  navigationItems?: NavigationItem[];
  onNavigationChange?: (items: NavigationItem[]) => void;
}

const iconMap = {
  Home,
  FolderKanban,
  ListChecks,
  BarChart3,
  KanbanSquare,
  FileText,
  Settings,
};

export function Sidebar({ navigationItems, onNavigationChange }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isConfigMode, setIsConfigMode] = useState(false);

  const defaultNavItems: NavigationItem[] = navigationItems || [
    { id: 'home', label: 'ホーム', path: '/', icon: 'Home', visible: true, order: 0 },
    { id: 'summary', label: 'ダッシュボード', path: '/summary', icon: 'BarChart3', visible: true, order: 1 },
    { id: 'projects', label: 'プロジェクト', path: '/projects', icon: 'FolderKanban', visible: true, order: 2 },
    { id: 'tasks', label: 'タスク', path: '/tasks', icon: 'ListChecks', visible: true, order: 3 },
    { id: 'gantt', label: 'ガント', path: '/gantt', icon: 'BarChart3', visible: true, order: 4 },
    { id: 'board', label: 'ボード', path: '/board', icon: 'KanbanSquare', visible: true, order: 5 },
    { id: 'workload', label: '稼働状況', path: '/workload', icon: 'FileText', visible: true, order: 6 },
  ];

  const [navItems, setNavItems] = useState(defaultNavItems);

  const visibleItems = navItems
    .filter(item => item.visible)
    .sort((a, b) => a.order - b.order);

  const toggleVisibility = (id: string) => {
    const updated = navItems.map(item =>
      item.id === id ? { ...item, visible: !item.visible } : item
    );
    setNavItems(updated);
    onNavigationChange?.(updated);
  };

  return (
    <>
      {/* ハンバーガーメニューボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 rounded-lg bg-white p-2 shadow-lg hover:bg-slate-50 transition lg:hidden"
        aria-label="メニュー"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* サイドバー */}
      <aside
        className={`fixed left-0 top-0 z-40 h-screen bg-white border-r border-slate-200 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isOpen ? 'w-64' : 'w-0'}`}
      >
        <div className="flex h-full flex-col">
          {/* ヘッダー */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h1 className="text-xl font-bold text-slate-900">Compass</h1>
            <button
              onClick={() => setIsConfigMode(!isConfigMode)}
              className="rounded-lg p-2 hover:bg-slate-100 transition"
              aria-label="設定"
            >
              <Settings size={18} className="text-slate-600" />
            </button>
          </div>

          {/* ナビゲーション */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {isConfigMode ? (
              <div className="space-y-2">
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                  メニュー項目の表示設定
                </div>
                {navItems.map((item) => {
                  const Icon = iconMap[item.icon as keyof typeof iconMap] || Home;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-100 transition"
                    >
                      <Icon size={18} className="text-slate-600" />
                      <span className="flex-1 text-sm font-medium text-slate-700">
                        {item.label}
                      </span>
                      <button
                        onClick={() => toggleVisibility(item.id)}
                        className={`text-xs px-2 py-1 rounded ${
                          item.visible
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.visible ? '表示' : '非表示'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = iconMap[item.icon as keyof typeof iconMap] || Home;
                  return (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 transition ${
                          isActive
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`
                      }
                    >
                      <Icon size={18} />
                      <span className="text-sm font-medium">{item.label}</span>
                      <ChevronRight size={16} className="ml-auto opacity-0 group-hover:opacity-100" />
                    </NavLink>
                  );
                })}
              </div>
            )}
          </nav>

          {/* フッター */}
          <div className="border-t border-slate-200 px-6 py-4">
            <div className="text-xs text-slate-500">
              Project Compass v1.0
            </div>
          </div>
        </div>
      </aside>

      {/* オーバーレイ（モバイル用） */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
