import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Loader2, RefreshCw, Save, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ApiError,
  getCalendarSyncSettings,
  listGoogleCalendars,
  listProjects,
  triggerInboundCalendarSync,
  updateCalendarSyncSettings,
} from '../lib/api';
import type { CalendarSyncSettings as CalendarSyncSettingsType, Project } from '../lib/types';

interface CalendarSyncSettingsProps {
  className?: string;
}

type CalendarOption = {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
};

const DEFAULT_SETTINGS: Omit<CalendarSyncSettingsType, 'updatedAt'> = {
  outbound: {
    enabled: false,
    calendarId: null,
    calendarName: null,
    lastSyncAt: null,
  },
  inbound: {
    enabled: false,
    calendarId: null,
    calendarName: null,
    syncMode: 'all',
    importAsType: 'task',
    defaultProjectId: null,
    syncToken: null,
    lastSyncAt: null,
  },
};

function normalizeSettings(
  value: CalendarSyncSettingsType | undefined
): Omit<CalendarSyncSettingsType, 'updatedAt'> {
  return {
    outbound: {
      ...DEFAULT_SETTINGS.outbound,
      ...(value?.outbound ?? {}),
    },
    inbound: {
      ...DEFAULT_SETTINGS.inbound,
      ...(value?.inbound ?? {}),
      syncMode: value?.inbound?.syncMode === 'accepted' ? 'accepted' : 'all',
      importAsType: value?.inbound?.importAsType === 'meeting' ? 'meeting' : 'task',
    },
  };
}

function formatDateTime(value: string | null): string {
  if (!value) return '未同期';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ja-JP');
}

export function CalendarSyncSettings({ className = '' }: CalendarSyncSettingsProps) {
  const [settings, setSettings] = useState<Omit<CalendarSyncSettingsType, 'updatedAt'>>(DEFAULT_SETTINGS);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);

  const calendarNameMap = useMemo(() => {
    const map = new Map<string, string>();
    calendars.forEach((calendar) => {
      map.set(calendar.id, calendar.summary);
    });
    return map;
  }, [calendars]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      setSuccess(false);

      const [settingsRes, calendarsRes, projectsRes] = await Promise.allSettled([
        getCalendarSyncSettings(),
        listGoogleCalendars(),
        listProjects(),
      ]);

      if (!mounted) return;

      if (settingsRes.status === 'fulfilled') {
        setSettings(normalizeSettings(settingsRes.value.settings));
      } else {
        setError('同期設定の読み込みに失敗しました');
      }

      if (calendarsRes.status === 'fulfilled') {
        setCalendars(calendarsRes.value.calendars ?? []);
        setCalendarsError(null);
      } else {
        setCalendars([]);
        const reason = calendarsRes.reason;
        if (reason instanceof ApiError) {
          if (reason.code === 'google_not_connected') {
            setCalendarsError('Googleアカウント接続後にカレンダーを選択できます');
          } else if (reason.code === 'google_reauth_required') {
            setCalendarsError('Google連携の認証が失効しました。Googleアカウントを再接続してください');
          } else {
            setCalendarsError(reason.message || 'カレンダー一覧の取得に失敗しました');
          }
        } else {
          setCalendarsError('Googleアカウント接続後にカレンダーを選択できます');
        }
      }

      if (projectsRes.status === 'fulfilled') {
        setProjects(projectsRes.value.projects ?? []);
      } else {
        setProjects([]);
        if (!error) {
          setError('プロジェクト一覧の取得に失敗しました');
        }
      }

      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const setOutboundCalendar = (calendarId: string | null) => {
    const name = calendarId ? calendarNameMap.get(calendarId) ?? null : null;
    setSettings((prev) => ({
      ...prev,
      outbound: {
        ...prev.outbound,
        calendarId,
        calendarName: name,
      },
    }));
  };

  const setInboundCalendar = (calendarId: string | null) => {
    const name = calendarId ? calendarNameMap.get(calendarId) ?? null : null;
    setSettings((prev) => ({
      ...prev,
      inbound: {
        ...prev.inbound,
        calendarId,
        calendarName: name,
      },
    }));
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    if (settings.outbound.enabled && !settings.outbound.calendarId) {
      setError('Outbound同期を有効にする場合は同期先カレンダーを指定してください');
      return;
    }
    if (settings.inbound.enabled && !settings.inbound.calendarId) {
      setError('Inbound同期を有効にする場合は取り込み元カレンダーを指定してください');
      return;
    }
    if (settings.inbound.enabled && !settings.inbound.defaultProjectId) {
      setError('Inbound同期を有効にする場合はデフォルトプロジェクトを指定してください');
      return;
    }
    if (
      settings.outbound.enabled &&
      settings.inbound.enabled &&
      settings.outbound.calendarId &&
      settings.inbound.calendarId &&
      settings.outbound.calendarId === settings.inbound.calendarId
    ) {
      setError('Outbound と Inbound に同じカレンダーは設定できません');
      return;
    }

    try {
      setSaving(true);
      await updateCalendarSyncSettings(settings);
      setSuccess(true);
      toast.success('同期設定を保存しました');
      setTimeout(() => setSuccess(false), 4000);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : '同期設定の保存に失敗しました';
      setError(message);
      toast.error('同期設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleManualInboundSync = async () => {
    if (!settings.inbound.enabled || !settings.inbound.calendarId || !settings.inbound.defaultProjectId) {
      setError('Inbound同期を有効化し、カレンダーとデフォルトプロジェクトを設定してください');
      return;
    }
    setError(null);
    try {
      setSyncing(true);
      const response = await triggerInboundCalendarSync();
      toast.success(response.message ?? 'Inbound同期ジョブをキューに追加しました');
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : '手動同期の実行に失敗しました';
      setError(message);
      toast.error('手動同期の実行に失敗しました');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        読み込み中...
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          設定を保存しました
        </div>
      )}

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Upload className="h-4 w-4 text-slate-700" />
          <h4 className="font-medium text-slate-900">Outbound（Compass → Google Calendar）</h4>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.outbound.enabled}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  outbound: { ...prev.outbound, enabled: event.target.checked },
                }))
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Outbound同期を有効にする
          </label>

          <div>
            <label className="mb-1 block text-sm text-slate-700">同期先カレンダー</label>
            <select
              value={settings.outbound.calendarId ?? ''}
              onChange={(event) => setOutboundCalendar(event.target.value || null)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={!settings.outbound.enabled}
            >
              <option value="">選択してください</option>
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.summary}
                  {calendar.primary ? ' (メイン)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-700">カレンダーID直接入力</label>
            <input
              type="text"
              value={settings.outbound.calendarId ?? ''}
              onChange={(event) => setOutboundCalendar(event.target.value.trim() || null)}
              placeholder="例: abc123@group.calendar.google.com"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={!settings.outbound.enabled}
            />
          </div>

          <p className="text-xs text-slate-500">最終同期: {formatDateTime(settings.outbound.lastSyncAt)}</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Download className="h-4 w-4 text-slate-700" />
          <h4 className="font-medium text-slate-900">Inbound（Google Calendar → Compass）</h4>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.inbound.enabled}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  inbound: { ...prev.inbound, enabled: event.target.checked },
                }))
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Inbound同期を有効にする
          </label>

          <div>
            <label className="mb-1 block text-sm text-slate-700">取り込み元カレンダー</label>
            <select
              value={settings.inbound.calendarId ?? ''}
              onChange={(event) => setInboundCalendar(event.target.value || null)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={!settings.inbound.enabled}
            >
              <option value="">選択してください</option>
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.summary}
                  {calendar.primary ? ' (メイン)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-1 block text-sm text-slate-700">同期モード</span>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    inbound: { ...prev.inbound, syncMode: 'all' },
                  }))
                }
                disabled={!settings.inbound.enabled}
                className={`px-3 py-1.5 text-sm border-r border-slate-300 ${
                  settings.inbound.syncMode === 'all'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                全イベント
              </button>
              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    inbound: { ...prev.inbound, syncMode: 'accepted' },
                  }))
                }
                disabled={!settings.inbound.enabled}
                className={`px-3 py-1.5 text-sm ${
                  settings.inbound.syncMode === 'accepted'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                承認済みのみ
              </button>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-sm text-slate-700">インポート種別</span>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    inbound: { ...prev.inbound, importAsType: 'task' },
                  }))
                }
                disabled={!settings.inbound.enabled}
                className={`px-3 py-1.5 text-sm border-r border-slate-300 ${
                  settings.inbound.importAsType === 'task'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                タスク
              </button>
              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    inbound: { ...prev.inbound, importAsType: 'meeting' },
                  }))
                }
                disabled={!settings.inbound.enabled}
                className={`px-3 py-1.5 text-sm ${
                  settings.inbound.importAsType === 'meeting'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                打合せ
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-700">デフォルトプロジェクト</label>
            <select
              value={settings.inbound.defaultProjectId ?? ''}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  inbound: {
                    ...prev.inbound,
                    defaultProjectId: event.target.value || null,
                  },
                }))
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={!settings.inbound.enabled}
            >
              <option value="">選択してください</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.物件名}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualInboundSync}
              disabled={syncing || !settings.inbound.enabled}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              今すぐ同期
            </button>
            <span className="text-xs text-slate-500">最終同期: {formatDateTime(settings.inbound.lastSyncAt)}</span>
          </div>
        </div>
      </section>

      {calendarsError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {calendarsError}
        </div>
      )}

      <section className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4" />
          注意事項
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs">
          <li>Outbound: Compass専用のGoogleカレンダーを別途作成し、そのカレンダーを選択することを推奨します</li>
          <li>Inbound: イベントの削除はCompass側で「完了」ステータスに変更されます（タスク自体は削除されません）</li>
          <li>Inbound: 初回同期では本日以降のイベントのみが取り込まれます</li>
          <li>OutboundとInboundに同じカレンダーを設定するとループが発生するため避けてください</li>
        </ul>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          同期設定を保存
        </button>
      </div>
    </div>
  );
}
