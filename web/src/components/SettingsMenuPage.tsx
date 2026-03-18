import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Users,
  HelpCircle,
  LogOut,
  ChevronRight,
  Clock,
  MessageSquare,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { getWorkHours, setWorkHours } from '../lib/workHours';

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

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export function SettingsMenuPage({ user, onSignOut }: SettingsMenuPageProps) {
  const [workHrs, setWorkHrs] = useState(getWorkHours);

  const handleStartChange = (h: number) => {
    const next = { ...workHrs, startHour: h };
    // Only prevent same hour (0-length day)
    if (h === workHrs.endHour) next.endHour = (h + 1) % 24;
    setWorkHrs(next);
    setWorkHours(next);
  };

  const handleEndChange = (h: number) => {
    const next = { ...workHrs, endHour: h };
    if (h === workHrs.startHour) next.startHour = (h + 23) % 24; // -1 wrapped
    setWorkHrs(next);
    setWorkHours(next);
  };

  const isOvernight = workHrs.startHour > workHrs.endHour;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-lg font-bold text-slate-900">設定</h2>

      {/* 業務時間 */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={18} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">業務時間</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">「今日」画面のタイムラインに反映されます</p>
        <div className="flex items-center gap-3">
          <select
            value={workHrs.startHour}
            onChange={(e) => handleStartChange(Number(e.target.value))}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>{`${h}:00`}</option>
            ))}
          </select>
          <span className="text-sm text-slate-400">〜</span>
          <select
            value={workHrs.endHour}
            onChange={(e) => handleEndChange(Number(e.target.value))}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {/* Start from startHour+1, wrap around, "翌" after midnight */}
            {Array.from({ length: 23 }, (_, i) => (workHrs.startHour + 1 + i) % 24).map((h) => {
              const isNextDay = h <= workHrs.startHour;
              return (
                <option key={h} value={h}>
                  {isNextDay ? `翌${h}:00` : `${h}:00`}
                </option>
              );
            })}
          </select>
        </div>
        {isOvernight && (
          <p className="mt-2 text-xs text-slate-500">翌日の {workHrs.endHour}:00 まで表示されます</p>
        )}
      </div>

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
