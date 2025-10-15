import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Download,
  FileJson,
  FileSpreadsheet,
  ListChecks,
  Plus,
  Users,
  CheckCircle2,
  TrendingUp,
  LogIn,
} from 'lucide-react';
import {
  listProjects,
  listTasks,
  listPeople,
  createTask,
  createProject,
  createPerson,
  updateProject,
  updateTask,
  completeTask,
  importExcel,
  exportExcel,
  exportSnapshot,
  importSnapshot,
  moveTaskDates,
  seedTaskReminders,
  syncTaskCalendar,
} from './lib/api';
import { Filters } from './components/Filters';
import { ProjectCard } from './components/ProjectCard';
import { TaskCard, computeProgress } from './components/TaskCard';
import { TaskTable, TaskTableRow } from './components/TaskTable';
import { GanttChartView, GanttDatum } from './components/GanttChart';
import { WorkerMonitor } from './components/WorkerMonitor';
import { Sidebar } from './components/Sidebar';
import { formatDate, parseDate, todayString, DAY_MS, calculateDuration } from './lib/date';
import { normalizeSnapshot, SAMPLE_SNAPSHOT, toNumber } from './lib/normalize';
import type { Project, Task, Person, SnapshotPayload, TaskNotificationSettings } from './lib/types';
import {
  ResponsiveContainer as WorkloadResponsiveContainer,
  BarChart as WorkloadBarChart,
  CartesianGrid as WorkloadCartesianGrid,
  XAxis as WorkloadXAxis,
  YAxis as WorkloadYAxis,
  Tooltip as WorkloadTooltip,
  Bar as WorkloadBar,
} from 'recharts';
import { useFirebaseAuth } from './lib/firebaseClient';
import type { User } from 'firebase/auth';

const LOCAL_KEY = 'apdw_compass_snapshot_v1';

interface CompassState {
  projects: Project[];
  tasks: Task[];
  people: Person[];
}

function useSnapshot() {
  const [state, setState] = useState<CompassState>(() => {
    if (typeof window === 'undefined') {
      const normalized = normalizeSnapshot(SAMPLE_SNAPSHOT);
      return {
        projects: normalized.projects,
        tasks: normalized.tasks,
        people: normalized.people,
      };
    }
    try {
      const cached = localStorage.getItem(LOCAL_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as SnapshotPayload;
        const normalized = normalizeSnapshot(parsed);
        return {
          projects: normalized.projects,
          tasks: normalized.tasks,
          people: normalized.people,
        };
      }
    } catch (err) {
      console.warn('Failed to load cached snapshot', err);
    }
    const normalized = normalizeSnapshot(SAMPLE_SNAPSHOT);
    return {
      projects: normalized.projects,
      tasks: normalized.tasks,
      people: normalized.people,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({
        generated_at: todayString(),
        projects: state.projects,
        tasks: state.tasks,
        people: state.people,
      })
    );
  }, [state]);

  return [state, setState] as const;
}

function AppLayout({
  children,
  onOpenTask,
  onOpenProject,
  onOpenPerson,
  user,
  authSupported,
  authReady,
  onSignIn,
  onSignOut,
  authError,
}: {
  children: React.ReactNode;
  onOpenTask(): void;
  onOpenProject(): void;
  onOpenPerson(): void;
  user: User | null;
  authSupported: boolean;
  authReady: boolean;
  onSignIn(): void;
  onSignOut(): void;
  authError?: string | null;
}) {
  const location = useLocation();
  const tabs = [
    { path: '/', label: 'スケジュール' },
    { path: '/summary', label: 'サマリー' },
    { path: '/tasks', label: 'タスク' },
    { path: '/workload', label: '人別負荷' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      {/* サイドバー */}
      <Sidebar />

      {/* メインコンテンツ */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
            <div className="lg:ml-0 ml-14">
              <h1 className="text-lg font-bold md:text-2xl">APDW Project Compass</h1>
              <p className="text-xs text-slate-600 md:text-sm">
                全プロジェクト・タスク反映／ガント（プロジェクト・タスク切替）／モバイル最適化
              </p>
            </div>
            <HeaderActions
              user={user}
              authSupported={authSupported}
              authReady={authReady}
              onSignIn={onSignIn}
              onSignOut={onSignOut}
              authError={authError}
            />
          </div>
        {!authSupported ? (
          <div className="bg-amber-50 text-amber-700">
            <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-xs">
              Firebase Auth の環境変数が設定されていません。`.env` に Firebase の SDK 設定を追加するとクラウド同期が有効になります。
            </div>
          </div>
        ) : authReady && !user ? (
          <div className="bg-slate-900 text-slate-100">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2 text-xs">
              <span>Google でサインインすると、Firestore にリアルタイム保存されます。</span>
              <button
                type="button"
                onClick={onSignIn}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-100"
              >
                サインイン
              </button>
            </div>
            {authError ? (
              <div className="mx-auto max-w-6xl px-4 pb-2 text-xs text-rose-200">{authError}</div>
            ) : null}
          </div>
        ) : null}
        </header>
        <main className="mx-auto max-w-7xl px-4 pb-8 pt-6 md:pt-8 lg:px-8">{children}</main>
        <BottomBar
          onOpenTask={onOpenTask}
          onOpenProject={onOpenProject}
          onOpenPerson={onOpenPerson}
          user={user}
          authSupported={authSupported}
          authReady={authReady}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          authError={authError}
        />
      </div>
    </div>
  );
}

function HeaderActions({
  user,
  authSupported,
  authReady,
  onSignIn,
  onSignOut,
  authError,
}: {
  user: User | null;
  authSupported: boolean;
  authReady: boolean;
  onSignIn(): void;
  onSignOut(): void;
  authError?: string | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const download = async (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = async () => {
    try {
      setDownloading(true);
      const snapshot = await exportSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      await download(blob, `apdw_compass_${todayString()}.json`);
    } catch (err) {
      console.error(err);
      alert('JSONエクスポートに失敗しました');
    } finally {
      setDownloading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setDownloading(true);
      const blob = await exportExcel();
      await download(blob, `APDW_Export_${todayString()}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('Excelエクスポートに失敗しました');
    } finally {
      setDownloading(false);
    }
  };

  const jsonInputRef = React.useRef<HTMLInputElement | null>(null);
  const excelInputRef = React.useRef<HTMLInputElement | null>(null);

  const triggerJson = () => jsonInputRef.current?.click();
  const triggerExcel = () => excelInputRef.current?.click();

  const handleJsonSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = JSON.parse(await file.text()) as SnapshotPayload;
      await importSnapshot(content);
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (err) {
      console.error(err);
      alert('JSON読み込みに失敗しました');
    } finally {
      event.target.value = '';
    }
  };

  const handleExcelSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importExcel(file);
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (err) {
      console.error(err);
      alert('Excel読み込みに失敗しました');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="hidden items-center gap-2 md:flex">
      <button
        type="button"
        onClick={handleExportJson}
        className="flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
        disabled={downloading}
      >
        <Download className="h-4 w-4" /> JSON
      </button>
      <button
        type="button"
        onClick={handleExportExcel}
        className="flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
        disabled={downloading}
      >
        <Download className="h-4 w-4" /> Excel
      </button>
      <input ref={jsonInputRef} type="file" accept="application/json" className="hidden" onChange={handleJsonSelected} />
      <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelSelected} />
      <button
        type="button"
        onClick={triggerJson}
        className="flex items-center gap-1 rounded-2xl bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800"
      >
        <FileJson className="h-4 w-4" /> JSON読み込み
      </button>
      <button
        type="button"
        onClick={triggerExcel}
        className="flex items-center gap-1 rounded-2xl bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800"
      >
        <FileSpreadsheet className="h-4 w-4" /> Excel読み込み
      </button>
      <div className="h-6 w-px bg-slate-200" />
      {authSupported ? (
        user ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {(user.displayName || user.email || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-semibold text-slate-900">{user.displayName ?? user.email ?? 'サインイン済み'}</span>
                <span className="text-[11px] text-slate-500">同期有効</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              ログアウト
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            disabled={!authReady}
            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Googleでサインイン
          </button>
        )
      ) : (
        <span className="text-xs text-slate-400">Firebase Auth 未設定</span>
      )}
      {authError && user ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] text-rose-700">{authError}</div>
      ) : null}
    </div>
  );
}

function BottomBar({
  onOpenTask,
  onOpenProject,
  onOpenPerson,
  user,
  authSupported,
  authReady,
  onSignIn,
  onSignOut,
  authError,
}: {
  onOpenTask(): void;
  onOpenProject(): void;
  onOpenPerson(): void;
  user: User | null;
  authSupported: boolean;
  authReady: boolean;
  onSignIn(): void;
  onSignOut(): void;
  authError?: string | null;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-3 shadow md:hidden">
      <div className="mx-auto max-w-md space-y-3">
        {/* 認証ボタン */}
        {authSupported && (
          <div className="flex justify-center">
            {user ? (
              <button
                type="button"
                className="flex items-center gap-1 rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                onClick={onSignOut}
              >
                ログアウト
              </button>
            ) : (
              <button
                type="button"
                className="flex items-center gap-1 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                onClick={onSignIn}
                disabled={!authReady}
              >
                Googleでサインイン
              </button>
            )}
          </div>
        )}

        {/* 追加ボタン */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-slate-900 px-3 py-3 text-white shadow-sm transition-colors hover:bg-slate-800"
            onClick={onOpenTask}
          >
            <Plus className="h-5 w-5" />
            <span className="text-xs font-medium">タスク</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            onClick={onOpenProject}
          >
            <Plus className="h-5 w-5" />
            <span className="text-xs font-medium">プロジェクト</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            onClick={onOpenPerson}
          >
            <Plus className="h-5 w-5" />
            <span className="text-xs font-medium">担当者</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

function Modal({ open, onOpenChange, children, title }: ModalProps & { title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button type="button" onClick={() => onOpenChange(false)} className="text-slate-500">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface TaskModalProps extends ModalProps {
  projects: Project[];
  people: Person[];
  onSubmit(payload: {
    projectId: string;
    タスク名: string;
    担当者?: string;
    予定開始日?: string;
    期限?: string;
    優先度: string;
    ステータス: string;
    ['工数見積(h)']?: number;
    担当者メール?: string;
    '通知設定'?: TaskNotificationSettings;
  }): Promise<void>;
}

function TaskModal({ open, onOpenChange, projects, people, onSubmit }: TaskModalProps) {
  const [project, setProject] = useState('');
  const [assignee, setAssignee] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('中');
  const [status, setStatus] = useState('未着手');
  const [estimate, setEstimate] = useState(4);
  const [notifyStart, setNotifyStart] = useState(true);
  const [notifyDayBefore, setNotifyDayBefore] = useState(true);
  const [notifyDue, setNotifyDue] = useState(true);
  const [notifyOverdue, setNotifyOverdue] = useState(true);

  useEffect(() => {
    if (!open) return;
    setProject('');
    setAssignee('');
    setAssigneeEmail('');
    setName('');
    setStart('');
    setDue('');
    setPriority('中');
    setStatus('未着手');
    setEstimate(4);
    setNotifyStart(true);
    setNotifyDayBefore(true);
    setNotifyDue(true);
    setNotifyOverdue(true);
  }, [open]);

  useEffect(() => {
    if (!assignee) {
      setAssigneeEmail('');
      return;
    }
    const person = people.find((p) => p.氏名 === assignee);
    setAssigneeEmail(person?.メール ?? '');
  }, [assignee, people]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        projectId: project,
        タスク名: name,
        担当者: assignee,
        予定開始日: start,
        期限: due,
        優先度: priority,
        ステータス: status,
        ['工数見積(h)']: estimate,
        担当者メール: assigneeEmail || undefined,
        '通知設定': {
          開始日: notifyStart,
          期限前日: notifyDayBefore,
          期限当日: notifyDue,
          超過: notifyOverdue,
        },
      } as {
        projectId: string;
        タスク名: string;
        担当者?: string;
        予定開始日?: string;
        期限?: string;
        優先度: string;
        ステータス: string;
        ['工数見積(h)']?: number;
        担当者メール?: string;
        '通知設定'?: TaskNotificationSettings;
      };
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      alert('タスク追加に失敗しました');
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="タスク追加">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-xs text-slate-500">プロジェクト</label>
          <select
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            required
          >
            <option value="">選択</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.物件名 || p.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">担当者</label>
          <select
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">選択</option>
            {people.map((person) => (
              <option key={person.氏名} value={person.氏名}>
                {person.氏名}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">通知送信先メール</label>
          <input
            type="email"
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={assigneeEmail}
            onChange={(e) => setAssigneeEmail(e.target.value)}
            placeholder="担当者メールアドレス"
          />
          <p className="mt-1 text-[11px] text-slate-500">担当者のプロフィールにメールが登録されている場合、自動で補完します。</p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">タスク名</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">予定開始日</label>
            <input
              type="date"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">期限</label>
            <input
              type="date"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">優先度</label>
            <select
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">ステータス</label>
            <select
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="未着手">未着手</option>
              <option value="進行中">進行中</option>
              <option value="確認待ち">確認待ち</option>
              <option value="保留">保留</option>
              <option value="完了">完了</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">工数見積(h)</label>
          <input
            type="number"
            min="0"
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={estimate}
            onChange={(e) => setEstimate(Number(e.target.value || 0))}
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">メール通知タイミング</p>
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifyStart} onChange={(e) => setNotifyStart(e.target.checked)} />
              <span>開始日 朝 9:00 に通知</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifyDayBefore} onChange={(e) => setNotifyDayBefore(e.target.checked)} />
              <span>期限前日 朝 9:00 に通知</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifyDue} onChange={(e) => setNotifyDue(e.target.checked)} />
              <span>期限当日 朝 9:00 に通知</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifyOverdue} onChange={(e) => setNotifyOverdue(e.target.checked)} />
              <span>期限超過時に再通知</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="rounded-2xl border px-3 py-2" onClick={() => onOpenChange(false)}>
            キャンセル
          </button>
          <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            追加
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface ProjectModalProps extends ModalProps {
  onSubmit(payload: {
    物件名: string;
    開始日?: string;
    予定完了日?: string;
    ステータス: string;
    優先度: string;
  }): Promise<void>;
}

function ProjectModal({ open, onOpenChange, onSubmit }: ProjectModalProps) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [status, setStatus] = useState('計画中');
  const [priority, setPriority] = useState('中');

  useEffect(() => {
    if (!open) return;
    setName('');
    setStart('');
    setDue('');
    setStatus('計画中');
    setPriority('中');
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit({
        物件名: name,
        開始日: start,
        予定完了日: due,
        ステータス: status,
        優先度: priority,
      });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      alert('プロジェクト追加に失敗しました');
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="プロジェクト追加">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-xs text-slate-500">物件名</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">開始日</label>
            <input
              type="date"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">予定完了日</label>
            <input
              type="date"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">ステータス</label>
            <select
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="計画中">計画中</option>
              <option value="設計中">設計中</option>
              <option value="見積">見積</option>
              <option value="実施中">実施中</option>
              <option value="完了">完了</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">優先度</label>
            <select
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="rounded-2xl border px-3 py-2" onClick={() => onOpenChange(false)}>
            キャンセル
          </button>
          <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            追加
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface PersonModalProps extends ModalProps {
  onSubmit(payload: {
    氏名: string;
    役割?: string;
    メール?: string;
    電話?: string;
    '稼働時間/日(h)'?: number;
  }): Promise<void>;
}

function PersonModal({ open, onOpenChange, onSubmit }: PersonModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [workingHours, setWorkingHours] = useState<number | ''>('');

  useEffect(() => {
    if (open) {
      setName('');
      setRole('');
      setEmail('');
      setPhone('');
      setWorkingHours('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        氏名: name,
        役割: role || undefined,
        メール: email || undefined,
        電話: phone || undefined,
        '稼働時間/日(h)': workingHours ? Number(workingHours) : undefined,
      };
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      alert('担当者追加に失敗しました');
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="担当者追加">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-xs text-slate-500">氏名</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="氏名"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">役割</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="役割"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">メール</label>
          <input
            type="email"
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">電話</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="電話番号"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">稼働時間/日(h)</label>
          <input
            type="number"
            step="0.5"
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={workingHours}
            onChange={(e) => setWorkingHours(e.target.value ? Number(e.target.value) : '')}
            placeholder="8"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="rounded-2xl border px-3 py-2" onClick={() => onOpenChange(false)}>
            キャンセル
          </button>
          <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            追加
          </button>
        </div>
      </form>
    </Modal>
  );
}

type ProjectSortKey = 'due' | 'progress' | 'tasks' | 'priority';

type TimeScale = 'auto' | 'six_weeks' | 'quarter' | 'half_year' | 'full';

function FullScreenLoader({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-slate-600">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
      <p className="mt-4 text-sm font-medium">{message}</p>
    </div>
  );
}

function AuthConfigMissingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-700">
      <div className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Firebase Auth の設定が不足しています</h1>
        <p className="text-sm leading-relaxed">
          `.env` に Firebase Web SDK の設定値を追加してください。
          <br />
          <code className="mt-2 inline-block rounded bg-slate-900 px-2 py-1 text-xs text-white">
            VITE_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID など
          </code>
        </p>
        <p className="text-xs text-slate-500">
          Firebase コンソール &gt; プロジェクトの設定 &gt; SDK 設定と構成 から値をコピーできます。
        </p>
      </div>
    </div>
  );
}

function SignInScreen({ onSignIn, error }: { onSignIn(): void; error?: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 text-white">
      <div className="w-full max-w-lg space-y-6 rounded-3xl border border-white/10 bg-white/5 p-10 backdrop-blur">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-slate-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Compass
          </div>
          <h1 className="text-2xl font-semibold">Google アカウントでサインイン</h1>
          <p className="text-sm text-slate-200/80">
            サインインすると、Firestore とリアルタイムで同期され、プロジェクト・タスクの最新情報を全員で共有できます。
          </p>
        </div>
        <button
          type="button"
          onClick={onSignIn}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:shadow-xl"
        >
          <LogIn className="h-5 w-5" /> Google でサインイン
        </button>
        <p className="text-xs text-slate-200/70">
          サインイン後にタスクやプロジェクトを追加できます。ログアウトすると再表示されます。
        </p>
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DashboardPage({
  projects,
  filtersProps,
  filteredTasks,
  onOpenTask,
  onOpenProject,
  onOpenPerson,
  sortKey,
  onSortChange,
}: {
  projects: ProjectWithDerived[];
  filteredTasks: Task[];
  filtersProps: FiltersProps;
  onOpenTask(): void;
  onOpenProject(): void;
  onOpenPerson(): void;
  sortKey: ProjectSortKey;
  onSortChange(value: ProjectSortKey): void;
}) {
  const today = new Date();
  const openTaskCount = useMemo(
    () => filteredTasks.filter((task) => task.ステータス !== '完了').length,
    [filteredTasks]
  );
  const overdueCount = useMemo(
    () =>
      filteredTasks.filter((task) => {
        const deadline = parseDate(task.end ?? task.期限 ?? task.実績完了日);
        return deadline ? deadline.getTime() < today.getTime() && task.ステータス !== '完了' : false;
      }).length,
    [filteredTasks, today]
  );
  const averageProgress = useMemo(() => {
    if (!filteredTasks.length) return 0;
    const total = filteredTasks.reduce((sum, task) => sum + computeProgress(task.progress, task.ステータス), 0);
    return Math.round((total / filteredTasks.length) * 100);
  }, [filteredTasks]);
  const activeMembersCount = useMemo(() => {
    const members = new Set<string>();
    filteredTasks.forEach((task) => {
      const name = task.assignee ?? task.担当者;
      if (name) members.add(name);
    });
    return members.size;
  }, [filteredTasks]);

  const stats = useMemo(
    () => [
      {
        id: 'tasks_visible',
        icon: ListChecks,
        label: 'タスク(表示中)',
        value: filteredTasks.length.toString(),
        accent: 'primary' as const,
        note: filtersProps.hasActiveFilters ? 'フィルタ適用中' : '全件表示',
      },
      {
        id: 'open_tasks',
        icon: BarChart3,
        label: '未完了タスク',
        value: openTaskCount.toString(),
        accent: overdueCount > 0 ? 'alert' : 'neutral',
        note: overdueCount > 0 ? `${overdueCount} 件が期限超過` : '期限超過なし',
      },
      {
        id: 'avg_progress',
        icon: TrendingUp,
        label: '平均進捗',
        value: `${averageProgress}%`,
        accent: 'neutral' as const,
        note: '表示中タスクの平均値',
      },
      {
        id: 'active_members',
        icon: Users,
        label: '稼働メンバー',
        value: activeMembersCount.toString(),
        accent: 'neutral' as const,
        note: `${filtersProps.assignees.length - 1} 人中`,
      },
    ],
    [filteredTasks.length, openTaskCount, overdueCount, averageProgress, activeMembersCount, filtersProps.hasActiveFilters, filtersProps.assignees.length]
  );

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (filtersProps.project !== 'all') {
      const label = filtersProps.projects.find((option) => option.value === filtersProps.project)?.label;
      if (label) chips.push(`プロジェクト: ${label}`);
    }
    if (filtersProps.assignee !== 'all') {
      const label = filtersProps.assignees.find((option) => option.value === filtersProps.assignee)?.label;
      if (label) chips.push(`担当: ${label}`);
    }
    if (filtersProps.status !== 'all') {
      chips.push(`ステータス: ${filtersProps.status}`);
    }
    if ((filtersProps.query ?? '').trim()) {
      chips.push(`検索: “${filtersProps.query.trim()}”`);
    }
    return chips;
  }, [filtersProps]);

  const sortOptions: { value: ProjectSortKey; label: string }[] = [
    { value: 'due', label: '期限が近い順' },
    { value: 'progress', label: '進捗が低い順' },
    { value: 'tasks', label: '未完了が多い順' },
    { value: 'priority', label: '優先度が高い順' },
  ];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const accentClass =
            stat.accent === 'primary'
              ? 'border-transparent bg-slate-900 text-white'
              : stat.accent === 'alert'
              ? 'border-rose-100 bg-rose-50 text-rose-700'
              : 'border-slate-200 bg-white text-slate-900';
          const iconColor = stat.accent === 'primary' ? 'text-slate-200' : stat.accent === 'alert' ? 'text-rose-500' : 'text-slate-500';
          const noteColor = stat.accent === 'primary' ? 'text-slate-200/80' : 'text-slate-500';
          return (
            <div key={stat.id} className={`flex flex-col gap-2 rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${accentClass}`}>
              <div className="flex items-center gap-2 text-xs font-medium">
                <Icon className={`h-4 w-4 ${iconColor}`} />
                <span>{stat.label}</span>
              </div>
              <div className="text-2xl font-semibold">{stat.value}</div>
              <div className={`text-xs ${noteColor}`}>{stat.note}</div>
            </div>
          );
        })}
      </section>

      <section className="space-y-4">
        <Filters {...filtersProps} />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">並び順</span>
            <select
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
              value={sortKey}
              onChange={(event) => onSortChange(event.target.value as ProjectSortKey)}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="hidden items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 md:flex"
              onClick={onOpenTask}
            >
              <Plus className="h-4 w-4" /> タスク追加
            </button>
            <button
              type="button"
              className="hidden items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 md:flex"
              onClick={onOpenProject}
            >
              <Plus className="h-4 w-4" /> プロジェクト追加
            </button>
            <button
              type="button"
              className="hidden items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 md:flex"
              onClick={onOpenPerson}
            >
              <Plus className="h-4 w-4" /> 担当者追加
            </button>
          </div>
        </div>
        {activeFilterChips.length ? (
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            {activeFilterChips.map((chip) => (
              <span key={chip} className="rounded-full bg-slate-100 px-2 py-1">
                {chip}
              </span>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              条件に一致するプロジェクトがありません。フィルタを調整するか、新しいプロジェクトを追加してください。
            </div>
          ) : (
            projects.map((project) => {
              const dueCandidate = parseDate(project.nearestDue ?? project.予定完了日 ?? project.span?.end ?? null);
              let dueLabel: string | undefined;
              let overdue = false;
              if (dueCandidate) {
                const diffDays = Math.ceil((dueCandidate.getTime() - today.getTime()) / DAY_MS);
                if (diffDays > 0) {
                  dueLabel = `残り ${diffDays} 日`;
                } else if (diffDays === 0) {
                  dueLabel = '今日が期限';
                  overdue = false;
                } else {
                  dueLabel = `${Math.abs(diffDays)} 日遅延`;
                  overdue = true;
                }
              }

              return (
                <motion.div key={project.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                  <ProjectCard
                    id={project.id}
                    name={project.物件名 || project.id}
                    status={project.ステータス}
                    priority={project.優先度}
                    start={project.span?.start || project.開始日}
                    due={project.span?.end || project.予定完了日}
                    progress={project.progressAggregate ?? 0}
                    tasks={project.taskCount}
                    openTasks={project.openTaskCount}
                    dueLabel={dueLabel}
                    overdue={overdue}
                  />
                </motion.div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

interface FiltersProps {
  projects: { value: string; label: string }[];
  assignees: { value: string; label: string }[];
  statuses: { value: string; label: string }[];
  project: string;
  assignee: string;
  status: string;
  query: string;
  onProjectChange: (value: string) => void;
  onAssigneeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  resultCount?: number;
}

interface ProjectWithDerived extends Project {
  taskCount: number;
  openTaskCount: number;
  nearestDue?: string | null;
}

function TasksPage({
  filtersProps,
  filteredTasks,
  projectMap,
  onComplete,
  onOpenTask,
  onOpenProject,
  onOpenPerson,
  onSeedReminders,
  onCalendarSync,
}: {
  filtersProps: FiltersProps;
  filteredTasks: Task[];
  projectMap: Record<string, Project>;
  onComplete(task: Task, done: boolean): void;
  onOpenTask(): void;
  onOpenProject(): void;
  onOpenPerson(): void;
  onSeedReminders?(taskId: string): Promise<void>;
  onCalendarSync?(taskId: string): Promise<void>;
}) {
  const [seedBusyIds, setSeedBusyIds] = useState<Set<string>>(new Set());
  const [calendarBusyIds, setCalendarBusyIds] = useState<Set<string>>(new Set());

  const runWithBusy = useCallback(
    async (
      taskId: string,
      setFn: React.Dispatch<React.SetStateAction<Set<string>>>,
      action?: (id: string) => Promise<void>
    ) => {
      if (!action) return;
      setFn((prev) => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });
      try {
        await action(taskId);
      } finally {
        setFn((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    []
  );

  const handleSeedReminders = useCallback(
    (taskId: string) => runWithBusy(taskId, setSeedBusyIds, onSeedReminders),
    [onSeedReminders, runWithBusy]
  );

  const handleCalendarSync = useCallback(
    (taskId: string) => runWithBusy(taskId, setCalendarBusyIds, onCalendarSync),
    [onCalendarSync, runWithBusy]
  );

  const buildScheduleLabel = useCallback((task: Task) => {
    const startLabel = formatDate(task.start ?? task.予定開始日 ?? null);
    const endLabel = formatDate(task.end ?? task.期限 ?? null);
    if (!startLabel && !endLabel) return '未設定';
    return `${startLabel || '未設定'} → ${endLabel || '未設定'}`;
  }, []);

  const rows: TaskTableRow[] = filteredTasks.map((task) => ({
    id: task.id,
    name: task.タスク名,
    projectLabel: projectMap[task.projectId]?.物件名 ?? task.projectId,
    assignee: task.assignee ?? task.担当者 ?? '',
    schedule: buildScheduleLabel(task),
    effort: task['工数見積(h)'] ? String(task['工数見積(h)']) : '-',
    priority: task['優先度'] ?? '',
    status: task.ステータス,
    progress: task.progress,
  }));

  return (
    <div className="space-y-4">
      <WorkerMonitor tasks={filteredTasks} />
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <Filters {...filtersProps} />
        <div className="hidden gap-2 md:flex">
          <button
            type="button"
            className="flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
            onClick={onOpenTask}
          >
            <Plus className="h-4 w-4" /> タスク追加
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
            onClick={onOpenProject}
          >
            <Plus className="h-4 w-4" /> プロジェクト追加
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
            onClick={onOpenPerson}
          >
            <Plus className="h-4 w-4" /> 担当者追加
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:hidden">
        {filteredTasks.map((task) => (
          <TaskCard
            key={task.id}
            id={task.id}
            name={task.タスク名}
            projectLabel={projectMap[task.projectId]?.物件名 ?? task.projectId}
            assignee={task.assignee ?? task.担当者 ?? ''}
            schedule={buildScheduleLabel(task)}
            status={task.ステータス}
            progress={task.progress}
            onComplete={() => onComplete(task, true)}
            onSeedReminders={onSeedReminders ? () => handleSeedReminders(task.id) : undefined}
            onCalendarSync={onCalendarSync ? () => handleCalendarSync(task.id) : undefined}
            seedBusy={seedBusyIds.has(task.id)}
            calendarBusy={calendarBusyIds.has(task.id)}
          />
        ))}
      </div>
      <div className="hidden md:block">
        <TaskTable
          rows={rows}
          onToggle={(id, checked) => {
            const task = filteredTasks.find((t) => t.id === id);
            if (task) onComplete(task, checked);
          }}
          onSeedReminders={onSeedReminders ? (id) => handleSeedReminders(id) : undefined}
          onCalendarSync={onCalendarSync ? (id) => handleCalendarSync(id) : undefined}
          seedBusyIds={seedBusyIds}
          calendarBusyIds={calendarBusyIds}
        />
      </div>
    </div>
  );
}

function SchedulePage({
  filtersProps,
  filteredTasks,
  projectMap,
  people,
  projects,
  onTaskDateChange,
  onTaskCreate,
  onProjectCreate,
  onTaskAssigneeChange,
}: {
  filtersProps: FiltersProps;
  filteredTasks: Task[];
  projectMap: Record<string, Project>;
  people: Person[];
  projects: Project[];
  onTaskDateChange?: (taskId: string, payload: { start: string; end: string; kind: 'move' | 'resize-start' | 'resize-end' }) => void;
  onTaskCreate?: (payload: any) => void;
  onProjectCreate?: (payload: any) => void;
  onTaskAssigneeChange?: (taskId: string, assignee: string) => void;
}) {
  const [mode, setMode] = useState<'tasks' | 'projects' | 'people'>('projects');
  const [timeScale, setTimeScale] = useState<TimeScale>('six_weeks');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [draggedAssignee, setDraggedAssignee] = useState<string | null>(null);
  const today = new Date();
  const todayLabel = formatDate(today);

  const tasksStartingToday = useMemo(
    () =>
      filteredTasks.filter((task) => {
        const start = formatDate(task.start ?? task.予定開始日 ?? null);
        return start === todayLabel;
      }).length,
    [filteredTasks, todayLabel]
  );

  const tasksDueToday = useMemo(
    () =>
      filteredTasks.filter((task) => {
        const due = formatDate(task.end ?? task.期限 ?? task.実績完了日 ?? null);
        return due === todayLabel;
      }).length,
    [filteredTasks, todayLabel]
  );

  const tasksActiveToday = useMemo(() => {
    return filteredTasks.filter((task) => {
      const start = parseDate(task.start ?? task.予定開始日 ?? task.実績開始日 ?? null);
      const end = parseDate(task.end ?? task.期限 ?? task.実績完了日 ?? null) ?? start;
      if (!start) return false;
      const startMs = start.getTime();
      const endMs = (end ?? start).getTime();
      const todayMs = today.getTime();
      return startMs <= todayMs && todayMs <= endMs;
    });
  }, [filteredTasks, today]);

  const busyMembers = useMemo(() => {
    const set = new Set<string>();
    tasksActiveToday.forEach((task) => {
      const name = task.assignee ?? task.担当者;
      if (name) set.add(name);
    });
    return set;
  }, [tasksActiveToday]);

  const freeMembers = useMemo(() => {
    if (!people.length) return [] as string[];
    return people
      .map((person) => person.氏名)
      .filter((name): name is string => Boolean(name))
      .filter((name) => !busyMembers.has(name));
  }, [people, busyMembers]);

  const scheduleStats = useMemo(
    () => [
      {
        id: 'active_today',
        label: '進行中',
        value: `${tasksActiveToday.length} 件`,
        note: '本日進行中のタスク',
        tone: 'primary' as const,
      },
      {
        id: 'start_today',
        label: '今日開始',
        value: `${tasksStartingToday} 件`,
        note: '開始予定日が今日のタスク',
        tone: 'neutral' as const,
      },
      {
        id: 'due_today',
        label: '今日締切',
        value: `${tasksDueToday} 件`,
        note: '期限が今日のタスク',
        tone: tasksDueToday > 0 ? 'alert' : 'neutral',
      },
      {
        id: 'free_members',
        label: '空きメンバー',
        value: `${freeMembers.length} 人`,
        note: freeMembers.length ? freeMembers.slice(0, 3).join(' / ') + (freeMembers.length > 3 ? ` 他${freeMembers.length - 3}人` : '') : '全員アサイン済み',
        tone: freeMembers.length ? 'neutral' : 'primary',
      },
    ],
    [tasksActiveToday.length, tasksStartingToday, tasksDueToday, freeMembers]
  );

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (filtersProps.project !== 'all') {
      const label = filtersProps.projects.find((option) => option.value === filtersProps.project)?.label;
      if (label) chips.push(`プロジェクト: ${label}`);
    }
    if (filtersProps.assignee !== 'all') {
      const label = filtersProps.assignees.find((option) => option.value === filtersProps.assignee)?.label;
      if (label) chips.push(`担当: ${label}`);
    }
    if (filtersProps.status !== 'all') {
      chips.push(`ステータス: ${filtersProps.status}`);
    }
    if ((filtersProps.query ?? '').trim()) {
      chips.push(`検索: “${filtersProps.query.trim()}”`);
    }
    return chips;
  }, [filtersProps]);

  const ganttData = useMemo(() => {
    if (!filteredTasks.length) {
      return { data: [], ticks: [], min: 0, max: 0, minDate: null, maxDate: null, todayX: null };
    }

    const deriveProjectStatus = (tasks: Task[]) => {
      if (!tasks.length) return undefined;
      if (tasks.every((task) => task.ステータス === '完了')) return '完了';
      if (tasks.some((task) => task.ステータス === '進行中' || task.ステータス === '確認待ち')) return '進行中';
      if (tasks.some((task) => task.ステータス === '保留')) return '保留';
      if (tasks.some((task) => task.ステータス === '未着手')) return '未着手';
      return tasks[0]?.ステータス;
    };

    if (mode === 'projects') {
      const buckets: Record<
        string,
        {
          label: string;
          start: Date;
          end: Date;
          tasks: Task[];
        }
      > = {};

      filteredTasks.forEach((task) => {
        const start = parseDate(task.start ?? task.予定開始日);
        const end = parseDate(task.end ?? task.期限 ?? task.実績完了日) ?? start;
        if (!start) return;
        const label = projectMap[task.projectId]?.物件名 ?? task.projectId;
        if (!buckets[task.projectId]) {
          buckets[task.projectId] = { label, start, end: end ?? start, tasks: [] };
        }
        const bucket = buckets[task.projectId]!;
        bucket.tasks.push(task);
        if (start < bucket.start) bucket.start = start;
        if ((end ?? start) > bucket.end) bucket.end = end ?? start;
      });

      const items = Object.entries(buckets).map(([projectId, bucket]) => {
        const progress = bucket.tasks.length
          ? bucket.tasks.reduce((sum, task) => sum + computeProgress(task.progress, task.ステータス), 0) /
            bucket.tasks.length
          : 0;
        return {
          key: projectId,
          name: bucket.label,
          start: bucket.start,
          end: bucket.end,
          status: deriveProjectStatus(bucket.tasks),
          progress,
        };
      });

      return buildGantt(items, { timeScale });
    }

    if (mode === 'people') {
      const buckets: Record<
        string,
        {
          label: string;
          start: Date;
          end: Date;
          tasks: Task[];
        }
      > = {};

      filteredTasks.forEach((task) => {
        const start = parseDate(task.start ?? task.予定開始日);
        const end = parseDate(task.end ?? task.期限 ?? task.実績完了日) ?? start;
        if (!start) return;
        const assignee = task.assignee ?? task.担当者 ?? '未設定';
        if (!buckets[assignee]) {
          buckets[assignee] = { label: assignee || '未設定', start, end: end ?? start, tasks: [] };
        }
        const bucket = buckets[assignee]!;
        bucket.tasks.push(task);
        if (start < bucket.start) bucket.start = start;
        if ((end ?? start) > bucket.end) bucket.end = end ?? start;
      });

      const items = Object.entries(buckets).map(([assignee, bucket]) => {
        const progress = bucket.tasks.length
          ? bucket.tasks.reduce((sum, task) => sum + computeProgress(task.progress, task.ステータス), 0) /
            bucket.tasks.length
          : 0;
        return {
          key: `person:${assignee || '未設定'}`,
          name: bucket.label,
          start: bucket.start,
          end: bucket.end,
          status: deriveProjectStatus(bucket.tasks),
          progress,
        };
      });

      return buildGantt(items, { timeScale });
    }

    const items = filteredTasks
      .map((task): GanttItemInput | null => {
        const start = parseDate(task.start ?? task.予定開始日);
        const end = parseDate(task.end ?? task.期限 ?? task.実績完了日) ?? start;
        if (!start) return null;
        const assignee = task.assignee ?? task.担当者 ?? '未設定';
        return {
          key: task.id,
          name: `${task.タスク名 || '(無題)'} / ${assignee}`,
          start,
          end: end ?? start,
          status: task.ステータス,
          progress: computeProgress(task.progress, task.ステータス),
        };
      })
      .filter((item): item is GanttItemInput => Boolean(item));

    return buildGantt(items, { timeScale });
  }, [filteredTasks, mode, projectMap, timeScale]);

  const upcomingTasks = useMemo(() => {
    const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const items: {
      id: string;
      title: string;
      projectLabel: string;
      assignee: string;
      dueDate: Date;
      dueLabel: string;
      accent: 'danger' | 'warning' | 'neutral';
      status: string;
    }[] = [];

    filteredTasks.forEach((task) => {
      if (task.ステータス === '完了') return;
      const due = parseDate(task.end ?? task.期限 ?? task.実績完了日);
      if (!due) return;
      const daysUntil = Math.ceil((due.getTime() - anchor.getTime()) / DAY_MS);
      if (daysUntil > 21) return;
      const projectLabel = projectMap[task.projectId]?.物件名 ?? task.projectId;
      const assignee = task.assignee ?? task.担当者 ?? '未設定';
      let dueLabel: string;
      let accent: 'danger' | 'warning' | 'neutral' = 'neutral';
      if (daysUntil > 0) {
        dueLabel = `あと ${daysUntil} 日`;
        if (daysUntil <= 3) accent = 'warning';
      } else if (daysUntil === 0) {
        dueLabel = '本日締切';
        accent = 'warning';
      } else {
        dueLabel = `${Math.abs(daysUntil)} 日遅延`;
        accent = 'danger';
      }
      items.push({
        id: task.id,
        title: task.タスク名 || '(無題)',
        projectLabel,
        assignee,
        dueDate: due,
        dueLabel,
        accent,
        status: task.ステータス,
      });
    });

    return items
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 5);
  }, [filteredTasks, projectMap, today]);

  const timeScaleOptions: { value: TimeScale; label: string }[] = [
    { value: 'six_weeks', label: '6週間' },
    { value: 'quarter', label: '3か月' },
    { value: 'half_year', label: '半年' },
    { value: 'full', label: '全期間' },
    { value: 'auto', label: '自動' },
  ];

  const rangeLabel = ganttData.minDate && ganttData.maxDate
    ? `${formatDate(ganttData.minDate)} → ${formatDate(ganttData.maxDate)} · ${Math.max(
        1,
        Math.ceil((ganttData.maxDate.getTime() - ganttData.minDate.getTime()) / DAY_MS)
      )}日`
    : '期間付きデータがありません';

  const viewToggleClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition ${
      active ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`;

  const scaleToggleClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition ${
      active ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
    }`;

  const handleGanttInteraction = useCallback(
    (
      entry: GanttDatum,
      change: { startDate: Date; endDate: Date },
      kind: 'move' | 'resize-start' | 'resize-end'
    ) => {
      if (mode !== 'tasks') return;
      if (!onTaskDateChange) return;
      const startStr = formatDate(change.startDate);
      const endStr = formatDate(change.endDate);
      if (!startStr || !endStr) return;
      onTaskDateChange(entry.key, { start: startStr, end: endStr, kind });
    },
    [mode, onTaskDateChange]
  );

  return (
    <div className="space-y-4">
      {/* メインガントチャートエリア */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">スケジュール管理</h2>
            <p className="text-xs text-slate-500">
              {mode === 'projects'
                ? 'プロジェクト単位での期間を俯瞰します'
                : mode === 'people'
                ? '担当者ごとの稼働バランスを俯瞰します'
                : '担当付きタスクを横断して把握します'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowTaskModal(true)}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition"
            >
              + タスク追加
            </button>
            <button
              type="button"
              onClick={() => setShowProjectModal(true)}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              + プロジェクト追加
            </button>
          </div>
        </div>

        {/* コントロールバー */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">グルーピング</span>
            {(
              [
                { value: 'tasks' as const, label: 'タスクごと' },
                { value: 'projects' as const, label: 'プロジェクトごと' },
                { value: 'people' as const, label: '担当者ごと' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                className={viewToggleClass(mode === option.value)}
                onClick={() => setMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">期間スケール</span>
            {timeScaleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={scaleToggleClass(timeScale === option.value)}
                onClick={() => setTimeScale(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* ステータスと統計情報 */}
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-700">{todayLabel}</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600">進行中: {tasksActiveToday.length}件</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600">今日開始: {tasksStartingToday}件</span>
            <span className="text-slate-400">|</span>
            <span className={tasksDueToday > 0 ? 'font-semibold text-rose-600' : 'text-slate-600'}>
              今日締切: {tasksDueToday}件
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600">空きメンバー: {freeMembers.length}人</span>
          </div>
          <div className="ml-auto text-xs text-slate-500">
            表示: {ganttData.data.length}件 / 全{filteredTasks.length}件 · {rangeLabel}
          </div>
        </div>

        {/* フィルターと担当者パネル */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">絞り込み</h3>
              <span className="text-xs text-slate-500">対象: {filteredTasks.length} 件</span>
            </div>
            <div className="space-y-3">
              <Filters {...filtersProps} resultCount={undefined} />
              {activeFilterChips.length ? (
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  {activeFilterChips.map((chip) => (
                    <span key={chip} className="rounded-full bg-slate-100 px-2 py-1">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* 担当者パネル */}
          {mode === 'tasks' && people.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-700">担当者</h3>
                <p className="text-xs text-slate-500 mt-1">タスクにドラッグ&ドロップ</p>
              </div>
              <div className="space-y-2 max-h-[120px] overflow-y-auto">
                {people.map((person) => (
                  <div
                    key={person.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedAssignee(person.氏名 || '');
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={() => setDraggedAssignee(null)}
                    className="cursor-move rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition"
                  >
                    <div className="font-medium">{person.氏名}</div>
                    {person.部署 && <div className="text-xs text-slate-500">{person.部署}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ガントチャート */}
        <div className="mt-4 h-[calc(100vh-420px)] min-h-[600px] rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <GanttChartView
            data={ganttData.data}
            ticks={ganttData.ticks}
            min={ganttData.min}
            max={ganttData.max}
            minDate={ganttData.minDate}
            maxDate={ganttData.maxDate}
            todayX={ganttData.todayX}
            interactive={mode === 'tasks'}
            onChange={handleGanttInteraction}
            onAssigneeChange={(taskKey, assignee) => {
              if (mode === 'tasks' && onTaskAssigneeChange) {
                onTaskAssigneeChange(taskKey, assignee);
              }
            }}
            draggedAssignee={draggedAssignee}
          />
        </div>
      </section>

      {/* 近日の期限（コンパクト表示） */}
      {upcomingTasks.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">近日の期限</h2>
              <p className="text-xs text-slate-500">直近3週間の期限付きタスク</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {upcomingTasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3"
              >
                <div className="text-sm font-medium text-slate-800 line-clamp-1">{task.title}</div>
                <div className="text-[11px] text-slate-500 line-clamp-1">
                  {task.projectLabel} · {task.assignee}
                </div>
                <div
                  className={`text-xs font-semibold ${
                    task.accent === 'danger'
                      ? 'text-rose-600'
                      : task.accent === 'warning'
                      ? 'text-amber-600'
                      : 'text-slate-600'
                  }`}
                >
                  {task.dueLabel}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* モーダル */}
      {onTaskCreate && (
        <TaskModal
          open={showTaskModal}
          onOpenChange={setShowTaskModal}
          projects={projects}
          people={people}
          onSubmit={async (payload) => {
            await onTaskCreate(payload);
            setShowTaskModal(false);
          }}
        />
      )}
      {onProjectCreate && (
        <ProjectModal
          open={showProjectModal}
          onOpenChange={setShowProjectModal}
          onSubmit={async (payload) => {
            await onProjectCreate(payload);
            setShowProjectModal(false);
          }}
        />
      )}
    </div>
  );
}

interface GanttItemInput {
  key: string;
  name: string;
  start: Date;
  end: Date;
  status?: string;
  progress?: number;
}

interface BuildGanttOptions {
  timeScale?: TimeScale;
  today?: Date;
}

function buildGantt(items: GanttItemInput[], options: BuildGanttOptions = {}) {
  if (!items.length) {
    return { data: [], ticks: [], min: 0, max: 0, minDate: null, maxDate: null, todayX: null };
  }

  const { timeScale = 'auto', today = new Date() } = options;

  const sortedItems = items.slice().sort((a, b) => a.start.getTime() - b.start.getTime());

  let minDate = new Date(Math.min(...sortedItems.map((item) => item.start.getTime())));
  let maxDate = new Date(Math.max(...sortedItems.map((item) => item.end.getTime())));
  let relevantItems = sortedItems;

  const clampToWindow = (windowStart: Date, windowEnd: Date) => {
    const windowItems = sortedItems.filter((item) => item.end >= windowStart && item.start <= windowEnd);
    if (windowItems.length) {
      relevantItems = windowItems;
      minDate = windowStart;
      maxDate = windowEnd;
    }
  };

  if (timeScale === 'six_weeks') {
    const startWindow = new Date(today.getTime() - 7 * DAY_MS);
    const endWindow = new Date(startWindow.getTime() + 42 * DAY_MS);
    clampToWindow(startWindow, endWindow);
  } else if (timeScale === 'quarter') {
    const startWindow = new Date(today.getTime() - 14 * DAY_MS);
    const endWindow = new Date(startWindow.getTime() + 120 * DAY_MS);
    clampToWindow(startWindow, endWindow);
  } else if (timeScale === 'half_year') {
    const startWindow = new Date(today.getTime() - 30 * DAY_MS);
    const endWindow = new Date(startWindow.getTime() + 210 * DAY_MS);
    clampToWindow(startWindow, endWindow);
  } else if (timeScale === 'full') {
    const spanMs = maxDate.getTime() - minDate.getTime();
    const paddingDays = Math.max(7, Math.ceil(spanMs / DAY_MS / 20));
    minDate = new Date(minDate.getTime() - paddingDays * DAY_MS);
    maxDate = new Date(maxDate.getTime() + paddingDays * DAY_MS);
  }

  const spanDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / DAY_MS));
  const autoTickStep = spanDays > 240 ? 30 : spanDays > 60 ? 7 : 1;
  let tickStep = autoTickStep;

  switch (timeScale) {
    case 'six_weeks':
      tickStep = 1;
      break;
    case 'quarter':
      tickStep = 7;
      break;
    case 'half_year':
      tickStep = 14;
      break;
    case 'full':
      tickStep = Math.max(7, Math.ceil(spanDays / 10));
      break;
    default:
      tickStep = autoTickStep;
  }

  const ticks: number[] = [];
  for (let i = 0; i <= spanDays; i += tickStep) {
    ticks.push(i);
  }
  if (ticks[ticks.length - 1] !== spanDays) {
    ticks.push(spanDays);
  }

  const data: GanttDatum[] = relevantItems.map((item) => {
    const originalStart = item.start;
    const originalEnd = item.end;
    const clampedStart = originalStart < minDate ? minDate : originalStart;
    const clampedEnd = originalEnd > maxDate ? maxDate : originalEnd;
    const offset = Math.max(0, Math.floor((clampedStart.getTime() - minDate.getTime()) / DAY_MS));
    const duration = Math.max(1, Math.ceil((clampedEnd.getTime() - clampedStart.getTime()) / DAY_MS));
    const safeProgress = typeof item.progress === 'number' && !Number.isNaN(item.progress) ? item.progress : undefined;
    const totalDuration = Math.max(1, Math.ceil((originalEnd.getTime() - originalStart.getTime()) / DAY_MS));
    return {
      key: item.key,
      name: item.name,
      offset,
      duration,
      startLabel: formatDate(originalStart),
      endLabel: formatDate(originalEnd),
      startDate: new Date(originalStart.getTime()),
      endDate: new Date(originalEnd.getTime()),
      durationDays: totalDuration,
      status: item.status,
      progressRatio: safeProgress,
      isOverdue: originalEnd.getTime() < today.getTime() && item.status !== '完了',
    };
  });

  const todayX =
    today < minDate || today > maxDate ? null : Math.floor((today.getTime() - minDate.getTime()) / DAY_MS);

  return { data, ticks, min: 0, max: spanDays, minDate, maxDate, todayX };
}

function WorkloadPage({ filtersProps, tasks }: { filtersProps: FiltersProps; tasks: Task[] }) {
  const workload = useMemo(() => {
    const map: Record<string, { assignee: string; est: number; count: number }> = {};
    tasks.forEach((task) => {
      const key = task.assignee ?? task.担当者 ?? '未設定';
      if (!map[key]) map[key] = { assignee: key, est: 0, count: 0 };
      map[key].est += toNumber(task['工数見積(h)']);
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.est - a.est);
  }, [tasks]);

  return (
    <div className="space-y-4">
      <Filters {...filtersProps} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="h-[360px] rounded-2xl border border-slate-200 bg-white p-4">
            <WorkloadChart data={workload} />
          </div>
        </div>
        <div className="xl:col-span-1 space-y-3">
          {workload.map((item) => (
            <div key={item.assignee} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
              <div>
                <div className="font-medium text-slate-800">{item.assignee}</div>
                <div className="text-xs text-slate-500">タスク {item.count} 件</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-slate-900">{Math.round(item.est)}</div>
                <div className="text-xs text-slate-500">h</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkloadChart({ data }: { data: { assignee: string; est: number }[] }) {
  return (
    <WorkloadResponsiveContainer width="100%" height="100%">
      <WorkloadBarChart data={data} margin={{ left: 8, right: 16, top: 16, bottom: 16 }}>
        <WorkloadCartesianGrid vertical={false} strokeDasharray="3 3" />
        <WorkloadXAxis dataKey="assignee" tick={{ fontSize: 12 }} />
        <WorkloadYAxis />
        <WorkloadTooltip formatter={(value: number) => [`${Math.round(value)} h`, '工数']} />
        <WorkloadBar dataKey="est" radius={[6, 6, 0, 0]} fill="#0f172a" />
      </WorkloadBarChart>
    </WorkloadResponsiveContainer>
  );
}

function useRemoteData(setState: React.Dispatch<React.SetStateAction<CompassState>>, enabled: boolean) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const [p, t, pe] = await Promise.allSettled([listProjects(), listTasks({}), listPeople()]);
        if (p.status === 'fulfilled' && t.status === 'fulfilled' && pe.status === 'fulfilled') {
          const normalized = normalizeSnapshot({
            projects: p.value.projects,
            tasks: t.value.tasks,
            people: pe.value.people,
          });
          setState({
            projects: normalized.projects,
            tasks: normalized.tasks,
            people: normalized.people,
          });
        }
      } catch (err) {
        console.warn('Failed to load remote snapshot', err);
      } finally {
        setLoading(false);
      }
    };
    load();

    const handler = () => load();
    window.addEventListener('snapshot:reload', handler);
    return () => window.removeEventListener('snapshot:reload', handler);
  }, [setState, enabled]);

  return loading;
}

function App() {
  const [state, setState] = useSnapshot();
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const { user, authReady, authSupported, authError, signIn, signOut } = useFirebaseAuth();
  const loading = useRemoteData(setState, authSupported && Boolean(user));

  const [projectFilter, setProjectFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [projectSort, setProjectSort] = useState<ProjectSortKey>('due');

  const projectMap = useMemo(() => {
    const map: Record<string, Project> = {};
    state.projects.forEach((project) => {
      map[project.id] = project;
    });
    return map;
  }, [state.projects]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.tasks.filter((task) => {
      const projectMatch = projectFilter === 'all' || task.projectId === projectFilter;
      const assigneeMatch = assigneeFilter === 'all' || (task.assignee ?? task.担当者) === assigneeFilter;
      const statusMatch = statusFilter === 'all' || task.ステータス === statusFilter;
      const haystack = [
        task.id,
        task.タスク名,
        task.タスク種別,
        task.assignee,
        task.担当者,
        task.ステータス,
        projectMap[task.projectId]?.物件名,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const queryMatch = !query || haystack.includes(query);
      return projectMatch && assigneeMatch && statusMatch && queryMatch;
    });
  }, [state.tasks, projectFilter, assigneeFilter, statusFilter, search, projectMap]);

  const projectOptions = useMemo(
    () => [
      { value: 'all', label: 'すべてのプロジェクト' },
      ...state.projects.map((project) => ({ value: project.id, label: project.物件名 || project.id })),
    ],
    [state.projects]
  );

  const assigneeOptions = useMemo(() => {
    const names = new Set<string>();
    state.tasks.forEach((task) => {
      const value = task.assignee ?? task.担当者;
      if (value) names.add(value);
    });
    return [{ value: 'all', label: '全員' }, ...Array.from(names).map((name) => ({ value: name, label: name }))];
  }, [state.tasks]);

  const statusOptions = useMemo(() => {
    const statuses = new Set<string>();
    state.tasks.forEach((task) => {
      if (task.ステータス) statuses.add(task.ステータス);
    });
    return [{ value: 'all', label: '全て' }, ...Array.from(statuses).map((status) => ({ value: status, label: status }))];
  }, [state.tasks]);

  const hasActiveFilters =
    projectFilter !== 'all' || assigneeFilter !== 'all' || statusFilter !== 'all' || (search ?? '').trim() !== '';

  const resetFilters = () => {
    setProjectFilter('all');
    setAssigneeFilter('all');
    setStatusFilter('all');
    setSearch('');
  };

  const filtersProps: FiltersProps = {
    projects: projectOptions,
    assignees: assigneeOptions,
    statuses: statusOptions,
    project: projectFilter,
    assignee: assigneeFilter,
    status: statusFilter,
    query: search,
    onProjectChange: setProjectFilter,
    onAssigneeChange: setAssigneeFilter,
    onStatusChange: setStatusFilter,
    onQueryChange: setSearch,
    onReset: resetFilters,
    hasActiveFilters,
    resultCount: filteredTasks.length,
  };

  const projectsWithDerived: ProjectWithDerived[] = useMemo(() => {
    return state.projects.map((project) => {
      const relatedTasks = state.tasks.filter((task) => task.projectId === project.id);
      const openTaskCount = relatedTasks.filter((task) => task.ステータス !== '完了').length;
      const nearestDue = relatedTasks
        .map((task) => parseDate(task.end ?? task.期限 ?? task.実績完了日))
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      return {
        ...project,
        taskCount: relatedTasks.length,
        openTaskCount,
        nearestDue: nearestDue ? formatDate(nearestDue) : undefined,
      };
    });
  }, [state.projects, state.tasks]);

  const sortedProjects = useMemo(() => {
    const priorityWeight = (value?: string) => {
      switch (value) {
        case '高':
          return 0;
        case '中':
          return 1;
        case '低':
          return 2;
        default:
          return 3;
      }
    };

    const copy = [...projectsWithDerived];
    switch (projectSort) {
      case 'progress':
        copy.sort((a, b) => (a.progressAggregate ?? 0) - (b.progressAggregate ?? 0));
        break;
      case 'tasks':
        copy.sort((a, b) => (b.openTaskCount ?? 0) - (a.openTaskCount ?? 0));
        break;
      case 'priority':
        copy.sort((a, b) => priorityWeight(a.優先度) - priorityWeight(b.優先度));
        break;
      case 'due':
      default:
        copy.sort((a, b) => {
          const aDate = parseDate(a.nearestDue ?? a.予定完了日 ?? a.span?.end ?? null);
          const bDate = parseDate(b.nearestDue ?? b.予定完了日 ?? b.span?.end ?? null);
          if (aDate && bDate) return aDate.getTime() - bDate.getTime();
          if (aDate) return -1;
          if (bDate) return 1;
          return (a.物件名 || '').localeCompare(b.物件名 || '');
        });
        break;
    }
    return copy;
  }, [projectsWithDerived, projectSort]);

  const handleComplete = async (task: Task, done: boolean) => {
    try {
      await completeTask(task.id, done);
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (err) {
      console.error(err);
      alert('完了処理に失敗しました');
    }
  };

  const handleCreateTask = async (payload: {
    projectId: string;
    タスク名: string;
    担当者?: string;
    予定開始日?: string;
    期限?: string;
    優先度: string;
    ステータス: string;
    ['工数見積(h)']?: number;
    担当者メール?: string;
    '通知設定'?: TaskNotificationSettings;
  }) => {
    if (!user) {
      alert('Google アカウントでサインインしてください。');
      return;
    }
    try {
      await createTask(payload as unknown as Partial<Task>);
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error(error);
      alert('タスク追加に失敗しました。しばらくしてから再度お試しください。');
    }
  };

  const handleCreateProject = async (payload: {
    物件名: string;
    開始日?: string;
    予定完了日?: string;
    ステータス: string;
    優先度: string;
  }) => {
    if (!user) {
      alert('Google アカウントでサインインしてください。');
      return;
    }
    try {
      await createProject(payload as unknown as Partial<Project>);
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error(error);
      alert('プロジェクト追加に失敗しました。しばらくしてから再度お試しください。');
    }
  };

  const handleCreatePerson = async (payload: {
    氏名: string;
    役割?: string;
    メール?: string;
    電話?: string;
    '稼働時間/日(h)'?: number;
  }) => {
    if (!user) {
      alert('Google アカウントでサインインしてください。');
      return;
    }
    try {
      await createPerson(payload as unknown as Partial<Person>);
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error(error);
      alert('担当者追加に失敗しました。しばらくしてから再度お試しください。');
    }
  };

  const handleUpdateProject = async (projectId: string, payload: Partial<Project>) => {
    if (!user) {
      alert('Google アカウントでサインインしてください。');
      return;
    }
    try {
      await updateProject(projectId, payload);
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
      setEditingProject(null);
    } catch (error) {
      console.error(error);
      alert('プロジェクト更新に失敗しました。しばらくしてから再度お試しください。');
    }
  };

  const handleTaskAssigneeChange = useCallback(
    async (taskId: string, assignee: string) => {
      const previous = state.tasks.find((task) => task.id === taskId);
      if (!previous) return;
      const previousSnapshot = { ...previous };
      const updates = {
        assignee,
        担当者: assignee,
      } as Partial<Task>;

      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
      }));

      try {
        await updateTask(taskId, { 担当者: assignee });
        window.dispatchEvent(new CustomEvent('snapshot:reload'));
      } catch (error) {
        console.error(error);
        setState((current) => ({
          ...current,
          tasks: current.tasks.map((task) => (task.id === taskId ? previousSnapshot : task)),
        }));
        alert('担当者の変更に失敗しました。しばらくしてから再度お試しください。');
      }
    },
    [state.tasks]
  );

  const handleTaskDateChange = useCallback(
    async (
      taskId: string,
      payload: { start: string; end: string; kind: 'move' | 'resize-start' | 'resize-end' }
    ) => {
      const previous = state.tasks.find((task) => task.id === taskId);
      if (!previous) return;
      const previousSnapshot = { ...previous };
      const updates = {
        start: payload.start,
        end: payload.end,
        予定開始日: payload.start,
        期限: payload.end,
        duration_days: calculateDuration(payload.start, payload.end),
      } as Partial<Task>;

      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
      }));

      try {
        await moveTaskDates(taskId, { 予定開始日: payload.start, 期限: payload.end });
        window.dispatchEvent(new CustomEvent('snapshot:reload'));
      } catch (error) {
        console.error(error);
        setState((current) => ({
          ...current,
          tasks: current.tasks.map((task) => (task.id === taskId ? previousSnapshot : task)),
        }));
        alert('日付の更新に失敗しました。もう一度お試しください。');
      }
    },
    [setState, state.tasks]
  );

  const handleSeedReminders = useCallback(
    async (taskId: string) => {
      try {
        await seedTaskReminders(taskId);
        alert('通知ジョブを登録しました');
      } catch (error) {
        console.error(error);
        alert('通知ジョブの登録に失敗しました。もう一度お試しください。');
      }
    },
    []
  );

  const handleCalendarSync = useCallback(
    async (taskId: string) => {
      try {
        await syncTaskCalendar(taskId);
        alert('Google カレンダーへの同期をリクエストしました');
      } catch (error) {
        console.error(error);
        alert('カレンダー同期のリクエストに失敗しました。もう一度お試しください。');
      }
    },
    []
  );

  if (!authSupported) {
    return <AuthConfigMissingScreen />;
  }

  if (!authReady) {
    return <FullScreenLoader message="サインイン状態を確認しています..." />;
  }

  if (!user) {
    return <SignInScreen onSignIn={signIn} error={authError} />;
  }

  return (
    <>
      <AppLayout
        onOpenTask={() => setTaskModalOpen(true)}
        onOpenProject={() => setProjectModalOpen(true)}
        onOpenPerson={() => setPersonModalOpen(true)}
        user={user}
        authSupported={authSupported}
        authReady={authReady}
        onSignIn={signIn}
        onSignOut={signOut}
        authError={authError}
      >
        {loading ? <div className="pb-6 text-sm text-slate-500">同期中...</div> : null}
        <Routes>
          <Route
            path="/"
            element={
              <SchedulePage
                filtersProps={filtersProps}
                filteredTasks={filteredTasks}
                projectMap={projectMap}
                people={state.people}
                projects={state.projects}
                onTaskDateChange={handleTaskDateChange}
                onTaskCreate={handleCreateTask}
                onProjectCreate={handleCreateProject}
                onTaskAssigneeChange={handleTaskAssigneeChange}
              />
            }
          />
          <Route
            path="/summary"
            element={
              <DashboardPage
                projects={sortedProjects}
                filteredTasks={filteredTasks}
                filtersProps={filtersProps}
                onOpenTask={() => setTaskModalOpen(true)}
                onOpenProject={() => setProjectModalOpen(true)}
                onOpenPerson={() => setPersonModalOpen(true)}
                sortKey={projectSort}
                onSortChange={setProjectSort}
              />
            }
          />
          <Route
            path="/tasks"
            element={
              <TasksPage
                filtersProps={filtersProps}
                filteredTasks={filteredTasks}
                projectMap={projectMap}
                onComplete={handleComplete}
                onOpenTask={() => setTaskModalOpen(true)}
                onOpenProject={() => setProjectModalOpen(true)}
                onOpenPerson={() => setPersonModalOpen(true)}
                onSeedReminders={handleSeedReminders}
                onCalendarSync={handleCalendarSync}
              />
            }
          />
          <Route
            path="/gantt"
            element={
              <SchedulePage
                filtersProps={filtersProps}
                filteredTasks={filteredTasks}
                projectMap={projectMap}
                people={state.people}
                projects={state.projects}
                onTaskDateChange={handleTaskDateChange}
                onTaskCreate={handleCreateTask}
                onProjectCreate={handleCreateProject}
                onTaskAssigneeChange={handleTaskAssigneeChange}
              />
            }
          />
          <Route path="/workload" element={<WorkloadPage filtersProps={filtersProps} tasks={filteredTasks} />} />
        </Routes>
      </AppLayout>
      <TaskModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        projects={state.projects}
        people={state.people}
        onSubmit={handleCreateTask}
      />
      <ProjectModal open={projectModalOpen} onOpenChange={setProjectModalOpen} onSubmit={handleCreateProject} />
      <PersonModal open={personModalOpen} onOpenChange={setPersonModalOpen} onSubmit={handleCreatePerson} />
    </>
  );
}

export default App;
