import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Users,
  HelpCircle,
  LogOut,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import type { User } from 'firebase/auth';

interface SettingsMenuPageProps {
  user?: User | null;
  onSignOut?: () => void;
}

const menuItems = [
  { path: '/summary', label: 'プロジェクト', icon: BarChart3 },
  { path: '/workload', label: 'リソース分析', icon: Users },
  { path: '/users', label: '人員管理', icon: Users },
  { path: '/help', label: 'ヘルプ', icon: HelpCircle },
] as const;

export function SettingsMenuPage({ user, onSignOut }: SettingsMenuPageProps) {
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-lg font-bold text-slate-900">設定</h2>

      <div className="space-y-1">
        {menuItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Icon size={20} className="text-slate-500" />
            <span className="flex-1">{label}</span>
            <ChevronRight size={16} className="text-slate-300" />
          </NavLink>
        ))}
      </div>

      <hr className="my-6 border-slate-200" />

      {user && onSignOut && (
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          <LogOut size={20} className="text-slate-500" />
          <span>ログアウト</span>
        </button>
      )}

      <div className="mt-6 space-y-2 px-4">
        <p className="text-xs text-slate-500">Project Compass v1.0</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
          <NavLink to="/terms" className="hover:text-slate-600 hover:underline">利用規約</NavLink>
          <NavLink to="/privacy" className="hover:text-slate-600 hover:underline">プライバシー</NavLink>
          <NavLink to="/legal" className="hover:text-slate-600 hover:underline">特商法</NavLink>
        </div>
      </div>
    </div>
  );
}
