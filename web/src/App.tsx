import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
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
  LogOut,
  X,
  Menu,
} from 'lucide-react';
import {
  listProjects,
  listTasks,
  listPeople,
  createTask,
  createProject,
  createPerson,
  updateProject,
  updatePerson,
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
import { GanttDatum } from './components/GanttChart';
import { GanttChart as NewGanttChart, GanttTask } from './components/GanttChart/GanttChart';
import { WorkerMonitor } from './components/WorkerMonitor';
import { Sidebar } from './components/Sidebar';
import { ToastStack, ToastMessage } from './components/ToastStack';
import { ProjectEditDialog } from './components/ProjectEditDialog';
import { PersonEditDialog } from './components/PersonEditDialog';
import ProjectMembersDialog from './components/ProjectMembersDialog';
import { InvitationNotifications } from './components/InvitationNotifications';
import { UserManagement } from './components/UserManagement';
import { formatDate, parseDate, todayString, DAY_MS, calculateDuration } from './lib/date';
import { normalizeSnapshot, SAMPLE_SNAPSHOT, toNumber } from './lib/normalize';
import type { Project, Task, Person, SnapshotPayload, TaskNotificationSettings } from './lib/types';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// 日本語ロケールを登録
registerLocale('ja', ja);
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

type ToastInput = {
  tone: ToastMessage['tone'];
  title: string;
  description?: string;
  duration?: number;
};

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
  canEdit,
  canSync,
  onExportSnapshot,
  onExportExcel,
  onImportSnapshot,
  onImportExcel,
  onNotify,
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
  canEdit: boolean;
  canSync: boolean;
  onExportSnapshot(): Promise<SnapshotPayload>;
  onExportExcel(): Promise<Blob>;
  onImportSnapshot(payload: SnapshotPayload): Promise<void>;
  onImportExcel(file: File): Promise<void>;
  onNotify(message: ToastInput): void;
}) {
  const navLinks = [
    { path: '/', label: '工程表' },
    { path: '/summary', label: 'サマリー' },
    { path: '/tasks', label: 'タスク' },
    { path: '/workload', label: '稼働状況' },
    { path: '/users', label: '人員管理' },
  ];
  const offline = !authSupported || !user;

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col lg:pl-64 min-h-0">
        <header className="flex-shrink-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2 lg:px-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="lg:ml-0">
                <h1 className="text-lg font-bold text-slate-900">APDW Project Compass</h1>
                <p className="text-xs text-slate-500">工程管理ダッシュボード - 全プロジェクト・タスクを横断管理</p>
              </div>
              <HeaderActions
                user={user}
                authSupported={authSupported}
                authReady={authReady}
                onSignIn={onSignIn}
                onSignOut={onSignOut}
                authError={authError}
                canSync={canSync}
                onExportSnapshot={onExportSnapshot}
                onExportExcel={onExportExcel}
                onImportSnapshot={onImportSnapshot}
                onImportExcel={onImportExcel}
                onNotify={onNotify}
              />
            </div>
            <nav className="flex flex-wrap gap-2">
              {navLinks.map((link) => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
          {!authSupported ? (
            <div className="bg-amber-50 text-amber-700">
              <div className="mx-auto max-w-6xl px-4 py-2 text-xs">Firebase Auth が未設定です。ローカルデータとして表示しています。</div>
            </div>
          ) : authReady && !user ? (
            <div className="bg-slate-900 text-slate-100">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2 text-xs">
                <span>Google でサインインすると、Firestore にリアルタイム同期されます。</span>
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
        {offline ? (
          <div className="flex-shrink-0 border-b border-slate-200 bg-slate-100/80">
            <div className="mx-auto max-w-7xl px-4 py-2 text-[11px] text-slate-600">ローカルモードで閲覧中です。編集内容はブラウザに保存されます。</div>
          </div>
        ) : null}
        <main className="flex-1 min-h-0 overflow-hidden mx-auto px-4 pb-4 pt-6 md:pt-8 lg:px-8 max-w-full">{children}</main>
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
          canEdit={canEdit}
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
  canSync,
  onExportSnapshot,
  onExportExcel,
  onImportSnapshot,
  onImportExcel,
  onNotify,
}: {
  user: User | null;
  authSupported: boolean;
  authReady: boolean;
  onSignIn(): void;
  onSignOut(): void;
  authError?: string | null;
  canSync: boolean;
  onExportSnapshot(): Promise<SnapshotPayload>;
  onExportExcel(): Promise<Blob>;
  onImportSnapshot(payload: SnapshotPayload): Promise<void>;
  onImportExcel(file: File): Promise<void>;
  onNotify(message: ToastInput): void;
}) {
  const [busy, setBusy] = useState(false);
  const jsonInputRef = React.useRef<HTMLInputElement | null>(null);
  const excelInputRef = React.useRef<HTMLInputElement | null>(null);

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportJson = async () => {
    try {
      setBusy(true);
      const snapshot = await onExportSnapshot();
      const payload: SnapshotPayload = {
        generated_at: snapshot.generated_at ?? todayString(),
        projects: snapshot.projects,
        tasks: snapshot.tasks,
        people: snapshot.people,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `compass_snapshot_${todayString()}.json`);
      onNotify({ tone: 'success', title: 'JSONをダウンロードしました' });
    } catch (error) {
      console.error(error);
      onNotify({ tone: 'error', title: 'JSONエクスポートに失敗しました' });
    } finally {
      setBusy(false);
    }
  };

  const handleExportExcel = async () => {
    if (!canSync) {
      onNotify({ tone: 'info', title: 'サインインするとExcel出力を利用できます' });
      return;
    }
    try {
      setBusy(true);
      const blob = await onExportExcel();
      downloadBlob(blob, `compass_export_${todayString()}.xlsx`);
      onNotify({ tone: 'success', title: 'Excelをダウンロードしました' });
    } catch (error) {
      console.error(error);
      onNotify({ tone: 'error', title: 'Excelエクスポートに失敗しました' });
    } finally {
      setBusy(false);
    }
  };

  const handleJsonSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      const parsed = JSON.parse(await file.text()) as SnapshotPayload;
      await onImportSnapshot(parsed);
      onNotify({ tone: 'success', title: 'JSONを読み込みました' });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error(error);
      onNotify({ tone: 'error', title: 'JSON読み込みに失敗しました' });
    } finally {
      event.target.value = '';
      setBusy(false);
    }
  };

  const handleExcelSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!canSync) {
      onNotify({ tone: 'info', title: 'サインインするとExcel読み込みを利用できます' });
      event.target.value = '';
      return;
    }
    try {
      setBusy(true);
      await onImportExcel(file);
      onNotify({ tone: 'success', title: 'Excelを読み込みました' });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error(error);
      onNotify({ tone: 'error', title: 'Excel読み込みに失敗しました' });
    } finally {
      event.target.value = '';
      setBusy(false);
    }
  };

  return (
    <div className="hidden items-center gap-2 md:flex">
      <button
        type="button"
        onClick={handleExportJson}
        className="flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
        disabled={busy}
      >
        <Download className="h-4 w-4" /> JSON
      </button>
      <button
        type="button"
        onClick={handleExportExcel}
        className="flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy || !canSync}
        title={!canSync ? 'サインインすると利用できます' : undefined}
      >
        <Download className="h-4 w-4" /> Excel
      </button>
      <input ref={jsonInputRef} type="file" accept="application/json" className="hidden" onChange={handleJsonSelected} />
      <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelSelected} />
      <button
        type="button"
        onClick={() => jsonInputRef.current?.click()}
        className="flex items-center gap-1 rounded-2xl bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
      >
        <FileJson className="h-4 w-4" /> JSON読み込み
      </button>
      <button
        type="button"
        onClick={() => excelInputRef.current?.click()}
        className="flex items-center gap-1 rounded-2xl bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy || !canSync}
        title={!canSync ? 'サインインすると利用できます' : undefined}
      >
        <FileSpreadsheet className="h-4 w-4" /> Excel読み込み
      </button>
      <div className="h-6 w-px bg-slate-200" />
      {authSupported && user && <InvitationNotifications />}
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
      {!canSync ? (
        <span className="text-[11px] font-semibold text-slate-400">ローカルモード</span>
      ) : null}
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
  canEdit,
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
  canEdit: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* 右上のログアウトボタン（モバイル） */}
      {authSupported && user && (
        <div className="fixed top-4 right-4 z-40 md:hidden">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-white border-2 border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-lg hover:bg-slate-50 transition-colors"
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4" />
            <span className="text-xs">ログアウト</span>
          </button>
        </div>
      )}

      {/* 開閉可能な追加ボタンメニュー（モバイル） */}
      <div className="md:hidden">
        {/* オーバーレイ */}
        {isOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/20"
            onClick={() => setIsOpen(false)}
          />
        )}

        {/* 追加ボタンメニュー */}
        <div
          className={`fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${
            isOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="px-4 py-4 space-y-4">
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">新規追加</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5 text-slate-600" />
              </button>
            </div>

            {/* サインインボタン */}
            {authSupported && !user && (
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                onClick={onSignIn}
                disabled={!authReady}
              >
                <LogIn className="h-5 w-5" />
                Googleでサインイン
              </button>
            )}

            {/* 追加ボタン */}
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-6 text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  onOpenTask();
                  setIsOpen(false);
                }}
                disabled={!canEdit}
              >
                <Plus className="h-6 w-6" />
                <span className="text-sm font-medium">タスク</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 bg-white px-4 py-6 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  onOpenProject();
                  setIsOpen(false);
                }}
                disabled={!canEdit}
              >
                <Plus className="h-6 w-6" />
                <span className="text-sm font-medium">プロジェクト</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 bg-white px-4 py-6 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  onOpenPerson();
                  setIsOpen(false);
                }}
                disabled={!canEdit}
              >
                <Plus className="h-6 w-6" />
                <span className="text-sm font-medium">担当者</span>
              </button>
            </div>

            {/* メッセージ */}
            {!canEdit && (
              <p className="text-center text-xs text-slate-500">
                編集はローカル表示のみです。サインインすると同期されます。
              </p>
            )}
            {authError && user && (
              <p className="text-center text-xs text-rose-600">{authError}</p>
            )}
          </div>
        </div>

        {/* フローティング開閉ボタン */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 text-white shadow-2xl hover:bg-slate-800 transition-all hover:scale-110"
        >
          {isOpen ? (
            <X className="h-7 w-7" />
          ) : (
            <Plus className="h-7 w-7" />
          )}
        </button>
      </div>
    </>
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
  editingTask?: Task | null;
  onSubmit(payload: {
    projectId: string;
    タスク名: string;
    担当者?: string;
    予定開始日?: string;
    期限?: string;
    マイルストーン?: boolean;
    優先度: string;
    ステータス: string;
    ['工数見積(h)']?: number;
    担当者メール?: string;
    '通知設定'?: TaskNotificationSettings;
  }): Promise<void>;
  onUpdate?(taskId: string, updates: Partial<Task>): Promise<void>;
  onNotify?(message: ToastInput): void;
}

function TaskModal({ open, onOpenChange, projects, people, editingTask, onSubmit, onUpdate, onNotify }: TaskModalProps) {
  const [project, setProject] = useState('');
  const [assignee, setAssignee] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [durationDays, setDurationDays] = useState<number>(1);
  const [priority, setPriority] = useState('中');
  const [status, setStatus] = useState('未着手');
  const [estimate, setEstimate] = useState(4);
  const [notifyStart, setNotifyStart] = useState(true);
  const [notifyDayBefore, setNotifyDayBefore] = useState(true);
  const [notifyDue, setNotifyDue] = useState(true);
  const [notifyOverdue, setNotifyOverdue] = useState(true);
  const [isMilestone, setIsMilestone] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (editingTask) {
      // 編集モード: タスクデータをフォームにセット
      setProject(editingTask.projectId);
      setAssignee(editingTask.担当者 || editingTask.assignee || '');
      setAssigneeEmail(editingTask.担当者メール || '');
      setName(editingTask.タスク名);

      // 日付の設定
      const startDateValue = editingTask.予定開始日 || editingTask.start;
      const endDateValue = editingTask.期限 || editingTask.end;
      setStartDate(startDateValue ? new Date(startDateValue) : null);
      setEndDate(endDateValue ? new Date(endDateValue) : null);

      // 期間の計算
      if (startDateValue && endDateValue) {
        const start = new Date(startDateValue);
        const end = new Date(endDateValue);
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        setDurationDays(diffDays > 0 ? diffDays : 1);
      }

      setPriority(editingTask.優先度 || '中');
      setStatus(editingTask.ステータス || '未着手');
      setEstimate(editingTask['工数見積(h)'] || 4);

      // 通知設定
      const notif = editingTask['通知設定'];
      setNotifyStart(notif?.開始日 ?? true);
      setNotifyDayBefore(notif?.期限前日 ?? true);
      setNotifyDue(notif?.期限当日 ?? true);
      setNotifyOverdue(notif?.超過 ?? true);

      // マイルストーン
      const milestoneValue = editingTask['マイルストーン'] === true || editingTask['milestone'] === true;
      console.log('[TaskModal] Loading milestone value:', {
        'マイルストーン': editingTask['マイルストーン'],
        'milestone': editingTask['milestone'],
        'computed': milestoneValue,
        'taskId': editingTask.id,
        'taskName': editingTask.タスク名
      });
      setIsMilestone(milestoneValue);
    } else {
      // 新規作成モード: フォームをクリア
      setProject('');
      setAssignee('');
      setAssigneeEmail('');
      setName('');
      setStartDate(null);
      setEndDate(null);
      setPriority('中');
      setStatus('未着手');
      setEstimate(4);
      setNotifyStart(true);
      setNotifyDayBefore(true);
      setNotifyDue(true);
      setNotifyOverdue(true);
      setIsMilestone(false);
      setDurationDays(1);
    }
  }, [open, editingTask]);

  useEffect(() => {
    if (!assignee) {
      setAssigneeEmail('');
      return;
    }
    const person = people.find((p) => p.氏名 === assignee);
    setAssigneeEmail(person?.メール ?? '');
  }, [assignee, people]);

  // マイルストーン用の日付変更ハンドラ
  const handleMilestoneDateChange = (date: Date | null) => {
    setStartDate(date);
    setEndDate(date);
  };

  // 通常タスク用の日付範囲変更ハンドラ
  const handleRangeDateChange = (dates: [Date | null, Date | null]) => {
    const [start, end] = dates;
    setStartDate(start);
    setEndDate(end);

    // 期間を計算
    if (start && end) {
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      setDurationDays(diffDays > 0 ? diffDays : 1);

      // 1日以上の範囲が選択された場合、マイルストーンを解除
      if (start.getTime() !== end.getTime() && isMilestone) {
        setIsMilestone(false);
      }
    }
  };

  // マイルストーンチェックボックスが有効かどうかを判定
  const isMilestoneCheckboxEnabled = startDate && endDate && startDate.getTime() === endDate.getTime();

  // 期間変更時に終了日を再計算
  const handleDurationChange = (days: number) => {
    setDurationDays(days);
    if (startDate && days > 0) {
      const newEndDate = new Date(startDate);
      newEndDate.setDate(startDate.getDate() + days - 1);
      setEndDate(newEndDate);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[TaskModal] handleSubmit - isMilestone state:', isMilestone);
    try {
      const payload = {
        projectId: project,
        タスク名: name,
        担当者: assignee,
        予定開始日: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
        期限: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
        優先度: priority,
        ステータス: status,
        ['工数見積(h)']: estimate,
        担当者メール: assigneeEmail || undefined,
        マイルストーン: isMilestone,
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
        マイルストーン?: boolean;
        優先度: string;
        ステータス: string;
        ['工数見積(h)']?: number;
        担当者メール?: string;
        '通知設定'?: TaskNotificationSettings;
      };

      if (editingTask && onUpdate) {
        // 編集モード
        console.log('[TaskModal] Updating task with payload:', payload);
        await onUpdate(editingTask.id, payload);
      } else {
        // 新規作成モード
        console.log('[TaskModal] Creating task with payload:', payload);
        await onSubmit(payload);
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      onNotify?.({ tone: 'error', title: editingTask ? 'タスクの更新に失敗しました' : 'タスクの追加に失敗しました' });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={editingTask ? "タスク編集" : "タスク追加"}>
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

        {/* マイルストーンチェックボックス */}
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${
          isMilestoneCheckboxEnabled
            ? 'bg-red-50 border-red-200'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <input
            type="checkbox"
            id="milestone"
            checked={isMilestone}
            disabled={!isMilestoneCheckboxEnabled}
            onChange={(e) => {
              console.log('[TaskModal] Milestone checkbox changed to:', e.target.checked);
              setIsMilestone(e.target.checked);
              // チェックされたら、既に開始日が入力されている場合は終了日を同じにする
              if (e.target.checked && startDate) {
                setEndDate(startDate);
              }
            }}
            className={`w-4 h-4 rounded focus:ring-red-500 ${
              isMilestoneCheckboxEnabled
                ? 'text-red-600 cursor-pointer'
                : 'text-gray-400 cursor-not-allowed'
            }`}
          />
          <label
            htmlFor="milestone"
            className={`text-sm font-medium ${
              isMilestoneCheckboxEnabled
                ? 'text-red-900 cursor-pointer'
                : 'text-gray-400 cursor-not-allowed'
            }`}
          >
            ◆ マイルストーン（現場立ち合い・引渡し前確認など重要な1日の予定）
            {!isMilestoneCheckboxEnabled && (
              <span className="block text-xs mt-1">※ 1日だけの予定を選択するとマイルストーンに設定できます</span>
            )}
          </label>
        </div>

        {/* 日付選択 */}
        <div className="bg-white rounded-xl border-2 border-blue-200 p-4 hover:border-blue-300 transition-colors">
          <label className="block text-sm font-semibold text-slate-700 mb-3">
            {isMilestone ? '◆ 実施日' : '作業期間'}
          </label>
          {isMilestone ? (
            <DatePicker
              selected={startDate}
              onChange={handleMilestoneDateChange}
              locale="ja"
              dateFormat="yyyy年MM月dd日"
              className="w-full text-sm font-medium border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholderText="実施日を選択"
              inline
            />
          ) : (
            <DatePicker
              selected={startDate}
              onChange={handleRangeDateChange}
              startDate={startDate}
              endDate={endDate}
              selectsRange
              locale="ja"
              dateFormat="yyyy年MM月dd日"
              className="w-full text-sm font-medium border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholderText="開始日と終了日を選択"
              inline
            />
          )}
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
    現地調査日?: string;
    着工日?: string;
    竣工予定日?: string;
    ステータス: string;
    優先度: string;
  }): Promise<void>;
  onNotify?(message: ToastInput): void;
}

function ProjectModal({ open, onOpenChange, onSubmit, onNotify }: ProjectModalProps) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [surveyDate, setSurveyDate] = useState('');
  const [constructionStart, setConstructionStart] = useState('');
  const [completionDate, setCompletionDate] = useState('');
  const [status, setStatus] = useState('計画中');
  const [priority, setPriority] = useState('中');

  useEffect(() => {
    if (!open) return;
    setName('');
    setStart('');
    setDue('');
    setSurveyDate('');
    setConstructionStart('');
    setCompletionDate('');
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
        現地調査日: surveyDate,
        着工日: constructionStart,
        竣工予定日: completionDate,
        ステータス: status,
        優先度: priority,
      });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      onNotify?.({ tone: 'error', title: 'プロジェクトの追加に失敗しました' });
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
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700">スケジュール</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">開始日</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">予定完了日</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>
          <div className="text-sm font-semibold text-slate-700 pt-2">マイルストーン</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">現地調査日</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={surveyDate}
                onChange={(e) => setSurveyDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">着工日</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={constructionStart}
                onChange={(e) => setConstructionStart(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">竣工予定日</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
              />
            </div>
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
  onNotify?(message: ToastInput): void;
}

function PersonModal({ open, onOpenChange, onSubmit, onNotify }: PersonModalProps) {
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
      onNotify?.({ tone: 'error', title: '担当者の追加に失敗しました' });
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
  onEditProject,
  sortKey,
  onSortChange,
  canEdit,
  canSync,
  setManagingMembersProject,
}: {
  projects: ProjectWithDerived[];
  filteredTasks: Task[];
  filtersProps: FiltersProps;
  onOpenTask(): void;
  onOpenProject(): void;
  onOpenPerson(): void;
  onEditProject(project: ProjectWithDerived): void;
  sortKey: ProjectSortKey;
  onSortChange(value: ProjectSortKey): void;
  canEdit: boolean;
  canSync: boolean;
  setManagingMembersProject: (project: Project | null) => void;
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
              className="hidden items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 md:flex"
              onClick={onOpenTask}
              disabled={!canEdit}
              title={!canEdit ? '現在は変更できません' : undefined}
            >
              <Plus className="h-4 w-4" /> タスク追加
            </button>
            <button
              type="button"
              className="hidden items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 md:flex"
              onClick={onOpenProject}
              disabled={!canEdit}
              title={!canEdit ? '現在は変更できません' : undefined}
            >
              <Plus className="h-4 w-4" /> プロジェクト追加
            </button>
            <button
              type="button"
              className="hidden items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 md:flex"
              onClick={onOpenPerson}
              disabled={!canEdit}
              title={!canEdit ? '現在は変更できません' : undefined}
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
                    onClick={() => onEditProject(project)}
                    onManageMembers={canSync ? () => setManagingMembersProject(project) : undefined}
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
  onTaskUpdate: updateTask,
  onOpenTask,
  onOpenProject,
  onOpenPerson,
  onEditTask,
  onSeedReminders,
  onCalendarSync,
  canEdit,
  canSync,
}: {
  filtersProps: FiltersProps;
  filteredTasks: Task[];
  projectMap: Record<string, Project>;
  onComplete(task: Task, done: boolean): void;
  onTaskUpdate(taskId: string, updates: Partial<Task>): void;
  onOpenTask(): void;
  onOpenProject(): void;
  onOpenPerson(): void;
  onEditTask(task: Task): void;
  onSeedReminders?(taskId: string): Promise<void>;
  onCalendarSync?(taskId: string): Promise<void>;
  canEdit: boolean;
  canSync: boolean;
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
      <WorkerMonitor tasks={filteredTasks} canSync={canSync} />
      {!canSync ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] text-slate-500">
          通知・カレンダー連携はサインイン後にご利用いただけます。
        </div>
      ) : null}
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <Filters {...filtersProps} />
        <div className="hidden gap-2 md:flex">
          <button
            type="button"
            className="flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onOpenTask}
            disabled={!canEdit}
          >
            <Plus className="h-4 w-4" /> タスク追加
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onOpenProject}
            disabled={!canEdit}
          >
            <Plus className="h-4 w-4" /> プロジェクト追加
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onOpenPerson}
            disabled={!canEdit}
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
          onRowClick={(id) => {
            const task = filteredTasks.find((t) => t.id === id);
            if (task) onEditTask(task);
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
  onTaskAssigneeChange,
  onTaskUpdate,
  onOpenTask,
  onOpenProject,
  onOpenPerson,
  onEditPerson,
  pushToast,
  setState,
  canEdit,
  canSync,
}: {
  filtersProps: FiltersProps;
  filteredTasks: Task[];
  projectMap: Record<string, Project>;
  people: Person[];
  projects: Project[];
  onTaskDateChange?: (taskId: string, payload: { start: string; end: string; kind: 'move' | 'resize-start' | 'resize-end' }) => void;
  onTaskAssigneeChange?: (taskId: string, assignee: string) => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
  onOpenTask(): void;
  onOpenProject(): void;
  onOpenPerson(): void;
  onEditPerson(person: Person): void;
  pushToast: (toast: ToastInput) => void;
  setState: React.Dispatch<React.SetStateAction<CompassState>>;
  canEdit: boolean;
  canSync: boolean;
}) {
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

  // 新しいGanttChartのためのデータ変換
  const newGanttTasks = useMemo((): GanttTask[] => {
    // プロジェクトごとの進捗率を計算
    const projectProgressMap: Record<string, number> = {};
    filteredTasks.forEach((task) => {
      const projectId = task.projectId;
      if (!projectProgressMap[projectId]) {
        // このプロジェクトの全タスクを取得
        const projectTasks = filteredTasks.filter((t) => t.projectId === projectId);
        const completedTasks = projectTasks.filter((t) => t.ステータス === '完了').length;
        const totalTasks = projectTasks.length;
        projectProgressMap[projectId] = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      }
    });

    const tasks = filteredTasks
      .filter((task) => {
        const startDate = task.start || task.予定開始日;
        const endDate = task.end || task.期限;
        return startDate && endDate;
      })
      .map((task): GanttTask | null => {
        const startDateStr = task.start || task.予定開始日 || '';
        const endDateStr = task.end || task.期限 || '';
        const startDate = parseDate(startDateStr);
        const endDate = parseDate(endDateStr);

        // nullチェック
        if (!startDate || !endDate) {
          return null;
        }

        const project: Project | undefined = projectMap[task.projectId];
        const assignee = task.assignee || task.担当者 || '未設定';

        // ステータスを変換
        let status: GanttTask['status'] = 'not_started';
        if (task.ステータス === '完了') status = 'completed';
        else if (task.ステータス === '進行中') status = 'in_progress';
        else if (task.ステータス === '保留') status = 'on_hold';
        else if (task.ステータス === '未着手') status = 'not_started';
        else if (task.ステータス === '確認待ち') status = 'in_progress';

        // 今日の日付（時刻を0時0分0秒にリセット）
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 開始日（時刻を0時0分0秒にリセット）
        const startDateOnly = new Date(startDate);
        startDateOnly.setHours(0, 0, 0, 0);

        // 着手日（開始日）が今日以前で未着手の場合、自動的に進行中に変更
        if (status === 'not_started' && startDateOnly <= today) {
          status = 'in_progress';
        }

        // 期限超過チェック
        const isOverdue = endDate < today && status !== 'completed';
        if (isOverdue) {
          status = 'overdue';
        }

        // プロジェクト全体の進捗率を使用
        const progress = projectProgressMap[task.projectId] || 0;

        // マイルストーンフラグが明示的にtrueの場合のみマイルストーンとして扱う
        const isMilestone = task['マイルストーン'] === true || task['milestone'] === true;

        return {
          id: task.id,
          name: task.タスク名 || '（無題）',
          startDate,
          endDate,
          assignee,
          progress,
          status,
          projectId: task.projectId,
          projectName: project?.物件名 || '（プロジェクト名なし）',
          dependencies: task['依存タスク'] || [],
          milestone: isMilestone,
        };
      })
      .filter((task): task is GanttTask => task !== null);

    // プロジェクトごとにグループ化し、プロジェクトの竣工予定日順にソート
    const projectGroups = new Map<string, GanttTask[]>();
    tasks.forEach(task => {
      if (!projectGroups.has(task.projectId)) {
        projectGroups.set(task.projectId, []);
      }
      projectGroups.get(task.projectId)!.push(task);
    });

    // 各プロジェクト内のタスクを開始日順にソート（安定化：開始日→終了日→タスク名→ID）
    projectGroups.forEach((projectTasks) => {
      projectTasks.sort((a, b) => {
        // 開始日で比較
        const startDiff = a.startDate.getTime() - b.startDate.getTime();
        if (startDiff !== 0) return startDiff;

        // 終了日で比較
        const endDiff = a.endDate.getTime() - b.endDate.getTime();
        if (endDiff !== 0) return endDiff;

        // タスク名で比較
        const nameA = a.name || '';
        const nameB = b.name || '';
        const nameDiff = nameA.localeCompare(nameB);
        if (nameDiff !== 0) return nameDiff;

        // IDで比較
        return a.id.localeCompare(b.id);
      });
    });

    // プロジェクトを竣工予定日順にソート（安定化：竣工予定日→プロジェクト名→ID）
    const sortedProjects = Array.from(projectGroups.keys()).sort((a, b) => {
      const projectA = projectMap[a];
      const projectB = projectMap[b];

      const completionDateA = projectA?.竣工予定日 ? parseDate(projectA.竣工予定日) : null;
      const completionDateB = projectB?.竣工予定日 ? parseDate(projectB.竣工予定日) : null;

      // 竣工予定日で比較（日付なしは最後）
      const dateA = completionDateA ? completionDateA.getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = completionDateB ? completionDateB.getTime() : Number.MAX_SAFE_INTEGER;

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      // プロジェクト名で比較
      const nameA = projectA?.物件名 || '';
      const nameB = projectB?.物件名 || '';
      const nameDiff = nameA.localeCompare(nameB);
      if (nameDiff !== 0) return nameDiff;

      // IDで比較
      return a.localeCompare(b);
    });

    // プロジェクト順に結合
    const sortedTasks: GanttTask[] = [];
    sortedProjects.forEach(projectId => {
      sortedTasks.push(...projectGroups.get(projectId)!);
    });

    return sortedTasks;
  }, [filteredTasks, projectMap]);

  return (
    <div className="h-full flex flex-col gap-2 min-h-0">
      {/* 極小ヘッダー - フィルター統合 */}
      <section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm flex-shrink-0">
        <div className="flex flex-col gap-1.5">
          {/* タイトル、フィルター、ボタンを1行に */}
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800 whitespace-nowrap">スケジュール</h2>
            <div className="flex-1 min-w-0">
              <Filters {...filtersProps} resultCount={undefined} />
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={onOpenTask}
                disabled={!canEdit}
                className="rounded px-2 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                title={!canEdit ? 'ローカル閲覧中は追加できません' : undefined}
              >
                +タスク
              </button>
              <button
                type="button"
                onClick={onOpenProject}
                disabled={!canEdit}
                className="rounded px-2 py-1 text-xs font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
                title={!canEdit ? 'ローカル閲覧中は追加できません' : undefined}
              >
                +PJ
              </button>
            </div>
          </div>

          {/* 統計情報を1行にコンパクト化 */}
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-medium">{todayLabel}</span>
            <span className="text-slate-300">|</span>
            <span>進行中:{tasksActiveToday.length}</span>
            <span className="text-slate-300">|</span>
            <span>今日開始:{tasksStartingToday}</span>
            <span className="text-slate-300">|</span>
            <span className={tasksDueToday > 0 ? 'font-medium text-rose-600' : ''}>
              締切:{tasksDueToday}
            </span>
            <span className="text-slate-300">|</span>
            <span>空き:{freeMembers.length}人</span>
            <span className="ml-auto text-slate-500">{newGanttTasks.length}件</span>
          </div>
        </div>
      </section>

      {/* 予定開始日がないタスクの警告 - 極小化 */}
      {filteredTasks.some(task => !task.start && !task.予定開始日) && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 flex items-center gap-1.5 flex-shrink-0">
          <svg className="h-3 w-3 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-xs text-amber-800">
            {filteredTasks.filter(task => !task.start && !task.予定開始日).length}件が開始日未設定
          </p>
        </div>
      )}

      {/* ガントチャート - 利用可能な高さいっぱいに表示 */}
      <section
        className="flex-1 min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
      >
        <NewGanttChart
          tasks={newGanttTasks}
          interactive={true}
          projectMap={projectMap}
          people={people}
          onTaskClick={(task) => {
            // タスククリックで編集モーダルを開く
            // Gantt内のモーダルが開くので、ここでは何もしない
          }}
          onTaskToggleComplete={(task) => {
            // チェックボックスで完了状態をトグル
            const isCompleted = task.status === 'completed';
            const newStatus = isCompleted ? '進行中' : '完了';
            if (onTaskUpdate) {
              onTaskUpdate(task.id, { ステータス: newStatus });
            }
          }}
          onTaskUpdate={(task, newStartDate, newEndDate) => {
            const startStr = formatDate(newStartDate);
            const endStr = formatDate(newEndDate);
            if (!startStr || !endStr) return;
            onTaskDateChange?.(task.id, {
              start: startStr,
              end: endStr,
              kind: 'move',
            });
          }}
            onTaskCopy={(task, newStartDate, newEndDate) => {
              // タスクコピー処理
              const originalTask = filteredTasks.find(t => t.id === task.id);
              if (originalTask) {
                const startStr = formatDate(newStartDate);
                const endStr = formatDate(newEndDate);
                if (startStr && endStr) {
                  // 新しいタスクのデータを作成
                  const newTaskData: Partial<Task> = {
                    タスク名: `${originalTask.タスク名} (コピー)`,
                    予定開始日: startStr,
                    期限: endStr,
                    担当者: originalTask.担当者 || originalTask.assignee,
                    ステータス: '未着手',
                    projectId: originalTask.projectId,
                  };

                  // ローカルモードの場合
                  if (!canSync) {
                    const newTask: Task = {
                      ...originalTask,
                      ...newTaskData,
                      id: `local-task-copy-${Date.now()}`,
                      createdAt: todayString(),
                      updatedAt: todayString(),
                    };
                    setState((current) => ({
                      ...current,
                      tasks: [...current.tasks, newTask],
                    }));
                    pushToast({ tone: 'success', title: 'タスクをコピーしました（ローカル保存）' });
                    return;
                  }

                  // サーバーに保存
                  console.log('Copying task with data:', newTaskData);
                  pushToast({ tone: 'info', title: 'タスクをコピー中...', description: 'サーバー連携機能は未実装です' });
                }
              }
            }}
            onTaskSave={(updatedTask) => {
              // モーダルからのタスク保存処理
              console.log('onTaskSave called with:', updatedTask);

              // ステータスを日本語に変換
              let statusJa = '未着手';
              if (updatedTask.status === 'completed') statusJa = '完了';
              else if (updatedTask.status === 'in_progress') statusJa = '進行中';
              else if (updatedTask.status === 'on_hold') statusJa = '保留';
              else if (updatedTask.status === 'overdue') statusJa = '進行中'; // 期限超過は進行中として保存

              const updates: Partial<Task> = {
                タスク名: updatedTask.name,
                予定開始日: formatDate(updatedTask.startDate),
                期限: formatDate(updatedTask.endDate),
                担当者: updatedTask.assignee,
                担当者メール: updatedTask.assigneeEmail || '', // 担当者メールも保存
                ステータス: statusJa,
                進捗率: updatedTask.progress,
                '依存タスク': updatedTask.dependencies || [],
              };

              console.log('Updates to apply:', updates);

              // onTaskUpdateコールバックに委譲
              if (onTaskUpdate) {
                onTaskUpdate(updatedTask.id, updates);
              }
            }}
          />
      </section>
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
  projectLabel?: string;
  assigneeLabel?: string;
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
  
  // 日付ラベルの重なりを防ぐため、期間に応じてより広い間隔を設定
  const autoTickStep = 
    spanDays > 365 ? 60 :  // 1年以上 → 60日間隔
    spanDays > 180 ? 30 :  // 半年以上 → 30日間隔
    spanDays > 90 ? 14 :   // 3ヶ月以上 → 14日間隔
    spanDays > 60 ? 7 :    // 2ヶ月以上 → 7日間隔
    spanDays > 30 ? 3 :    // 1ヶ月以上 → 3日間隔
    1;                     // 1ヶ月以下 → 1日間隔
  
  let tickStep = autoTickStep;

  switch (timeScale) {
    case 'six_weeks':
      tickStep = 3;  // 6週間表示では3日間隔
      break;
    case 'quarter':
      tickStep = 7;  // 四半期表示では7日間隔
      break;
    case 'half_year':
      tickStep = 14; // 半年表示では14日間隔
      break;
    case 'full':
      tickStep = Math.max(14, Math.ceil(spanDays / 15)); // 全期間表示では最低14日間隔
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
      projectLabel: item.projectLabel,
      assigneeLabel: item.assigneeLabel,
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
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState<'create' | 'edit'>('create');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [managingMembersProject, setManagingMembersProject] = useState<Project | null>(null);
  const { user, authReady, authSupported, authError, signIn, signOut } = useFirebaseAuth();
  const toastTimers = useRef<Map<string, number>>(new Map());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timers = toastTimers.current;
    const timer = timers.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.delete(id);
    }
  }, []);

  const pushToast = useCallback((toast: ToastInput) => {
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [
      ...prev,
      { id, tone: toast.tone, title: toast.title, description: toast.description },
    ]);
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      const timer = window.setTimeout(() => {
        dismissToast(id);
      }, duration);
      toastTimers.current.set(id, timer);
    }
  }, [dismissToast]);

  useEffect(() => {
    return () => {
      toastTimers.current.forEach((timer: number) => window.clearTimeout(timer));
      toastTimers.current.clear();
    };
  }, []);

  const loading = useRemoteData(setState, authSupported && Boolean(user));

  const canSync = authSupported && Boolean(user);
  const canEdit = true;
  const generateLocalId = useCallback((prefix: string) => {
    return `local-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }, []);

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
      const progressAggregate = relatedTasks.length
        ? relatedTasks.reduce((sum, task) => sum + computeProgress(task.progress, task.ステータス), 0) / relatedTasks.length
        : 0;
      return {
        ...project,
        taskCount: relatedTasks.length,
        openTaskCount,
        nearestDue: nearestDue ? formatDate(nearestDue) : undefined,
        progressAggregate,
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
    if (!canSync) {
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === task.id
            ? {
                ...item,
                ステータス: done ? '完了' : item.ステータス === '完了' ? '進行中' : item.ステータス,
                progress: done ? 1 : item.progress ?? 0,
                updatedAt: todayString(),
              }
            : item
        ),
      }));
      pushToast({
        tone: 'success',
        title: done ? 'タスクを完了にしました（ローカル保存）' : 'タスクを再オープンしました（ローカル保存）',
      });
      return;
    }
    try {
      await completeTask(task.id, done);
      pushToast({
        tone: 'success',
        title: done ? 'タスクを完了にしました' : 'タスクを再オープンしました',
      });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (err) {
      console.error(err);
      pushToast({ tone: 'error', title: '完了処理に失敗しました' });
    }
  };

  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    if (!canSync) {
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId
            ? { ...task, ...updates, updatedAt: todayString() }
            : task
        ),
      }));
      pushToast({ tone: 'success', title: 'タスクを更新しました（ローカル保存）' });
      return;
    }
    try {
      await updateTask(taskId, updates);
      pushToast({ tone: 'success', title: 'タスクを更新しました' });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (err) {
      console.error('Task update error:', err);
      pushToast({ tone: 'error', title: 'タスクの更新に失敗しました', description: String(err) });
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
    if (!payload.projectId) {
      pushToast({ tone: 'error', title: 'プロジェクトを選択してください' });
      return;
    }
    if (!canSync) {
      const id = generateLocalId('task');
      const now = todayString();
      const newTask: Task = {
        id,
        projectId: payload.projectId,
        タスク名: payload.タスク名,
        担当者: payload.担当者,
        assignee: payload.担当者,
        担当者メール: payload.担当者メール,
        ステータス: payload.ステータス,
        優先度: payload.優先度,
        予定開始日: payload.予定開始日,
        期限: payload.期限,
        start: payload.予定開始日,
        end: payload.期限,
        ['工数見積(h)']: payload['工数見積(h)'],
        '通知設定': payload['通知設定'],
        progress: 0,
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        tasks: [...prev.tasks, newTask],
      }));
      pushToast({ tone: 'success', title: 'タスクを追加しました（ローカル保存）' });
      return;
    }
    try {
      await createTask(payload as unknown as Partial<Task>);
      pushToast({ tone: 'success', title: 'タスクを追加しました' });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error(error);
      pushToast({ tone: 'error', title: 'タスクの追加に失敗しました' });
    }
  };

  const handleCreateProject = async (payload: {
    物件名: string;
    開始日?: string;
    予定完了日?: string;
    ステータス: string;
    優先度: string;
  }) => {
    if (!payload.物件名.trim()) {
      pushToast({ tone: 'error', title: '物件名を入力してください' });
      return;
    }
    if (!canSync) {
      const id = generateLocalId('project');
      const now = todayString();
      const newProject: Project = {
        id,
        物件名: payload.物件名,
        ステータス: payload.ステータス,
        優先度: payload.優先度,
        開始日: payload.開始日,
        予定完了日: payload.予定完了日,
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        projects: [...prev.projects, newProject],
      }));
      pushToast({ tone: 'success', title: 'プロジェクトを追加しました（ローカル保存）' });
      return;
    }
    try {
      await createProject(payload as unknown as Partial<Project>);
      pushToast({ tone: 'success', title: 'プロジェクトを追加しました' });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error(error);
      pushToast({ tone: 'error', title: 'プロジェクトの追加に失敗しました' });
    }
  };

  const handleCreatePerson = async (payload: {
    氏名: string;
    役割?: string;
    メール?: string;
    電話?: string;
    '稼働時間/日(h)'?: number;
  }) => {
    if (!payload.氏名.trim()) {
      pushToast({ tone: 'error', title: '氏名を入力してください' });
      return;
    }
    if (!canSync) {
      const id = generateLocalId('person');
      const now = todayString();
      const newPerson: Person = {
        id,
        氏名: payload.氏名,
        役割: payload.役割,
        メール: payload.メール,
        電話: payload.電話,
        '稼働時間/日(h)': payload['稼働時間/日(h)'],
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        people: [...prev.people, newPerson],
      }));
      pushToast({ tone: 'success', title: '担当者を追加しました（ローカル保存）' });
      return;
    }
    try {
      await createPerson(payload as unknown as Partial<Person>);
      pushToast({ tone: 'success', title: '担当者を追加しました' });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error(error);
      pushToast({ tone: 'error', title: '担当者の追加に失敗しました' });
    }
  };

  const handleUpdateProject = async (projectId: string, payload: Partial<Project>) => {
    if (!canSync) {
      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((project) =>
          project.id === projectId
            ? { ...project, ...payload, updatedAt: todayString() }
            : project
        ),
      }));
      setEditingProject(null);
      pushToast({ tone: 'success', title: 'プロジェクトを更新しました（ローカル保存）' });
      return;
    }
    try {
      await updateProject(projectId, payload);
      pushToast({ tone: 'success', title: 'プロジェクトを更新しました' });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
      setEditingProject(null);
    } catch (error) {
      console.error(error);
      pushToast({ tone: 'error', title: 'プロジェクトの更新に失敗しました' });
    }
  };

  const handleSaveProject = async (values: Partial<Project>) => {
    // サーバ必須の初期値を補完
    const payloadBase: Partial<Project> = {
      物件名: values.物件名 || '新規プロジェクト',
      ステータス: values.ステータス || '未着手',
      優先度: values.優先度 || '中',
      ...values,
    };

    if (projectDialogMode === 'create') {
      // 新規は絶対に id を送らない
      const { id: _id, ProjectID: _pid, ...clean } = payloadBase as any;
      console.debug('[Project] mode=create → POST /api/projects', clean);

      if (!canSync) {
        const id = generateLocalId('project');
        const now = todayString();
        const newProject: Project = {
          ...clean as Project,
          id,
          createdAt: now,
          updatedAt: now,
        };
        setState((prev) => ({
          ...prev,
          projects: [...prev.projects, newProject],
        }));
        pushToast({ tone: 'success', title: 'プロジェクトを追加しました（ローカル保存）' });
      } else {
        try {
          await createProject(clean);
          pushToast({ tone: 'success', title: 'プロジェクトを追加しました' });
          // 再取得して描画
          const list = await listProjects();
          setState((prev) => ({ ...prev, projects: list.projects }));
        } catch (error) {
          console.error(error);
          pushToast({ tone: 'error', title: 'プロジェクトの追加に失敗しました' });
          throw error; // Re-throw to prevent dialog from closing
        }
      }
    } else {
      // 編集モード
      console.debug('[Project] mode=edit → PATCH /api/projects/:id', editingProject?.id);
      if (!editingProject?.id) throw new Error('Missing id for edit');

      if (!canSync) {
        setState((prev) => ({
          ...prev,
          projects: prev.projects.map((project) =>
            project.id === editingProject.id
              ? { ...project, ...payloadBase, updatedAt: todayString() }
              : project
          ),
        }));
        pushToast({ tone: 'success', title: 'プロジェクトを更新しました（ローカル保存）' });
      } else {
        try {
          await updateProject(editingProject.id, payloadBase);
          pushToast({ tone: 'success', title: 'プロジェクトを更新しました' });
          // 再取得して描画
          const list = await listProjects();
          setState((prev) => ({ ...prev, projects: list.projects }));
        } catch (error) {
          console.error(error);
          pushToast({ tone: 'error', title: 'プロジェクトの更新に失敗しました' });
          throw error;
        }
      }
    }

    setProjectDialogOpen(false);
    setEditingProject(null);
  };

  const handleUpdatePerson = async (personId: string, payload: Partial<Person>) => {
    if (!canSync) {
      setState((prev) => ({
        ...prev,
        people: prev.people.map((person) =>
          person.id === personId
            ? { ...person, ...payload, updatedAt: todayString() }
            : person
        ),
      }));
      setEditingPerson(null);
      pushToast({ tone: 'success', title: '担当者を更新しました（ローカル保存）' });
      return;
    }
    try {
      await updatePerson(personId, payload);
      pushToast({ tone: 'success', title: '担当者を更新しました' });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
      setEditingPerson(null);
    } catch (error) {
      console.error(error);
      pushToast({ tone: 'error', title: '担当者の更新に失敗しました' });
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
        if (!canSync) {
          pushToast({ tone: 'success', title: '担当者を更新しました（ローカル保存）' });
          return;
        }
        await updateTask(taskId, { 担当者: assignee });
        pushToast({ tone: 'success', title: '担当者を更新しました' });
        window.dispatchEvent(new CustomEvent('snapshot:reload'));
      } catch (error) {
        console.error(error);
        setState((current) => ({
          ...current,
          tasks: current.tasks.map((task) => (task.id === taskId ? previousSnapshot : task)),
        }));
        pushToast({ tone: 'error', title: '担当者の更新に失敗しました' });
      }
    },
    [canSync, state.tasks]
  );

  const handleTaskDateChange = useCallback(
    async (
      taskId: string,
      payload: { start: string; end: string; kind: 'move' | 'resize-start' | 'resize-end' }
    ) => {
      try {
        if (!canSync) {
          // ローカルモード：即座にstateを更新
          setState((current) => {
            const updates = {
              start: payload.start,
              end: payload.end,
              予定開始日: payload.start,
              期限: payload.end,
              duration_days: calculateDuration(payload.start, payload.end),
            } as Partial<Task>;
            return {
              ...current,
              tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
            };
          });
          pushToast({ tone: 'success', title: 'スケジュールを更新しました（ローカル保存）' });
          return;
        }

        // APIモード：先にAPIを呼び出し、成功したらリロード
        await moveTaskDates(taskId, { 予定開始日: payload.start, 期限: payload.end });
        pushToast({ tone: 'success', title: 'スケジュールを更新しました' });

        // リロードイベントを発火（useSnapshotがデータを再取得する）
        window.dispatchEvent(new CustomEvent('snapshot:reload'));
      } catch (error) {
        console.error(error);
        pushToast({ tone: 'error', title: 'スケジュールの更新に失敗しました' });
      }
    },
    [canSync, setState]
  );

  const handleSeedReminders = useCallback(
    async (taskId: string) => {
      if (!canSync) {
        pushToast({ tone: 'info', title: 'サインインすると通知ジョブを登録できます' });
        return;
      }
      try {
        await seedTaskReminders(taskId);
        pushToast({ tone: 'success', title: '通知ジョブを登録しました' });
      } catch (error) {
        console.error(error);
        pushToast({ tone: 'error', title: '通知ジョブの登録に失敗しました' });
      }
    },
    [canSync]
  );

  const handleCalendarSync = useCallback(
    async (taskId: string) => {
      if (!canSync) {
        pushToast({ tone: 'info', title: 'サインインするとカレンダー同期を利用できます' });
        return;
      }
      try {
        await syncTaskCalendar(taskId);
        pushToast({ tone: 'success', title: 'カレンダー同期をリクエストしました' });
      } catch (error) {
        console.error(error);
        pushToast({ tone: 'error', title: 'カレンダー同期のリクエストに失敗しました' });
      }
    },
    [canSync]
  );

  const handleExportSnapshot = useCallback(async (): Promise<SnapshotPayload> => {
    if (canSync) {
      return exportSnapshot();
    }
    return {
      generated_at: todayString(),
      projects: state.projects,
      tasks: state.tasks,
      people: state.people,
    };
  }, [canSync, state.projects, state.tasks, state.people]);

  const handleExportExcelSafe = useCallback(async () => {
    if (!canSync) {
      throw new Error('Excel export is available after signing in.');
    }
    return exportExcel();
  }, [canSync]);

  const handleImportSnapshot = useCallback(async (payload: SnapshotPayload) => {
    if (canSync) {
      await importSnapshot(payload);
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
      return;
    }
    const normalized = normalizeSnapshot(payload);
    setState({
      projects: normalized.projects,
      tasks: normalized.tasks,
      people: normalized.people,
    });
  }, [canSync, setState]);

  const handleImportExcelSafe = useCallback(async (file: File) => {
    if (!canSync) {
      throw new Error('Excel import is available after signing in.');
    }
    await importExcel(file);
    window.dispatchEvent(new CustomEvent('snapshot:reload'));
  }, [canSync]);

  if (!authReady) {
    return (
      <>
        <FullScreenLoader message="サインイン状態を確認しています..." />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <AppLayout
        onOpenTask={() => setTaskModalOpen(true)}
        onOpenProject={() => {
          setEditingProject(null);
          setProjectDialogOpen(true);
        }}
        onOpenPerson={() => setPersonModalOpen(true)}
        user={user}
        authSupported={authSupported}
        authReady={authReady}
        onSignIn={signIn}
        onSignOut={signOut}
        authError={authError}
        canEdit={canEdit}
        canSync={canSync}
        onExportSnapshot={handleExportSnapshot}
        onExportExcel={handleExportExcelSafe}
        onImportSnapshot={handleImportSnapshot}
        onImportExcel={handleImportExcelSafe}
        onNotify={pushToast}
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
                onTaskAssigneeChange={handleTaskAssigneeChange}
                onTaskUpdate={handleTaskUpdate}
                onOpenTask={() => setTaskModalOpen(true)}
                onOpenProject={() => {
                  setProjectDialogMode('create');
                  setEditingProject(null);
                  setProjectDialogOpen(true);
                }}
                onOpenPerson={() => setPersonModalOpen(true)}
                onEditPerson={setEditingPerson}
                pushToast={pushToast}
                setState={setState}
                canEdit={canEdit}
                canSync={canSync}
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
                onOpenProject={() => {
                  setProjectDialogMode('create');
                  setEditingProject(null);
                  setProjectDialogOpen(true);
                }}
                onOpenPerson={() => setPersonModalOpen(true)}
                onEditProject={(project) => {
                  setProjectDialogMode('edit');
                  setEditingProject(project);
                  setProjectDialogOpen(true);
                }}
                sortKey={projectSort}
                onSortChange={setProjectSort}
                canEdit={canEdit}
                canSync={canSync}
                setManagingMembersProject={setManagingMembersProject}
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
                onTaskUpdate={handleTaskUpdate}
                onOpenTask={() => setTaskModalOpen(true)}
                onOpenProject={() => {
                  setProjectDialogMode('create');
                  setEditingProject(null);
                  setProjectDialogOpen(true);
                }}
                onOpenPerson={() => setPersonModalOpen(true)}
                onEditTask={(task) => setEditingTask(task)}
                onSeedReminders={canSync ? handleSeedReminders : undefined}
                onCalendarSync={canSync ? handleCalendarSync : undefined}
                canEdit={canEdit}
                canSync={canSync}
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
                onTaskAssigneeChange={handleTaskAssigneeChange}
                onTaskUpdate={handleTaskUpdate}
                onOpenTask={() => setTaskModalOpen(true)}
                onOpenProject={() => {
                  setProjectDialogMode('create');
                  setEditingProject(null);
                  setProjectDialogOpen(true);
                }}
                onOpenPerson={() => setPersonModalOpen(true)}
                onEditPerson={setEditingPerson}
                pushToast={pushToast}
                setState={setState}
                canEdit={canEdit}
                canSync={canSync}
              />
            }
          />
          <Route path="/workload" element={<WorkloadPage filtersProps={filtersProps} tasks={filteredTasks} />} />
          <Route path="/users" element={<UserManagement projects={state.projects} />} />
        </Routes>
      </AppLayout>
      <TaskModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        projects={state.projects}
        people={state.people}
        onSubmit={handleCreateTask}
        onNotify={pushToast}
      />
      <TaskModal
        open={Boolean(editingTask)}
        onOpenChange={(open) => !open && setEditingTask(null)}
        projects={state.projects}
        people={state.people}
        editingTask={editingTask}
        onSubmit={handleCreateTask}
        onUpdate={handleTaskUpdate}
        onNotify={pushToast}
      />
      <ProjectModal open={projectModalOpen} onOpenChange={setProjectModalOpen} onSubmit={handleCreateProject} onNotify={pushToast} />
      <PersonModal open={personModalOpen} onOpenChange={setPersonModalOpen} onSubmit={handleCreatePerson} onNotify={pushToast} />
      {projectDialogOpen && (
        <ProjectEditDialog
          project={editingProject}
          onClose={() => {
            setProjectDialogOpen(false);
            setEditingProject(null);
          }}
          onSave={handleSaveProject}
        />
      )}
      <PersonEditDialog
        person={editingPerson}
        onClose={() => setEditingPerson(null)}
        onSave={(person) => handleUpdatePerson(person.id, person)}
      />
      {managingMembersProject && (
        <ProjectMembersDialog
          project={managingMembersProject}
          onClose={() => setManagingMembersProject(null)}
        />
      )}
    </>
  );
}

export default App;
 
