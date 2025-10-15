import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  Home,
  ListChecks,
  BarChart3,
  Users,
  Menu,
  X,
  ChevronRight,
  Settings,
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
  CalendarDays,
  Home,
  ListChecks,
  BarChart3,
  Users,
  Settings,
};

export function Sidebar({ navigationItems, onNavigationChange }: SidebarProps) {
  const location = useLocation();
  const [isConfigMode, setIsConfigMode] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('compass_sidebar_open');
    if (stored !== null) return stored === '1';
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('compass_sidebar_open', isOpen ? '1' : '0');
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(min-width: 1024px)');
    const handler = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };
    setIsDesktop(query.matches);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handler);
      return () => query.removeEventListener('change', handler);
    }
    query.addListener(handler);
    return () => query.removeListener(handler);
  }, []);

  useEffect(() => {
    if (isDesktop) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      setIsOpen(false);
    }
  }, [isDesktop, location.pathname]);

  const defaultNavItems: NavigationItem[] = useMemo(
    () =>
      navigationItems || [
        { id: 'schedule', label: '工程表', path: '/', icon: 'CalendarDays', visible: true, order: 0 },
        { id: 'summary', label: 'サマリー', path: '/summary', icon: 'BarChart3', visible: true, order: 1 },
        { id: 'tasks', label: 'タスク', path: '/tasks', icon: 'ListChecks', visible: true, order: 2 },
        { id: 'workload', label: '稼働状況', path: '/workload', icon: 'Users', visible: true, order: 3 },
      ],
    [navigationItems]
  );

  const [navItems, setNavItems] = useState(defaultNavItems);

  useEffect(() => {
    if (navigationItems) {
      setNavItems(navigationItems);
    }
  }, [navigationItems]);

  const visibleItems = navItems
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order);

  const toggleVisibility = (id: string) => {
    const updated = navItems.map((item) =>
      item.id === id ? { ...item, visible: !item.visible } : item
    );
    setNavItems(updated);
    onNavigationChange?.(updated);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed top-4 left-4 z-50 rounded-lg bg-white p-2 shadow-lg transition hover:bg-slate-50 lg:hidden"
        aria-label="メニュー"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-200 bg-white transition-transform duration-300 ${
          isDesktop || isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h1 className="text-xl font-bold text-slate-900">Compass</h1>
            <button
              onClick={() => setIsConfigMode((prev) => !prev)}
              className="rounded-lg p-2 transition hover:bg-slate-100"
              aria-label="設定"
            >
              <Settings size={18} className="text-slate-600" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {isConfigMode ? (
              <div className="space-y-2">
                <div className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">
                  メニュー項目の表示設定
                </div>
                {navItems.map((item) => {
                  const Icon = iconMap[item.icon as keyof typeof iconMap] || Home;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-slate-100"
                    >
                      <Icon size={18} className="text-slate-600" />
                      <span className="flex-1 text-sm font-medium text-slate-700">{item.label}</span>
                      <button
                        onClick={() => toggleVisibility(item.id)}
                        className={`rounded px-2 py-1 text-xs ${
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
                        `group flex items-center gap-3 rounded-lg px-3 py-2 transition ${
                          isActive
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`
                      }
                    >
                      <Icon size={18} />
                      <span className="text-sm font-medium">{item.label}</span>
                      <ChevronRight size={16} className="ml-auto text-current/40 opacity-0 transition group-hover:opacity-100" />
                    </NavLink>
                  );
                })}
              </div>
            )}
          </nav>

          <div className="border-t border-slate-200 px-6 py-4">
            <div className="text-xs text-slate-500">Project Compass v1.0</div>
          </div>
        </div>
      </aside>

      {!isDesktop && isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
