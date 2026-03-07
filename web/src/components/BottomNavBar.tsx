import { NavLink } from 'react-router-dom';
import { CalendarDays, ListChecks, Settings } from 'lucide-react';

const tabs = [
  { path: '/', label: '工程表', icon: CalendarDays },
  { path: '/tasks', label: 'ボール', icon: ListChecks },
  { path: '/settings', label: '設定', icon: Settings },
] as const;

export function BottomNavBar() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 flex h-14 items-center border-t border-slate-200 bg-white md:hidden">
      {tabs.map(({ path, label, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
              isActive
                ? 'text-slate-900'
                : 'text-slate-400'
            }`
          }
        >
          {({ isActive }) => (
            <div className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 ${isActive ? 'bg-slate-100' : ''}`}>
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{label}</span>
            </div>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
