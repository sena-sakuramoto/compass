import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Banknote,
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
  Building2,
  Rocket,
  Wand2,
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
  deleteTask,
  deleteProject,
  completeTask,
  importExcel,
  exportExcel,
  exportSnapshot,
  importSnapshot,
  moveTaskDates,
  seedTaskReminders,
  syncTaskCalendar,
  listProjectMembers,
  listStages,
  listActivityLogs,
  ApiError,
  getCurrentUser,
  getBillingAccess,
  createOrgForStripeSubscriber,
  checkOrgSetupEligibility,
} from './lib/api';
import type { BillingAccessInfo } from './lib/api';
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
import { NotificationBell } from './components/NotificationBell';
import { UserManagement } from './components/UserManagement';
import { HelpPage } from './pages/HelpPage';
import { AdminPage } from './pages/AdminPage';
import NotificationsPage from './pages/NotificationsPage';
import BillingGateOverlay from './components/BillingGateOverlay';
import { formatDate, parseDate, todayString, DAY_MS, calculateDuration } from './lib/date';
import { normalizeSnapshot, SAMPLE_SNAPSHOT, toNumber } from './lib/normalize';
import type { Project, Task, Person, SnapshotPayload, TaskNotificationSettings, Stage } from './lib/types';
import type { ProjectMember } from './lib/auth-types';
import { isArchivedProjectStatus, isClosedProjectStatus, STATUS_PROGRESS } from './lib/constants';
import { clampToSingleDecimal, parseHoursInput } from './lib/number';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subWeeks,
  subMonths,
  subYears,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  startOfDay,
  endOfDay,
  differenceInCalendarDays,
} from 'date-fns';
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
  ComposedChart as WorkloadComposedChart,
  Area as WorkloadArea,
  Line as WorkloadLine,
} from 'recharts';
import { useFirebaseAuth } from './lib/firebaseClient';
import type { User } from 'firebase/auth';
import { usePendingOverlay, applyPendingToTasks } from './state/pendingOverlay';

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

  // Undo/Redo用の履歴管理
  const [history, setHistory] = useState<CompassState[]>([state]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoingRef = useRef(false);

  // 状態を変更し、履歴に追加
  const setStateWithHistory = useCallback((newState: CompassState | ((prev: CompassState) => CompassState)) => {
    if (isUndoingRef.current) {
      // undo/redo中は履歴に追加しない
      setState(newState);
      return;
    }

    setState((prevState) => {
      const nextState = typeof newState === 'function' ? newState(prevState) : newState;

      // 履歴に追加（現在位置より後の履歴は削除）
      setHistory((prevHistory) => {
        // 現在位置より後を削除して新しい状態を追加
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        newHistory.push(nextState);
        // 履歴は最大50件まで保持
        if (newHistory.length > 50) {
          newHistory.shift();
        } else {
          setHistoryIndex(newHistory.length - 1);
        }
        return newHistory;
      });

      return nextState;
    });
  }, [historyIndex]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;

    isUndoingRef.current = true;
    const previousState = history[historyIndex - 1];
    if (previousState) {
      setState(previousState);
      setHistoryIndex((prev) => prev - 1);
    }
    isUndoingRef.current = false;
  }, [history, historyIndex]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;

    isUndoingRef.current = true;
    const nextState = history[historyIndex + 1];
    if (nextState) {
      setState(nextState);
      setHistoryIndex((prev) => prev + 1);
    }
    isUndoingRef.current = false;
  }, [history, historyIndex]);

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

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return [state, setStateWithHistory, undo, redo, canUndo, canRedo] as const;
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
  loading,
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
  loading?: boolean;
}) {
  const navLinks = [
    { path: '/', label: '工程表' },
    { path: '/summary', label: 'プロジェクト' },
    { path: '/tasks', label: 'タスク' },
    { path: '/workload', label: '稼働状況' },
    { path: '/users', label: '人員管理' },
  ];
  const offline = !authSupported || !user;

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Sidebar user={user} onSignOut={onSignOut} loading={loading} />
      <div className="flex-1 flex flex-col lg:pl-56 min-h-0">
        <header className="flex-shrink-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-1 lg:px-6">
            <div className="flex items-center justify-between gap-1">
              {/* モバイル：ハンバーガーメニュー用のスペース + タイトル */}
              <div className="flex items-center gap-2 flex-1 min-w-0 lg:ml-0 pl-12 lg:pl-0">
                <div>
                  <h1 className="text-base lg:text-lg font-semibold text-slate-900 truncate">APDW Project Compass</h1>
                  <p className="hidden lg:block text-[11px] text-slate-500 leading-tight">工程管理ダッシュボード - 全プロジェクト・タスクを横断管理</p>
                </div>
              </div>

              {/* 右側：通知とその他のアクション */}
              <div className="flex items-center gap-2">
                {/* 通知は常に表示 */}
                {authSupported && user && <NotificationBell />}

                {/* その他のアクションはPCのみ */}
                <div className="hidden lg:block">
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
              </div>
            </div>
            <nav className="hidden flex-wrap gap-2">
              {navLinks.map((link) => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 text-sm font-medium transition ${isActive
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
        <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-1 md:pt-2 lg:px-8">
          {children}
        </main>
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
          className={`fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-lg my-8 flex flex-col max-h-[calc(100vh-4rem)]">
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-slate-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button type="button" onClick={() => onOpenChange(false)} className="text-slate-500 hover:text-slate-700">
            ×
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

interface TaskModalProps extends ModalProps {
  projects: Project[];
  people: Person[];
  editingTask?: Task | null;
  defaultProjectId?: string;
  defaultStageId?: string;
  allowContinuousCreate?: boolean;
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
  onDelete?(taskId: string): Promise<void>;
  onNotify?(message: ToastInput): void;
}

function TaskModal({
  open,
  onOpenChange,
  projects,
  people,
  editingTask,
  onSubmit,
  onUpdate,
  onDelete,
  onNotify,
  defaultProjectId,
  defaultStageId,
  allowContinuousCreate,
}: TaskModalProps) {
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
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [stageId, setStageId] = useState<string>('');
  const [stages, setStages] = useState<Stage[]>([]);
  const taskNameInputRef = useRef<HTMLInputElement | null>(null);
  const submitIntentRef = useRef<'close' | 'continue'>('close');
  const allowContinuous = Boolean(allowContinuousCreate && !editingTask);

  const resetFormFields = useCallback((keepContext: boolean) => {
    setName('');
    setStartDate(null);
    setEndDate(null);
    setDurationDays(1);
    setIsMilestone(false);
    if (keepContext) return;
    setProject('');
    setStageId('');
    setAssignee('');
    setAssigneeEmail('');
    setPriority('中');
    setStatus('未着手');
    setEstimate(4);
    setNotifyStart(true);
    setNotifyDayBefore(true);
    setNotifyDue(true);
    setNotifyOverdue(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    if (editingTask) {
      setProject(editingTask.projectId);
      setAssignee(editingTask.担当者 || editingTask.assignee || '');
      setAssigneeEmail(editingTask.担当者メール || '');
      setName(editingTask.タスク名);
      setStageId(editingTask.parentId || '');

      const startDateValue = editingTask.予定開始日 || editingTask.start;
      const endDateValue = editingTask.期限 || editingTask.end;
      setStartDate(startDateValue ? new Date(startDateValue) : null);
      setEndDate(endDateValue ? new Date(endDateValue) : null);

      if (startDateValue && endDateValue) {
        const start = new Date(startDateValue);
        const end = new Date(endDateValue);
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        setDurationDays(diffDays > 0 ? diffDays : 1);
      }

      setPriority(editingTask.優先度 || '中');
      setStatus(editingTask.ステータス || '未着手');
      const existingEstimate = editingTask['工数見積(h)'];
      setEstimate(existingEstimate != null ? clampToSingleDecimal(existingEstimate) : 4);

      const notif = editingTask['通知設定'];
      setNotifyStart(notif?.開始日 ?? true);
      setNotifyDayBefore(notif?.期限前日 ?? true);
      setNotifyDue(notif?.期限当日 ?? true);
      setNotifyOverdue(notif?.超過 ?? true);

      const milestoneValue = editingTask['マイルストーン'] === true || editingTask['milestone'] === true;
      setIsMilestone(milestoneValue);
    } else {
      resetFormFields(false);
      if (defaultProjectId) {
        setProject(defaultProjectId);
      }
      if (defaultStageId) {
        setStageId(defaultStageId);
      }
    }
  }, [open, editingTask, defaultProjectId, defaultStageId, resetFormFields]);

  // プロジェクト選択時に工程一覧を取得
  useEffect(() => {
    if (!project) {
      setStages([]);
      return;
    }

    listStages(project)
      .then(({ stages: stageList }) => {
        setStages(stageList);
      })
      .catch(error => {
        console.error('[TaskModal] Failed to load stages:', error);
        setStages([]);
      });
  }, [project]);

  // プロジェクトメンバーを取得
  useEffect(() => {
    if (!project) {
      setProjectMembers([]);
      return;
    }

    console.log('[TaskModal] Loading project members for:', project);
    setMembersLoading(true);
    listProjectMembers(project, { status: 'active' })
      .then(members => {
        console.log('[TaskModal] Loaded project members:', members);
        setProjectMembers(members);
      })
      .catch(error => {
        console.error('[TaskModal] Failed to load project members:', error);
        setProjectMembers([]);
      })
      .finally(() => {
        setMembersLoading(false);
      });
  }, [project]);

  // 担当者選択時にメールアドレスを自動入力（プロジェクトメンバーから検索）
  useEffect(() => {
    if (!assignee) {
      setAssigneeEmail('');
      return;
    }
    const member = projectMembers.find((m) => m.displayName === assignee);
    if (member) {
      setAssigneeEmail(member.email);
    } else {
      // フォールバック: peopleから検索（後方互換性のため）
      const person = people.find((p) => p.氏名 === assignee);
      setAssigneeEmail(person?.メール ?? '');
    }
  }, [assignee, projectMembers, people]);

  useEffect(() => {
    if (!open || editingTask) return;
    const timer = window.setTimeout(() => {
      taskNameInputRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [open, editingTask]);

  // マイルストーン用の日付変更ハンドラ
  const handleMilestoneDateChange = (date: Date | null) => {
    setStartDate(date);
    setEndDate(date);
  };

  // 通常タスク用の日付範囲変更ハンドラ
  const handleRangeDateChange = (date: Date | null) => {
    if (!date) {
      setStartDate(null);
      setEndDate(null);
      return;
    }

    // 開始日が未設定、または既に範囲が確定している場合は新しい開始日として設定
    if (!startDate || (startDate && endDate)) {
      setStartDate(date);
      setEndDate(null);
    } else {
      // 開始日が設定済みで終了日が未設定の場合
      if (startDate.getTime() === date.getTime()) {
        // 同じ日をクリック → 単日タスク
        setEndDate(date);
        setDurationDays(1);
      } else if (date < startDate) {
        // クリックした日が開始日より前 → 開始日と終了日を入れ替え
        setEndDate(startDate);
        setStartDate(date);
        const diffTime = startDate.getTime() - date.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        setDurationDays(diffDays);
      } else {
        // クリックした日が開始日より後 → 範囲選択
        setEndDate(date);
        const diffTime = date.getTime() - startDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        setDurationDays(diffDays);
      }

      // マイルストーン解除判定
      if (startDate.getTime() !== date.getTime() && isMilestone) {
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
    const intent = submitIntentRef.current;
    submitIntentRef.current = 'close';
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
        parentId: stageId || null,
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
        parentId?: string | null;
        '通知設定'?: TaskNotificationSettings;
      };

      if (editingTask && onUpdate) {
        console.log('[TaskModal] Updating task with payload:', payload);
        await onUpdate(editingTask.id, payload);
      } else {
        console.log('[TaskModal] Creating task with payload:', payload);
        await onSubmit(payload);
      }
      if (!editingTask && allowContinuous && intent === 'continue') {
        resetFormFields(true);
        taskNameInputRef.current?.focus();
        return;
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      onNotify?.({ tone: 'error', title: editingTask ? 'タスクの更新に失敗しました' : 'タスクの追加に失敗しました' });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={editingTask ? "タスク編集" : "タスク追加"}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">プロジェクト</label>
            <select
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
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
            {!project ? (
              <div className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm text-slate-400">
                プロジェクトを選択してください
              </div>
            ) : membersLoading ? (
              <div className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm text-slate-400">
                メンバー読み込み中...
              </div>
            ) : projectMembers.length > 0 ? (
              <select
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">選択</option>
                {projectMembers.map((member) => (
                  <option key={member.userId} value={member.displayName}>
                    {member.displayName} ({member.role})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="メンバーが見つかりません - 直接入力してください"
              />
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">通知送信先メール</label>
          <input
            type="email"
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
            value={assigneeEmail}
            onChange={(e) => setAssigneeEmail(e.target.value)}
            placeholder="担当者メールアドレス"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">工程</label>
          <select
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
          >
            <option value="">未割り当て</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.タスク名}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">タスク名</label>
          <input
            ref={taskNameInputRef}
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {/* マイルストーンチェックボックス */}
        <div className={`flex items-center gap-2 p-2 rounded-lg border ${isMilestoneCheckboxEnabled
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
            className={`w-4 h-4 rounded focus:ring-red-500 flex-shrink-0 ${isMilestoneCheckboxEnabled
              ? 'text-red-600 cursor-pointer'
              : 'text-gray-400 cursor-not-allowed'
              }`}
          />
          <label
            htmlFor="milestone"
            className={`text-xs ${isMilestoneCheckboxEnabled
              ? 'text-red-900 cursor-pointer'
              : 'text-gray-400 cursor-not-allowed'
              }`}
          >
            ◆ マイルストーン（重要な1日の予定）
            {!isMilestoneCheckboxEnabled && (
              <span className="block text-[10px] mt-0.5 text-gray-500">※ 1日だけの予定を選択すると設定可</span>
            )}
          </label>
        </div>

        {/* 日付選択 */}
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-3">
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            {isMilestone ? '◆ 実施日' : '作業期間'}
          </label>
          {isMilestone ? (
            <DatePicker
              selected={startDate}
              onChange={handleMilestoneDateChange}
              locale="ja"
              dateFormat="yyyy年MM月dd日"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholderText="実施日を選択"
            />
          ) : (
            <div>
              <DatePicker
                onChange={handleRangeDateChange}
                highlightDates={[
                  ...(startDate ? [startDate] : []),
                  ...(startDate && endDate ?
                    Array.from({ length: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 }, (_, i) => {
                      const d = new Date(startDate);
                      d.setDate(startDate.getDate() + i);
                      return d;
                    }) : []
                  )
                ]}
                inline
                locale="ja"
                className="w-full"
              />
              <div className="mt-2 text-xs text-slate-600 text-center bg-blue-50 rounded-lg py-2 px-3">
                {!startDate && '📅 開始日を選択してください'}
                {startDate && !endDate && '📅 終了日を選択してください（同じ日をもう一度クリックで単日タスク）'}
                {startDate && endDate && (
                  <span className="font-semibold text-blue-600">
                    {startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })} 〜 {endDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                    {startDate.getTime() === endDate.getTime() && ' (単日)'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">優先度</label>
            <select
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
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
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">工数見積(h)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              value={estimate}
              onChange={(e) => setEstimate(parseHoursInput(e.target.value))}
            />
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">メール通知</p>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={notifyStart} onChange={(e) => setNotifyStart(e.target.checked)} className="w-3.5 h-3.5" />
              <span>開始日</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={notifyDayBefore} onChange={(e) => setNotifyDayBefore(e.target.checked)} className="w-3.5 h-3.5" />
              <span>期限前日</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={notifyDue} onChange={(e) => setNotifyDue(e.target.checked)} className="w-3.5 h-3.5" />
              <span>期限当日</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={notifyOverdue} onChange={(e) => setNotifyOverdue(e.target.checked)} className="w-3.5 h-3.5" />
              <span>期限超過</span>
            </label>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          {/* 削除ボタン（編集モード時のみ表示） */}
          {editingTask && onDelete ? (
            <button
              type="button"
              onClick={async () => {
                if (!editingTask) return;
                if (!confirm(`タスク「${editingTask.タスク名}」を削除しますか？この操作は取り消せません。`)) {
                  return;
                }
                try {
                  await onDelete(editingTask.id);
                  onOpenChange(false);
                } catch (err) {
                  console.error(err);
                  onNotify?.({ tone: 'error', title: 'タスクの削除に失敗しました' });
                }
              }}
              className="rounded-2xl bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            >
              削除
            </button>
          ) : (
            <div />
          )}

          {/* キャンセル・保存ボタン */}
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" className="rounded-2xl border px-4 py-1.5 text-sm" onClick={() => onOpenChange(false)}>
              キャンセル
            </button>
            {!editingTask && allowContinuous && (
              <button
                type="submit"
                className="rounded-2xl border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50"
                onClick={() => {
                  submitIntentRef.current = 'continue';
                }}
              >
                続けて追加
              </button>
            )}
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white"
              onClick={() => {
                submitIntentRef.current = 'close';
              }}
            >
              {editingTask ? '保存' : '追加'}
            </button>
          </div>
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
    type?: 'person' | 'client';
    氏名: string;
    役割?: string;
    部署?: string;
    会社名?: string;
    メール?: string;
    電話?: string;
    '稼働時間/日(h)'?: number;
  }): Promise<void>;
  onNotify?(message: ToastInput): void;
}

function PersonModal({ open, onOpenChange, onSubmit, onNotify }: PersonModalProps) {
  const [personType, setPersonType] = useState<'person' | 'client'>('person');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [workingHours, setWorkingHours] = useState<number | ''>('');

  useEffect(() => {
    if (open) {
      setPersonType('person');
      setName('');
      setRole('');
      setDepartment('');
      setCompanyName('');
      setEmail('');
      setPhone('');
      setWorkingHours('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        type: personType,
        氏名: name,
        役割: role || undefined,
        部署: personType === 'person' ? (department || undefined) : undefined,
        会社名: personType === 'client' ? (companyName || undefined) : undefined,
        メール: email || undefined,
        電話: phone || undefined,
        '稼働時間/日(h)': personType === 'person' && workingHours ? Number(workingHours) : undefined,
      };
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      onNotify?.({ tone: 'error', title: `${personType === 'client' ? 'クライアント' : '担当者'}の追加に失敗しました` });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={personType === 'client' ? 'クライアント追加' : '担当者追加'}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-2 block text-xs text-slate-500">タイプ *</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="personType"
                value="person"
                checked={personType === 'person'}
                onChange={() => setPersonType('person')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-slate-700">担当者</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="personType"
                value="client"
                checked={personType === 'client'}
                onChange={() => setPersonType('client')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-slate-700">クライアント</span>
            </label>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">氏名 *</label>
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
        {personType === 'person' && (
          <div>
            <label className="mb-1 block text-xs text-slate-500">部署</label>
            <input
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="部署"
            />
          </div>
        )}
        {personType === 'client' && (
          <div>
            <label className="mb-1 block text-xs text-slate-500">会社名</label>
            <input
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="例: 株式会社〇〇"
            />
          </div>
        )}
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
        {personType === 'person' && (
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
        )}
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

function SignInRequired({ onSignIn, authError }: { onSignIn(method?: 'google' | 'email', emailPassword?: { email: string; password: string }): void; authError?: string | null }) {
  const [showEmailForm, setShowEmailForm] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  const handleEmailSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      onSignIn('email', { email, password });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-6 text-slate-100">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-3 text-center">
          <h1 className="text-2xl font-bold">Project Compass を利用するにはサインインが必要です</h1>
          <p className="text-sm text-slate-300">
            アカウントでサインインすると、プロジェクトとタスクがリアルタイムで同期されます。
          </p>
        </div>

        {!showEmailForm ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onSignIn('google')}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow hover:bg-slate-100 transition"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google でサインイン
            </button>

            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border-2 border-slate-600 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-800 transition"
            >
              <LogIn className="h-5 w-5" />
              メールアドレスでサインイン
            </button>

            <div className="text-center">
              <p className="text-xs text-amber-300 bg-amber-900/30 px-3 py-2 rounded-lg">
                推奨: Google連携機能を利用するには、Googleアカウントでサインインしてください
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="メールアドレス"
                className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード"
                className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              サインイン
            </button>
            <button
              type="button"
              onClick={() => setShowEmailForm(false)}
              className="w-full rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition"
            >
              戻る
            </button>
          </form>
        )}

        {authError ? <p className="text-xs text-rose-300 text-center">{authError}</p> : null}
        <p className="text-xs text-slate-400 text-center">認証に問題がある場合は管理者にお問い合わせください。</p>
      </div>
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
  allTasks,
  onOpenTask,
  onOpenProject,
  onOpenPerson,
  onEditProject,
  sortKey,
  onSortChange,
  canEdit,
  canSync,
  setManagingMembersProject,
  allProjectMembers,
  showArchivedProjects,
  archivedProjectsCount,
  onToggleArchivedProjects,
}: {
  projects: ProjectWithDerived[];
  filteredTasks: Task[];
  allTasks: Task[];
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
  allProjectMembers: Map<string, ProjectMember[]>;
  showArchivedProjects: boolean;
  archivedProjectsCount: number;
  onToggleArchivedProjects(): void;
}) {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const openTaskCount = useMemo(
    () => filteredTasks.filter((task) => task.ステータス !== '完了').length,
    [filteredTasks]
  );
  const overdueCount = useMemo(
    () =>
      filteredTasks.filter((task) => {
        const deadline = parseDate(task.end ?? task.期限 ?? task.実績完了日);
        return deadline ? deadline.getTime() < startOfToday.getTime() && task.ステータス !== '完了' : false;
      }).length,
    [filteredTasks, startOfToday]
  );
  const averageProgress = useMemo(() => {
    if (!projects.length) return 0;
    const total = projects.reduce((sum, project) => sum + (project.progressAggregate ?? 0), 0);
    return Math.round((total / projects.length) * 100);
  }, [projects]);
  const activeMembersCount = useMemo(() => {
    const members = new Set<string>();
    filteredTasks.forEach((task) => {
      const name = task.assignee ?? task.担当者;
      if (name) members.add(name);
    });
    return members.size;
  }, [filteredTasks]);
  const totalConstructionCost = useMemo(() => {
    return projects.reduce((sum, project) => sum + (project.施工費 ?? 0), 0);
  }, [projects]);

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
        note: 'プロジェクトの平均値',
      },
      {
        id: 'construction_cost',
        icon: Banknote,
        label: '施工費合計',
        value: totalConstructionCost.toLocaleString() + '円',
        accent: 'neutral' as const,
        note: `${projects.length}件のプロジェクト`,
      },
    ],
    [filteredTasks.length, openTaskCount, overdueCount, averageProgress, totalConstructionCost, projects.length, filtersProps.hasActiveFilters, filtersProps.assignees.length]
  );

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    const projectArray = Array.isArray(filtersProps.project) ? filtersProps.project : [];
    const assigneeArray = Array.isArray(filtersProps.assignee) ? filtersProps.assignee : [];
    const statusArray = Array.isArray(filtersProps.status) ? filtersProps.status : [];

    if (projectArray.length > 0) {
      if (projectArray.length === 1) {
        const label = filtersProps.projects.find((option) => option.value === projectArray[0])?.label;
        if (label) chips.push(`プロジェクト: ${label}`);
      } else {
        chips.push(`プロジェクト: ${projectArray.length}件選択`);
      }
    }
    if (assigneeArray.length > 0) {
      if (assigneeArray.length === 1) {
        const label = filtersProps.assignees.find((option) => option.value === assigneeArray[0])?.label;
        if (label) chips.push(`担当: ${label}`);
      } else {
        chips.push(`担当: ${assigneeArray.length}件選択`);
      }
    }
    if (statusArray.length > 0) {
      if (statusArray.length === 1) {
        chips.push(`ステータス: ${statusArray[0]}`);
      } else {
        chips.push(`ステータス: ${statusArray.length}件選択`);
      }
    }
    if ((filtersProps.query ?? '').trim()) {
      chips.push(`検索: "${filtersProps.query.trim()}"`);
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
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {archivedProjectsCount > 0
              ? showArchivedProjects
                ? `${archivedProjectsCount}件の失注/引渡し済みプロジェクトを表示中です`
                : `${archivedProjectsCount}件の失注/引渡し済みプロジェクトを非表示にしています`
              : '失注/引渡し済みのプロジェクトはありません'}
          </span>
          <button
            type="button"
            onClick={onToggleArchivedProjects}
            disabled={archivedProjectsCount === 0}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {showArchivedProjects ? '非表示にする' : '表示する'}
          </button>
        </div>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              条件に一致するプロジェクトがありません。フィルタを調整するか、新しいプロジェクトを追加してください。
            </div>
          ) : (
            projects.map((project) => {
              // プロジェクトに関連するタスクを取得
              const relatedTasks = allTasks.filter((task) => task.projectId === project.id);

              let dueLabel: string | undefined;
              let overdue = false;

              // プロジェクトが完了/失注している場合は期限超過判定をスキップ
              const isProjectCompleted = isClosedProjectStatus(project.ステータス);

              if (isProjectCompleted) {
                // 完了済みプロジェクトは期限表示なし
                dueLabel = undefined;
                overdue = false;
              } else {
                // 期限超過タスクをチェック（サマリーと同じロジック）
                const overdueTasks = relatedTasks.filter((task) => {
                  const deadline = parseDate(task.end ?? task.期限 ?? task.実績完了日);
                  return deadline ? deadline.getTime() < startOfToday.getTime() && task.ステータス !== '完了' : false;
                });

                if (overdueTasks.length > 0) {
                  // 期限超過タスクがある場合
                  dueLabel = `${overdueTasks.length} 件が期限超過`;
                  overdue = true;
                } else {
                  // 期限超過なし：最も近い期限を表示
                  const projectDueDate = parseDate(project.予定完了日 ?? project.span?.end ?? null);
                  if (projectDueDate) {
                    const diffDays = Math.ceil((projectDueDate.getTime() - startOfToday.getTime()) / DAY_MS);
                    if (diffDays > 0) {
                      dueLabel = `残り ${diffDays} 日`;
                    } else if (diffDays === 0) {
                      dueLabel = '今日が期限';
                    } else if (diffDays < 0) {
                      // プロジェクト自体が期限超過
                      dueLabel = `${Math.abs(diffDays)} 日超過`;
                      overdue = true;
                    }
                  }
                }
              }

              // プロジェクトメンバーから主要役割を抽出（複数人対応）
              const members = allProjectMembers.get(project.id) || [];

              // 役職の優先順位
              const roleOrder: Record<string, number> = {
                'owner': 1,
                'manager': 2,
                'member': 3,
                'viewer': 4,
              };

              // 役職順にソートしてから名前を結合
              const sortByRole = (filtered: ProjectMember[]) =>
                filtered
                  .sort((a, b) => (roleOrder[a.role] || 999) - (roleOrder[b.role] || 999))
                  .map(m => m.displayName)
                  .join('、');

              const 営業 = sortByRole(members.filter((m: ProjectMember) => m.jobTitle === '営業'));
              const PM = sortByRole(members.filter((m: ProjectMember) => m.jobTitle === 'PM'));
              const 設計 = sortByRole(members.filter((m: ProjectMember) => m.jobTitle === '設計'));
              const 施工管理 = sortByRole(members.filter((m: ProjectMember) => m.jobTitle === '施工管理'));

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
                    folderUrl={project['フォルダURL']}
                    施工費={project.施工費}
                    クライアント={project.クライアント}
                    営業={営業}
                    PM={PM}
                    設計={設計}
                    施工管理={施工管理}
                    onClick={() => onEditProject(project)}
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
  project: string | string[];
  assignee: string | string[];
  status: string | string[];
  query: string;
  onProjectChange: (value: string | string[]) => void;
  onAssigneeChange: (value: string | string[]) => void;
  onStatusChange: (value: string | string[]) => void;
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
  people,
  onComplete,
  onTaskUpdate: updateTask,
  onDeleteTask,
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
  people: Person[];
  onComplete(task: Task, done: boolean): void;
  onTaskUpdate(taskId: string, updates: Partial<Task>): void;
  onDeleteTask(taskId: string): Promise<void>;
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
  const [sortKey, setSortKey] = useState<'name' | 'project' | 'assignee' | 'schedule' | 'status'>('status');

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

  const buildScheduleLabel = useCallback((startLabel?: string | null, endLabel?: string | null) => {
    if (!startLabel && !endLabel) return '未設定';
    return `${startLabel || '未設定'} → ${endLabel || '未設定'}`;
  }, []);

  // 担当者名をメールアドレスまたは名前から正しい表示名に変換
  const getAssigneeDisplayName = useCallback((assigneeValue: string): string => {
    if (!assigneeValue) return '';

    // peopleから検索 (氏名 または メール で一致)
    const person = people.find(p =>
      p.氏名 === assigneeValue || p.メール === assigneeValue
    );

    return person?.氏名 || assigneeValue;
  }, [people]);

  const rows: TaskTableRow[] = filteredTasks.map((task) => {
    const startLabelRaw = formatDate(task.start ?? task.予定開始日 ?? null);
    const endLabelRaw = formatDate(task.end ?? task.期限 ?? null);
    const scheduleStart = startLabelRaw || null;
    const scheduleEnd = endLabelRaw || null;
    return {
      id: task.id,
      name: task.タスク名,
      projectLabel: projectMap[task.projectId]?.物件名 ?? task.projectId,
      assignee: getAssigneeDisplayName(task.assignee ?? task.担当者 ?? ''),
      schedule: buildScheduleLabel(scheduleStart, scheduleEnd),
      scheduleStart,
      scheduleEnd,
      effort: task['工数見積(h)'] ? String(task['工数見積(h)']) : '-',
      priority: task['優先度'] ?? '',
      status: task.ステータス,
      progress: task.progress,
    };
  });

  // ソート処理
  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'project':
          return a.projectLabel.localeCompare(b.projectLabel);
        case 'assignee':
          return a.assignee.localeCompare(b.assignee);
        case 'schedule':
          return a.schedule.localeCompare(b.schedule);
        case 'status':
        default:
          const statusOrder = { '未着手': 0, '進行中': 1, '完了': 2 };
          return (statusOrder[a.status as keyof typeof statusOrder] ?? 3) - (statusOrder[b.status as keyof typeof statusOrder] ?? 3);
      }
    });
    return sorted;
  }, [rows, sortKey]);

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
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"
          >
            <option value="status">並替: ステータス</option>
            <option value="name">並替: タスク名</option>
            <option value="project">並替: プロジェクト</option>
            <option value="assignee">並替: 担当者</option>
            <option value="schedule">並替: 期限</option>
          </select>
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
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:hidden">
        {sortedRows.map((row) => {
          const task = filteredTasks.find(t => t.id === row.id)!;
          return (
            <TaskCard
              key={row.id}
              id={row.id}
              name={row.name}
              projectLabel={row.projectLabel}
              assignee={row.assignee}
              schedule={row.schedule}
              scheduleStart={row.scheduleStart}
              scheduleEnd={row.scheduleEnd}
              status={row.status}
              progress={row.progress}
              onComplete={() => onComplete(task, true)}
              onSeedReminders={onSeedReminders ? () => handleSeedReminders(row.id) : undefined}
              onCalendarSync={onCalendarSync ? () => handleCalendarSync(row.id) : undefined}
              seedBusy={seedBusyIds.has(row.id)}
              calendarBusy={calendarBusyIds.has(row.id)}
            />
          );
        })}
      </div>
      <div className="hidden md:block">
        <TaskTable
          rows={sortedRows}
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
  onEditProject,
  pushToast,
  setState,
  canEdit,
  canSync,
  allProjectMembers,
  onStageAddTask,
  stageProgressMap,
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
  onEditProject(project: Project): void;
  pushToast: (toast: ToastInput) => void;
  setState: React.Dispatch<React.SetStateAction<CompassState>>;
  canEdit: boolean;
  canSync: boolean;
  allProjectMembers?: Map<string, ProjectMember[]>;
  onStageAddTask?: (stage: GanttTask) => void;
  stageProgressMap: Record<string, number>;
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


  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    const projectArray = Array.isArray(filtersProps.project) ? filtersProps.project : [];
    const assigneeArray = Array.isArray(filtersProps.assignee) ? filtersProps.assignee : [];
    const statusArray = Array.isArray(filtersProps.status) ? filtersProps.status : [];

    if (projectArray.length > 0) {
      if (projectArray.length === 1) {
        const label = filtersProps.projects.find((option) => option.value === projectArray[0])?.label;
        if (label) chips.push(`プロジェクト: ${label}`);
      } else {
        chips.push(`プロジェクト: ${projectArray.length}件選択`);
      }
    }
    if (assigneeArray.length > 0) {
      if (assigneeArray.length === 1) {
        const label = filtersProps.assignees.find((option) => option.value === assigneeArray[0])?.label;
        if (label) chips.push(`担当: ${label}`);
      } else {
        chips.push(`担当: ${assigneeArray.length}件選択`);
      }
    }
    if (statusArray.length > 0) {
      if (statusArray.length === 1) {
        chips.push(`ステータス: ${statusArray[0]}`);
      } else {
        chips.push(`ステータス: ${statusArray.length}件選択`);
      }
    }
    if ((filtersProps.query ?? '').trim()) {
      chips.push(`検索: "${filtersProps.query.trim()}"`);
    }
    return chips;
  }, [filtersProps]);

  // 新しいGanttChartのためのデータ変換
  const newGanttTasks = useMemo((): GanttTask[] => {
    const clampPct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    const progressOf = (task: Task): number => {
      if (task.type === 'stage') {
        return stageProgressMap[task.id] ?? 0;
      }
      const ratio =
        typeof task.progress === 'number' && Number.isFinite(task.progress)
          ? task.progress
          : STATUS_PROGRESS[task.ステータス] ?? 0;
      return clampPct(ratio * 100);
    };

    // デバッグ: filteredTasks の工程を確認
    const stagesInFilteredTasks = filteredTasks.filter(t => t.type === 'stage');
    console.log('[newGanttTasks] Stages in filteredTasks:', stagesInFilteredTasks.length, stagesInFilteredTasks.map(s => ({ name: s.タスク名, type: s.type })));

    const tasks = filteredTasks
      .filter((task) => {
        // 工程（type='stage'）もタスクも両方表示する
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

        // マイルストーンフラグが明示的にtrueの場合のみマイルストーンとして扱う
        const isMilestone = task['マイルストーン'] === true || task['milestone'] === true;
        const progress = progressOf(task);

        if (task.type === 'stage') {
          if (progress >= 100) {
            status = 'completed';
          } else if (progress > 0 && status !== 'completed') {
            status = 'in_progress';
          }
        }

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
          priority: task.優先度 || '中',
          estimatedHours: task['工数見積(h)'] || 0,
          notificationSettings: task['通知設定'] || {
            開始日: false,
            期限前日: false,
            期限当日: false,
            超過: false,
          },
          type: task.type === 'stage' ? 'stage' : 'task', // 工程かタスクかを区別
          parentId: task.parentId || null, // 親工程のID
        };
      })
      .map((task) => {
        // デバッグログ: 型情報を確認
        if (task) {
          console.log('[newGanttTasks] task:', task.name, 'type:', task.type);
        }
        return task;
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

    // 各プロジェクト内のタスクを階層的に並び替え（工程 → その配下の子タスク → 次の工程...）
    projectGroups.forEach((projectTasks) => {
      // 工程とスタンドアロンタスク（親を持たないタスク）を分離
      const stages = projectTasks.filter(t => t.type === 'stage');
      const standaloneTasks = projectTasks.filter(t => t.type !== 'stage' && !t.parentId);

      // 工程を開始日順にソート
      stages.sort((a, b) => {
        const startDiff = a.startDate.getTime() - b.startDate.getTime();
        if (startDiff !== 0) return startDiff;
        const endDiff = a.endDate.getTime() - b.endDate.getTime();
        if (endDiff !== 0) return endDiff;
        return a.id.localeCompare(b.id);
      });

      // スタンドアロンタスクを開始日順にソート
      standaloneTasks.sort((a, b) => {
        const startDiff = a.startDate.getTime() - b.startDate.getTime();
        if (startDiff !== 0) return startDiff;
        const endDiff = a.endDate.getTime() - b.endDate.getTime();
        if (endDiff !== 0) return endDiff;
        return a.id.localeCompare(b.id);
      });

      // 階層的に並べる: 工程 → その配下のタスク → 次の工程...
      const hierarchical: GanttTask[] = [];

      stages.forEach(stage => {
        // 工程を追加
        hierarchical.push(stage);

        // この工程の配下のタスクを取得して開始日順にソート
        const childTasks = projectTasks
          .filter(t => t.type !== 'stage' && t.parentId === stage.id)
          .sort((a, b) => {
            const startDiff = a.startDate.getTime() - b.startDate.getTime();
            if (startDiff !== 0) return startDiff;
            const endDiff = a.endDate.getTime() - b.endDate.getTime();
            if (endDiff !== 0) return endDiff;
            return a.id.localeCompare(b.id);
          });

        // 配下のタスクを追加
        hierarchical.push(...childTasks);
      });

      // 最後にスタンドアロンタスクを追加
      hierarchical.push(...standaloneTasks);

      // 元の配列を置き換え
      projectGroups.set(projectTasks[0].projectId, hierarchical);
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
  }, [filteredTasks, projectMap, stageProgressMap]);

  // 工程ベースのガントチャート用データ（削除：不要になったコード）
  /*
  const ganttStages = useMemo((): GanttStage[] => {
    // 工程（type='stage'）を取得
    const stageRecords = filteredTasks.filter(task => task.type === 'stage');
    console.log(`[GanttStages] Found ${stageRecords.length} stages`);

    // 工程に紐付いていないタスク（parentIdがnull/undefined、または工程以外）を取得
    const stageIds = new Set(stageRecords.map(s => s.id));
    const standaloneTasks = filteredTasks.filter(task =>
      task.type !== 'stage' && (!task.parentId || !stageIds.has(task.parentId))
    );
    console.log(`[GanttStages] Found ${standaloneTasks.length} standalone tasks (type !== stage, no parentId)`);

    // 各工程に配下のタスクを紐付け
    const stages: GanttStage[] = stageRecords
      .map((stageRecord): GanttStage | null => {
        const startDateStr = stageRecord.start || stageRecord.予定開始日 || '';
        const endDateStr = stageRecord.end || stageRecord.期限 || '';
        const startDate = parseDate(startDateStr);
        const endDate = parseDate(endDateStr);

        // 日付が不正な場合はスキップ
        if (!startDate || !endDate) {
          return null;
        }

        const project: Project | undefined = projectMap[stageRecord.projectId];
        const assignee = stageRecord.assignee || stageRecord.担当者 || '未設定';

        // この工程に紐づくタスクを取得（type='task' && parentId=stage.id）
        const allStageTasks = filteredTasks.filter(
          task => task.type === 'task' && task.parentId === stageRecord.id
        );

        const stageTasks = allStageTasks
          .filter(task => {
            const taskStart = task.start || task.予定開始日;
            const taskEnd = task.end || task.期限;
            return taskStart && taskEnd;
          })
          .map((task): GanttTask | null => {
            const taskStartDateStr = task.start || task.予定開始日 || '';
            const taskEndDateStr = task.end || task.期限 || '';
            const taskStartDate = parseDate(taskStartDateStr);
            const taskEndDate = parseDate(taskEndDateStr);

            if (!taskStartDate || !taskEndDate) return null;

            // ステータスを変換
            let status: GanttTask['status'] = 'not_started';
            if (task.ステータス === '完了') status = 'completed';
            else if (task.ステータス === '進行中') status = 'in_progress';
            else if (task.ステータス === '保留') status = 'on_hold';
            else if (task.ステータス === '未着手') status = 'not_started';
            else if (task.ステータス === '確認待ち') status = 'in_progress';

            // 今日の日付
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // 開始日
            const startDateOnly = new Date(taskStartDate);
            startDateOnly.setHours(0, 0, 0, 0);

            // 着手日が今日以前で未着手の場合、進行中に変更
            if (status === 'not_started' && startDateOnly <= today) {
              status = 'in_progress';
            }

            // 期限超過チェック
            const isOverdue = taskEndDate < today && status !== 'completed';
            if (isOverdue) {
              status = 'overdue';
            }

            return {
              id: task.id,
              name: task.タスク名 || '（無題）',
              startDate: taskStartDate,
              endDate: taskEndDate,
              assignee: task.assignee || task.担当者 || '未設定',
              progress: 0, // タスクには進捗％を持たせない
              status,
              projectId: task.projectId,
              projectName: project?.物件名 || '（プロジェクト名なし）',
              dependencies: task['依存タスク'] || [],
              milestone: task['マイルストーン'] === true || task['milestone'] === true,
              priority: task.優先度 || '中',
              estimatedHours: task['工数見積(h)'] || 0,
              notificationSettings: task['通知設定'] || {
                開始日: false,
                期限前日: false,
                期限当日: false,
                超過: false,
              },
            };
          })
          .filter((task): task is GanttTask => task !== null);

        // 進捗率を計算（配下タスクの完了割合）
        const progressPct = calculateStageProgress(stageTasks);

        // ステータスを計算
        const tempStage: GanttStage = {
          id: stageRecord.id,
          name: stageRecord.タスク名 || '（無題工程）',
          startDate,
          endDate,
          assignee,
          progressPct,
          status: 'not_started', // 仮の値
          projectId: stageRecord.projectId,
          projectName: project?.物件名 || '（プロジェクト名なし）',
          tasks: stageTasks,
          orderIndex: stageRecord.orderIndex || 0,
        };

        const status = calculateStageStatus(tempStage, stageTasks);

        return {
          ...tempStage,
          status,
        };
      })
      .filter((stage): stage is GanttStage => stage !== null);

    // プロジェクトごとにグループ化
    const projectGroups = new Map<string, GanttStage[]>();
    stages.forEach(stage => {
      if (!projectGroups.has(stage.projectId)) {
        projectGroups.set(stage.projectId, []);
      }
      projectGroups.get(stage.projectId)!.push(stage);
    });

    // 単独タスク（工程に紐付いていないタスク）をプロジェクトごとにグループ化して仮想工程を作成
    const standaloneByProject = new Map<string, typeof standaloneTasks>();
    standaloneTasks.forEach(task => {
      if (!standaloneByProject.has(task.projectId)) {
        standaloneByProject.set(task.projectId, []);
      }
      standaloneByProject.get(task.projectId)!.push(task);
    });

    // 各プロジェクトの単独タスクを「未分類」工程として追加
    standaloneByProject.forEach((tasks, projectId) => {
      const project = projectMap[projectId];

      // タスクをGanttTask形式に変換（日付がなくても含める）
      const ganttTasks: GanttTask[] = tasks
        .map((task): GanttTask => {
          const taskStartDateStr = task.start || task.予定開始日 || '';
          const taskEndDateStr = task.end || task.期限 || '';
          const taskStartDate = parseDate(taskStartDateStr);
          const taskEndDate = parseDate(taskEndDateStr);

          // 日付がない場合はデフォルト値を使用
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const effectiveStart = taskStartDate || today;
          const effectiveEnd = taskEndDate || today;

          let status: GanttTask['status'] = 'not_started';
          if (task.ステータス === '完了') status = 'completed';
          else if (task.ステータス === '進行中') status = 'in_progress';
          else if (task.ステータス === '保留') status = 'on_hold';
          else if (task.ステータス === '未着手') status = 'not_started';
          else if (task.ステータス === '確認待ち') status = 'in_progress';

          const startDateOnly = new Date(effectiveStart);
          startDateOnly.setHours(0, 0, 0, 0);

          if (status === 'not_started' && taskStartDate && startDateOnly <= today) {
            status = 'in_progress';
          }

          const isOverdue = taskEndDate && effectiveEnd < today && status !== 'completed';
          if (isOverdue) {
            status = 'overdue';
          }

          return {
            id: task.id,
            name: task.タスク名 || '（無題）',
            startDate: effectiveStart,
            endDate: effectiveEnd,
            assignee: task.assignee || task.担当者 || '未設定',
            progress: 0,
            status,
            projectId: task.projectId,
            projectName: project?.物件名 || '（プロジェクト名なし）',
            dependencies: task['依存タスク'] || [],
            milestone: task['マイルストーン'] === true || task['milestone'] === true,
            priority: task.優先度 || '中',
            estimatedHours: task['工数見積(h)'] || 0,
            notificationSettings: task['通知設定'] || {
              開始日: false,
              期限前日: false,
              期限当日: false,
              超過: false,
            },
          };
        });

      if (ganttTasks.length === 0) return;

      // 日付範囲を計算
      const dates = ganttTasks.flatMap(t => [t.startDate, t.endDate]);
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

      // 進捗率を計算
      const progressPct = calculateStageProgress(ganttTasks);

      const virtualStage: GanttStage = {
        id: `standalone-${projectId}`,
        name: '工程',
        startDate: minDate,
        endDate: maxDate,
        assignee: '−',
        progressPct,
        status: 'not_started',
        projectId,
        projectName: project?.物件名 || '（プロジェクト名なし）',
        tasks: ganttTasks,
        orderIndex: 999999, // 常に最後に表示
      };

      const status = calculateStageStatus(virtualStage, ganttTasks);
      virtualStage.status = status;

      if (!projectGroups.has(projectId)) {
        projectGroups.set(projectId, []);
      }
      projectGroups.get(projectId)!.push(virtualStage);
    });

    // 各プロジェクト内の工程を orderIndex でソート
    projectGroups.forEach((projectStages) => {
      projectStages.sort((a, b) => {
        const orderA = a.orderIndex || 0;
        const orderB = b.orderIndex || 0;
        if (orderA !== orderB) return orderA - orderB;

        // orderIndex が同じ場合は開始日順
        const startDiff = a.startDate.getTime() - b.startDate.getTime();
        if (startDiff !== 0) return startDiff;

        // 名前順
        return a.name.localeCompare(b.name);
      });
    });

    // プロジェクトを竣工予定日順にソート
    const sortedProjects = Array.from(projectGroups.keys()).sort((a, b) => {
      const projectA = projectMap[a];
      const projectB = projectMap[b];

      const completionDateA = projectA?.竣工予定日 ? parseDate(projectA.竣工予定日) : null;
      const completionDateB = projectB?.竣工予定日 ? parseDate(projectB.竣工予定日) : null;

      const dateA = completionDateA ? completionDateA.getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = completionDateB ? completionDateB.getTime() : Number.MAX_SAFE_INTEGER;

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      const nameA = projectA?.物件名 || '';
      const nameB = projectB?.物件名 || '';
      return nameA.localeCompare(nameB);
    });

    // プロジェクト順に結合
    const sortedStages: GanttStage[] = [];
    sortedProjects.forEach(projectId => {
      sortedStages.push(...projectGroups.get(projectId)!);
    });

    return sortedStages;
  }, [filteredTasks, projectMap]);
  */

  return (
    <div className="h-full flex flex-col gap-0 min-h-0 -mx-4 -my-4 md:-my-6 lg:-mx-8">
      {/* ヘッダー */}
      <section className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-2 sm:px-6 lg:px-8 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[200px]">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
              <span>工程表</span>
              <span className="text-slate-300">/</span>
              <span>{todayLabel}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
              <span>進行中 {tasksActiveToday.length}件</span>
              <span className="text-slate-300">|</span>
              <span>今日開始 {tasksStartingToday}件</span>
              <span className="text-slate-300">|</span>
              <span className={tasksDueToday > 0 ? 'text-rose-600 font-medium' : ''}>
                今日締切 {tasksDueToday}件
              </span>
              <span className="text-slate-300">|</span>
              <span>表示中 {newGanttTasks.length} アイテム</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenTask}
              disabled={!canEdit}
              className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              title={!canEdit ? 'ローカル閲覧中は追加できません' : undefined}
            >
              タスク追加
            </button>
            <button
              type="button"
              onClick={onOpenProject}
              disabled={!canEdit}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
              title={!canEdit ? 'ローカル閲覧中は追加できません' : undefined}
            >
              プロジェクト追加
            </button>
          </div>
        </div>
      </section>

      <div className="border-b border-slate-200 bg-white px-4 py-2 sm:px-6 lg:px-8 flex-shrink-0">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
          <span>フィルターと検索</span>
          <span className="text-slate-400">{filteredTasks.length} 件が条件に一致</span>
        </div>
        <div className="mt-2">
          <Filters {...filtersProps} resultCount={filteredTasks.length} />
        </div>
        {activeFilterChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
            {activeFilterChips.map((chip) => (
              <span key={chip} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>

      {filteredTasks.some(task => !task.start && !task.予定開始日) && (
        <div className="mx-4 my-2 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:mx-6 lg:mx-8">
          <svg className="h-4 w-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{filteredTasks.filter(task => !task.start && !task.予定開始日).length}件のタスクが開始日未設定です</span>
        </div>
      )}

      {/* ガントチャート - 利用可能な高さいっぱいに表示 */}
      <section
        className="flex-1 min-h-0 bg-white"
      >
        {/* 工程・タスク統合ガントチャート */}
        <NewGanttChart
            tasks={newGanttTasks}
            interactive={true}
            projectMap={projectMap}
            people={people}
            allProjectMembers={allProjectMembers}
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

            // onTaskUpdateを使用して確実に保存
            if (onTaskUpdate) {
              onTaskUpdate(task.id, {
                予定開始日: startStr,
                期限: endStr,
                start: startStr,
                end: endStr,
              });
            }
            }}
            onStageAddTask={onStageAddTask}
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

            const formattedStartDate = formatDate(updatedTask.startDate);
            const formattedEndDate = formatDate(updatedTask.endDate);

            const updates: Partial<Task> = {
              タスク名: updatedTask.name,
              予定開始日: formattedStartDate,
              期限: formattedEndDate,
              start: formattedStartDate, // startフィールドも更新
              end: formattedEndDate, // endフィールドも更新
              担当者: updatedTask.assignee,
              担当者メール: updatedTask.assigneeEmail || '', // 担当者メールも保存
              ステータス: statusJa,
              進捗率: updatedTask.progress,
              '依存タスク': updatedTask.dependencies || [],
              マイルストーン: updatedTask.milestone || false,
              優先度: updatedTask.priority || '中',
              '工数見積(h)': updatedTask.estimatedHours || 0,
              '通知設定': updatedTask.notificationSettings || {
                開始日: false,
                期限前日: false,
                期限当日: false,
                超過: false,
              },
              parentId: (updatedTask as any).parentId, // 工程紐づけ（nullも含めて送信）
            };

            console.log('[App.tsx onTaskSave] updatedTask.parentId:', (updatedTask as any).parentId);
            console.log('[App.tsx onTaskSave] Updates to apply:', updates);

            // onTaskUpdateコールバックに委譲
            if (onTaskUpdate) {
              onTaskUpdate(updatedTask.id, updates);
            }
          }}
          onProjectClick={(projectId) => {
            // プロジェクト名クリックでプロジェクト編集ダイアログを開く
            const project = projects.find((p: Project) => p.id === projectId);
            if (project) {
              onEditProject(project);
            }
          }}
          onTaskDelete={async (task) => {
            try {
              await deleteTask(task.id);
              pushToast({ title: `タスク「${task.name}」を削除しました`, tone: 'success' });
            } catch (error) {
              console.error('タスクの削除に失敗しました:', error);
              pushToast({ title: 'タスクの削除に失敗しました', tone: 'error' });
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

interface DangerTaskInfo {
  id: string;
  name: string;
  projectName: string;
  dueDateLabel: string;
  urgencyLabel: string;
  status: string;
  daysDiff: number;
  assignee: string;
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
  } else {
    // autoモード: 本日を中心に前後60日間表示
    const startWindow = new Date(today.getTime() - 60 * DAY_MS);
    const endWindow = new Date(today.getTime() + 60 * DAY_MS);
    clampToWindow(startWindow, endWindow);
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

type WorkloadScale = 'week' | 'month' | 'year';
interface DateRange {
  start: Date;
  end: Date;
}

function WorkloadPage({ filtersProps, tasks, projects }: { filtersProps: FiltersProps; tasks: Task[]; projects: Project[] }) {
  const [timeScale, setTimeScale] = useState<WorkloadScale>('week');
  const referenceDate = useMemo(() => new Date(), []);

  const currentRange = useMemo(() => getPeriodRange(timeScale, referenceDate), [timeScale, referenceDate]);
  const previousRange = useMemo(() => getPreviousRange(currentRange, timeScale), [currentRange, timeScale]);

  const tasksInRange = useMemo(() => filterTasksByRange(tasks, currentRange), [tasks, currentRange]);
  const tasksInPrevRange = useMemo(() => filterTasksByRange(tasks, previousRange), [tasks, previousRange]);
  const workload = useMemo(() => buildWorkload(tasksInRange, currentRange), [tasksInRange, currentRange]);

  const totalHours = useMemo(() => sumTaskHoursInRange(tasksInRange, currentRange), [tasksInRange, currentRange]);
  const previousHours = useMemo(
    () => sumTaskHoursInRange(tasksInPrevRange, previousRange),
    [tasksInPrevRange, previousRange]
  );
  const totalTasks = tasksInRange.length;
  const previousTasks = tasksInPrevRange.length;
  const activeMembers = workload.length;
  const avgHoursPerPerson = activeMembers ? totalHours / activeMembers : 0;

  const revenueSpans = useMemo(() => buildProjectRevenueSpans(projects), [projects]);
  const periodRevenue = useMemo(() => sumRevenueForRange(revenueSpans, currentRange), [revenueSpans, currentRange]);
  const previousRevenue = useMemo(() => sumRevenueForRange(revenueSpans, previousRange), [revenueSpans, previousRange]);
  const completedProjectsCount = useMemo(
    () => countProjectsInRange(revenueSpans, currentRange),
    [revenueSpans, currentRange]
  );

  const hoursDelta = calculateDelta(totalHours, previousHours);
  const tasksDelta = calculateDelta(totalTasks, previousTasks);
  const revenueDelta = calculateDelta(periodRevenue, previousRevenue);

  const timelineData = useMemo(
    () => buildTimelineData(currentRange, timeScale, tasksInRange, revenueSpans),
    [currentRange, timeScale, tasksInRange, revenueSpans]
  );

  const periodLabel = formatPeriodLabel(currentRange, timeScale);
  const comparisonLabel = timeScale === 'week' ? '先週比' : timeScale === 'month' ? '前月比' : '前年比';

  const summaryCards = [
    {
      title: '稼働時間',
      value: `${formatHours(totalHours)} h`,
      delta: hoursDelta,
      note: comparisonLabel,
    },
    {
      title: '対象タスク',
      value: `${totalTasks.toLocaleString()} 件`,
      delta: tasksDelta,
      note: comparisonLabel,
    },
    {
      title: '稼ぎ（施工費ベース）',
      value: formatCurrency(periodRevenue),
      delta: revenueDelta,
      note: completedProjectsCount ? `${completedProjectsCount}件のプロジェクト` : '対象プロジェクトなし',
      accent: 'highlight' as const,
    },
    {
      title: '平均稼働/人',
      value: `${formatHours(avgHoursPerPerson)} h`,
      delta: null,
      note: activeMembers ? `${activeMembers} 名が担当` : '担当者なし',
    },
  ];

  return (
    <div className="space-y-4">
      <Filters {...filtersProps} />
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">対象期間</p>
            <p className="text-lg font-semibold text-slate-900">{periodLabel}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 text-sm font-medium">
            {(['week', 'month', 'year'] as WorkloadScale[]).map((scale) => (
              <button
                key={scale}
                type="button"
                onClick={() => setTimeScale(scale)}
                className={`rounded-full px-3 py-1 transition ${
                  timeScale === scale ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {scale === 'week' ? '週' : scale === 'month' ? '月' : '年'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <SummaryCard key={card.title} {...card} />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 lg:col-span-3">
            {timelineData.length ? (
              <div className="h-[280px]">
                <WorkloadTimelineChart data={timelineData} />
              </div>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-slate-500">
                期間内に稼働や施工費データがありません
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 lg:col-span-2">
            {workload.length ? (
              <div className="h-[280px]">
                <WorkloadChart data={workload} />
              </div>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-slate-500">
                この期間に紐づくタスクはありません
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  note,
  delta,
  accent,
}: {
  title: string;
  value: string;
  note?: string;
  delta: number | null;
  accent?: 'highlight';
}) {
  const deltaLabel =
    delta == null
      ? null
      : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
  const deltaTone =
    delta == null ? '' : delta >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';

  return (
    <div
      className={`flex flex-col rounded-2xl border p-4 ${
        accent === 'highlight'
          ? 'border-amber-200 bg-amber-50/70'
          : 'border-slate-100 bg-slate-50/70'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-2 flex items-center gap-2">
        {deltaLabel && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${deltaTone}`}>{deltaLabel}</span>
        )}
        {note && <span className="text-xs text-slate-500">{note}</span>}
      </div>
    </div>
  );
}

function getPeriodRange(scale: WorkloadScale, reference: Date): DateRange {
  if (scale === 'week') {
    return {
      start: startOfWeek(reference, { weekStartsOn: 1 }),
      end: endOfWeek(reference, { weekStartsOn: 1 }),
    };
  }
  if (scale === 'month') {
    return {
      start: startOfMonth(reference),
      end: endOfMonth(reference),
    };
  }
  return {
    start: startOfYear(reference),
    end: endOfYear(reference),
  };
}

function getPreviousRange(range: DateRange, scale: WorkloadScale): DateRange {
  if (scale === 'week') {
    return getPeriodRange('week', subWeeks(range.start, 1));
  }
  if (scale === 'month') {
    return getPeriodRange('month', subMonths(range.start, 1));
  }
  return getPeriodRange('year', subYears(range.start, 1));
}

function getTaskRange(task: Task): DateRange | null {
  const startSource = task.start ?? task.予定開始日 ?? task.実績開始日 ?? task.実績完了日 ?? task.期限 ?? null;
  const endSource = task.end ?? task.期限 ?? task.実績完了日 ?? task.実績開始日 ?? task.予定開始日 ?? task.start ?? null;
  const start = startSource ? parseDate(startSource) : null;
  const end = endSource ? parseDate(endSource) : null;
  if (!start && !end) return null;
  const safeStart = start ?? end;
  const safeEnd = end ?? start;
  if (!safeStart || !safeEnd) return null;
  return safeStart <= safeEnd ? { start: safeStart, end: safeEnd } : { start: safeEnd, end: safeStart };
}

function getOverlapRange(rangeA: DateRange, rangeB: DateRange): DateRange | null {
  const start = rangeA.start > rangeB.start ? rangeA.start : rangeB.start;
  const end = rangeA.end < rangeB.end ? rangeA.end : rangeB.end;
  return start <= end ? { start, end } : null;
}

function getTaskHoursInRange(task: Task, range: DateRange): number {
  const taskRange = getTaskRange(task);
  if (!taskRange) return 0;
  const overlap = getOverlapRange(taskRange, range);
  if (!overlap) return 0;
  const estimate = toNumber(task['工数見積(h)']);
  if (!estimate) return 0;
  const taskSpanDays = Math.max(1, differenceInCalendarDays(taskRange.end, taskRange.start) + 1);
  const overlapDays = Math.max(1, differenceInCalendarDays(overlap.end, overlap.start) + 1);
  return (estimate * overlapDays) / taskSpanDays;
}

function sumTaskHoursInRange(tasks: Task[], range: DateRange): number {
  return tasks.reduce((sum, task) => sum + getTaskHoursInRange(task, range), 0);
}

function filterTasksByRange(tasks: Task[], range: DateRange): Task[] {
  return tasks.filter((task) => {
    const taskRange = getTaskRange(task);
    return taskRange ? Boolean(getOverlapRange(taskRange, range)) : false;
  });
}

function buildWorkload(tasks: Task[], range: DateRange) {
  const map = new Map<string, { assignee: string; est: number; count: number }>();
  tasks.forEach((task) => {
    const key = (task.assignee ?? task.担当者 ?? '未設定').trim() || '未設定';
    const entry = map.get(key) ?? { assignee: key, est: 0, count: 0 };
    entry.est += getTaskHoursInRange(task, range);
    entry.count += 1;
    map.set(key, entry);
  });
  return Array.from(map.values())
    .filter((item) => item.est > 0)
    .sort((a, b) => b.est - a.est);
}

interface ProjectRevenueSpan {
  projectId: string;
  start: Date;
  end: Date;
  revenue: number;
}

function pickDate(...sources: (string | undefined | null)[]): Date | null {
  for (const source of sources) {
    if (!source) continue;
    const date = parseDate(source);
    if (date) return date;
  }
  return null;
}

function resolveProjectRevenueRange(project: Project): DateRange | null {
  const start = pickDate(project.span?.start, project.開始日, project.着工日, project.現地調査日);
  const end = pickDate(project.span?.end, project.引渡し予定日, project.竣工予定日, project.予定完了日);
  if (!start && !end) return null;
  const safeStart = start ?? end;
  const safeEnd = end ?? start;
  if (!safeStart || !safeEnd) return null;
  return safeStart <= safeEnd ? { start: safeStart, end: safeEnd } : { start: safeEnd, end: safeStart };
}

function buildProjectRevenueSpans(projects: Project[]): ProjectRevenueSpan[] {
  return projects
    .map((project) => {
      const rawAmount = project.施工費;
      const amount = typeof rawAmount === 'number' ? rawAmount : rawAmount ? Number(rawAmount) : 0;
      if (!amount) return null;
      const range = resolveProjectRevenueRange(project);
      if (!range) return null;
      return { projectId: project.id, start: range.start, end: range.end, revenue: amount };
    })
    .filter((span): span is ProjectRevenueSpan => Boolean(span));
}

function getRevenueInRange(span: ProjectRevenueSpan, range: DateRange): number {
  const overlap = getOverlapRange({ start: span.start, end: span.end }, range);
  if (!overlap) return 0;
  const totalDays = Math.max(1, differenceInCalendarDays(span.end, span.start) + 1);
  const overlapDays = Math.max(1, differenceInCalendarDays(overlap.end, overlap.start) + 1);
  return (span.revenue * overlapDays) / totalDays;
}

function sumRevenueForRange(spans: ProjectRevenueSpan[], range: DateRange): number {
  return spans.reduce((sum, span) => sum + getRevenueInRange(span, range), 0);
}

function countProjectsInRange(spans: ProjectRevenueSpan[], range: DateRange): number {
  return spans.filter((span) => Boolean(getOverlapRange({ start: span.start, end: span.end }, range))).length;
}

function calculateDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function formatHours(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
}

function formatCurrency(value: number): string {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function formatPeriodLabel(range: DateRange, scale: WorkloadScale): string {
  if (scale === 'week') {
    return `${format(range.start, 'M/d')} 〜 ${format(range.end, 'M/d')}`;
  }
  if (scale === 'month') {
    return format(range.start, 'yyyy年M月');
  }
  return format(range.start, 'yyyy年');
}

function sumHoursForRange(tasks: Task[], start: Date, end: Date): number {
  return sumTaskHoursInRange(tasks, { start, end });
}

function sumRevenueForWindow(spans: ProjectRevenueSpan[], start: Date, end: Date): number {
  return spans.reduce((sum, span) => sum + getRevenueInRange(span, { start, end }), 0);
}

function buildTimelineData(
  range: DateRange,
  scale: WorkloadScale,
  tasks: Task[],
  revenueSpans: ProjectRevenueSpan[]
) {
  if (scale === 'week') {
    return eachDayOfInterval(range).map((day) => {
      const bucketStart = startOfDay(day);
      const bucketEnd = endOfDay(day);
      return {
        label: format(day, 'M/d'),
        hours: sumHoursForRange(tasks, bucketStart, bucketEnd),
        revenue: sumRevenueForWindow(revenueSpans, bucketStart, bucketEnd),
      };
    });
  }

  if (scale === 'month') {
    const weeks = eachWeekOfInterval(range, { weekStartsOn: 1 });
    return weeks.map((weekStart) => {
      const bucketStart = weekStart < range.start ? range.start : weekStart;
      const bucketEndCandidate = endOfWeek(weekStart, { weekStartsOn: 1 });
      const bucketEnd = bucketEndCandidate > range.end ? range.end : bucketEndCandidate;
      return {
        label: `${format(bucketStart, 'M/d')}〜${format(bucketEnd, 'M/d')}`,
        hours: sumHoursForRange(tasks, bucketStart, bucketEnd),
        revenue: sumRevenueForWindow(revenueSpans, bucketStart, bucketEnd),
      };
    });
  }

  // year
  const months = eachMonthOfInterval(range);
  return months.map((monthStart) => {
    const bucketStart = monthStart < range.start ? range.start : monthStart;
    const bucketEndCandidate = endOfMonth(monthStart);
    const bucketEnd = bucketEndCandidate > range.end ? range.end : bucketEndCandidate;
    return {
      label: format(bucketStart, 'M月'),
      hours: sumHoursForRange(tasks, bucketStart, bucketEnd),
      revenue: sumRevenueForWindow(revenueSpans, bucketStart, bucketEnd),
    };
  });
}

const CRITICAL_THRESHOLD_DAYS = 2;

function buildDangerTasks(tasks: Task[], projectMap: Record<string, Project>): DangerTaskInfo[] {
  const today = startOfDay(new Date());
  return tasks
    .filter((task) => task.ステータス !== '完了')
    .map((task) => {
      const due =
        parseDate(task.期限 ?? task.end ?? task.実績完了日 ?? task.実績開始日 ?? task.予定開始日 ?? task.start ?? null) ||
        null;
      if (!due) return null;
      const diff = differenceInCalendarDays(due, today);
      if (diff > CRITICAL_THRESHOLD_DAYS) return null;
      const projectName = projectMap[task.projectId]?.物件名 || task.projectId;
      const assignee = (task.assignee || task.担当者 || '').trim() || '未設定';
      const urgencyLabel =
        diff < 0
          ? `${Math.abs(diff)}日超過`
          : diff === 0
            ? '本日締切'
            : diff === 1
              ? '明日締切'
              : `${diff}日後`;
      return {
        id: task.id,
        name: task.タスク名 || '（無題）',
        projectName,
        dueDateLabel: format(due, 'M/d (EEE)'),
        urgencyLabel,
        status: task.ステータス,
        daysDiff: diff,
        assignee,
      };
    })
    .filter((item): item is DangerTaskInfo => Boolean(item))
    .sort((a, b) => a.daysDiff - b.daysDiff);
}

function DangerTasksModal({ tasks, onClose }: { tasks: DangerTaskInfo[]; onClose(): void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const dueTodayTasks = tasks.filter((task) => task.daysDiff === 0);
  const otherDangerTasks = tasks.filter((task) => task.daysDiff !== 0);

  const renderTaskCard = (task: DangerTaskInfo) => (
    <div
      key={task.id}
      className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{task.name}</p>
          <p className="text-xs text-slate-500">
            {task.projectName} ・ {task.status}
          </p>
          <p className="mt-1 text-xs text-slate-500">担当: {task.assignee}</p>
        </div>
        <div className="text-right text-sm font-semibold text-rose-600">{task.urgencyLabel}</div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>期限: {task.dueDateLabel}</span>
        {task.daysDiff < 0 ? (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">要対応</span>
        ) : task.daysDiff === 0 ? (
          <span className="rounded-full bg-amber-100/70 px-2 py-0.5 text-amber-700">本日締切</span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">要確認</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">リマインド</p>
            <h3 className="text-lg font-semibold text-slate-900">要注意タスク</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[360px] overflow-y-auto px-6 py-4 space-y-5">
          {dueTodayTasks.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span className="text-slate-900">今日が期限のタスク</span>
                <span>{dueTodayTasks.length}件</span>
              </div>
              <div className="space-y-3">
                {dueTodayTasks.map(renderTaskCard)}
              </div>
            </section>
          )}
          {otherDangerTasks.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span className="text-slate-900">期限が迫っている / 超過タスク</span>
                <span>{otherDangerTasks.length}件</span>
              </div>
              <div className="space-y-3">
                {otherDangerTasks.map(renderTaskCard)}
              </div>
            </section>
          )}
          {tasks.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">危険なタスクはありません。</p>
          )}
        </div>
        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkloadChart({ data }: { data: { assignee: string; est: number; count: number }[] }) {
  return (
    <WorkloadResponsiveContainer width="100%" height="100%">
      <WorkloadBarChart data={data} margin={{ left: 8, right: 16, top: 16, bottom: 16 }}>
        <WorkloadCartesianGrid vertical={false} strokeDasharray="3 3" />
        <WorkloadXAxis dataKey="assignee" tick={{ fontSize: 12 }} />
        <WorkloadYAxis />
        <WorkloadTooltip
          formatter={(value: number, _name, props) => [
            `${Math.round(value)} h`,
            `${props?.payload?.count ?? 0} 件のタスク`,
          ]}
        />
        <WorkloadBar dataKey="est" radius={[6, 6, 0, 0]} fill="#0f172a" />
      </WorkloadBarChart>
    </WorkloadResponsiveContainer>
  );
}

function WorkloadTimelineChart({ data }: { data: { label: string; hours: number; revenue: number }[] }) {
  return (
    <WorkloadResponsiveContainer width="100%" height="100%">
      <WorkloadComposedChart data={data} margin={{ left: 8, right: 16, top: 16, bottom: 16 }}>
        <WorkloadCartesianGrid vertical={false} strokeDasharray="3 3" />
        <WorkloadXAxis dataKey="label" tick={{ fontSize: 12 }} />
        <WorkloadYAxis yAxisId="left" tick={{ fontSize: 11 }} width={40} />
        <WorkloadYAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          width={60}
          tickFormatter={(value) => `¥${Math.round((value as number) / 1000)}k`}
        />
        <WorkloadTooltip
          formatter={(value: number, name: string) =>
            name === 'hours' ? [`${formatHours(value)} h`, '稼働'] : [formatCurrency(value), '稼ぎ']
          }
        />
        <WorkloadArea
          yAxisId="left"
          dataKey="hours"
          type="monotone"
          stroke="#2563eb"
          fill="#93c5fd"
          fillOpacity={0.4}
        />
        <WorkloadLine yAxisId="right" dataKey="revenue" type="monotone" stroke="#f97316" strokeWidth={2} dot={false} />
      </WorkloadComposedChart>
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

const EMPTY_PROJECT_MEMBERS: ProjectMember[] = [];
const EMPTY_PROJECT_STAGES: Task[] = [];

function App() {
  const [state, setState, undo, redo, canUndo, canRedo] = useSnapshot();
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [orgSetupRequired, setOrgSetupRequired] = useState<{ stripeCustomerId?: string | null } | null>(null);
  const [orgSetupForm, setOrgSetupForm] = useState({ orgId: '', orgName: '' });
  const [orgSetupLoading, setOrgSetupLoading] = useState(false);
  const [orgSetupError, setOrgSetupError] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalDefaults, setTaskModalDefaults] = useState<{ projectId?: string; stageId?: string } | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState<'create' | 'edit'>('create');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [managingMembersProject, setManagingMembersProject] = useState<Project | null>(null);
  const [allProjectMembers, setAllProjectMembers] = useState<Map<string, ProjectMember[]>>(new Map());
  const [dangerModalTasks, setDangerModalTasks] = useState<DangerTaskInfo[]>([]);
  const [showDangerModal, setShowDangerModal] = useState(false);
  const loadedProjectMembersRef = useRef<Set<string>>(new Set()); // 既に読み込んだプロジェクトIDを追跡
  const dangerModalShownRef = useRef(false);
  const [allActivityLogs, setAllActivityLogs] = useState<Map<string, any[]>>(new Map());
  const loadedActivityLogsRef = useRef<Set<string>>(new Set()); // 既に読み込んだプロジェクトIDを追跡
  const { user, authReady, authSupported, authError, signIn, signOut } = useFirebaseAuth();
  const [currentUserRole, setCurrentUserRole] = useState<string | undefined>(undefined);
  const [roleChecking, setRoleChecking] = useState(false);
  const toastTimers = useRef<Map<string, number>>(new Map());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [billingAccess, setBillingAccess] = useState<BillingAccessInfo | null>(null);
  const [billingChecking, setBillingChecking] = useState(false);
  const stageProgressMap = useMemo(() => {
    const counters = new Map<string, { done: number; total: number }>();
    const stageDateMap = new Map<string, { start?: Date; end?: Date }>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    state.tasks.forEach((task) => {
      if (task.type === 'stage') {
        if (!counters.has(task.id)) {
          counters.set(task.id, { done: 0, total: 0 });
        }
        const startDate = parseDate(task.start ?? task.予定開始日 ?? task.実績開始日 ?? null);
        const endDate = parseDate(task.end ?? task.期限 ?? task.実績完了日 ?? null);
        stageDateMap.set(task.id, {
          start: startDate ?? undefined,
          end: endDate ?? undefined,
        });
        return;
      }
      if (!task.parentId) return;
      const entry = counters.get(task.parentId) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (task.ステータス === '完了') {
        entry.done += 1;
      }
      counters.set(task.parentId, entry);
    });
    const result: Record<string, number> = {};
    counters.forEach(({ done, total }, stageId) => {
      if (total > 0) {
        result[stageId] = Math.round((done / total) * 100);
        return;
      }
      const dates = stageDateMap.get(stageId);
      if (dates?.end && dates.end.getTime() < today.getTime()) {
        result[stageId] = 100;
      } else {
        result[stageId] = 0;
      }
    });
    return result;
  }, [state.tasks]);

  // 楽観的更新のためのPending Overlayストア
  const { addPending, ackPending, rollbackPending, pending } = usePendingOverlay();

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

  const refreshBillingAccess = useCallback(async () => {
    if (!authReady || !authSupported || !user) {
      setBillingAccess(null);
      setBillingChecking(false);
      return;
    }
    setBillingChecking(true);
    try {
      const info = await getBillingAccess();
      setBillingAccess(info);
    } catch (error) {
      console.error('[App] 課金状態の取得に失敗しました:', error);
    } finally {
      setBillingChecking(false);
    }
  }, [authReady, authSupported, user]);

  const handleCloseDangerModal = useCallback(() => {
    setShowDangerModal(false);
  }, []);

  const openTaskModal = useCallback((defaults?: { projectId?: string; stageId?: string }) => {
    setTaskModalDefaults(defaults ?? null);
    setTaskModalOpen(true);
  }, []);

  const handleTaskModalOpenChange = useCallback((open: boolean) => {
    setTaskModalOpen(open);
    if (!open) {
      setTaskModalDefaults(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      toastTimers.current.forEach((timer: number) => window.clearTimeout(timer));
      toastTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!authReady) {
      return;
    }
    if (!user) {
      setBillingAccess(null);
      setBillingChecking(false);
      return;
    }
    refreshBillingAccess();
  }, [authReady, user, refreshBillingAccess]);

  // 工程編集後にタスクを再読み込みする
  const reloadTasks = useCallback(async () => {
    try {
      const result = await listTasks({});
      console.log('[App.tsx] reloadTasks received', result.tasks.length, 'tasks from API');
      const stagesInResult = result.tasks.filter(t => t.type === 'stage');
      console.log('[App.tsx] Found', stagesInResult.length, 'stages with type=stage:', stagesInResult.map(s => ({ id: s.id, name: s.タスク名, type: s.type, projectId: s.projectId })));
      const normalized = normalizeSnapshot({
        projects: state.projects,
        tasks: result.tasks,
        people: state.people,
      });
      const stagesAfterNormalize = normalized.tasks.filter(t => t.type === 'stage');
      console.log('[App.tsx] After normalization, found', stagesAfterNormalize.length, 'stages');
      setState((prev) => ({
        ...prev,
        tasks: normalized.tasks,
      }));
    } catch (err) {
      console.warn('Failed to reload tasks', err);
    }
  }, [state.projects, state.people, setState]);

const loading = useRemoteData(
  setState,
  authSupported && Boolean(user) && !subscriptionRequired && !orgSetupRequired
);

  const canSync = authSupported && Boolean(user);
  const canEdit = true;

  const normalizeOrgId = useCallback((value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '');
  }, []);

  const handleOrgSetupSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      setOrgSetupLoading(true);
      setOrgSetupError(null);
      try {
        const payload = {
          orgId: normalizeOrgId(orgSetupForm.orgId.trim()),
          orgName: orgSetupForm.orgName.trim(),
        };
        if (!payload.orgId || !payload.orgName) {
          setOrgSetupError('組織IDと組織名を入力してください');
          setOrgSetupLoading(false);
          return;
        }
        await createOrgForStripeSubscriber(payload);
        pushToast({ tone: 'success', title: '組織を作成しました。人員管理に移動します。' });
        setTimeout(() => window.location.assign('/users'), 400);
      } catch (error) {
        if (error instanceof ApiError) {
          const msg =
            error.code === 'ORG_ID_EXISTS'
              ? 'この組織IDは既に使用されています'
              : error.code === 'USER_ALREADY_HAS_ORG'
                ? 'すでに別の組織に所属しています。サインアウトしてアカウントを切り替えるか、管理者に確認してください。'
                : error.code === 'STRIPE_CUSTOMER_ALREADY_LINKED'
                  ? 'このStripe顧客は別の組織に紐付いています。サポートにお問い合わせください。'
                  : error.code === 'STRIPE_CUSTOMER_ID_NOT_FOUND'
                    ? 'Stripeの顧客IDを取得できませんでした。サポートにお問い合わせください。'
                    : error.message || '組織作成に失敗しました';
          setOrgSetupError(msg);
        } else {
          setOrgSetupError('組織作成に失敗しました');
        }
      } finally {
        setOrgSetupLoading(false);
      }
    },
    [normalizeOrgId, orgSetupForm, pushToast]
  );

  // プロジェクトメンバーを一括取得（最適化版：未読み込みのプロジェクトのみ）
  useEffect(() => {
    if (!canSync) return;

    const loadNewMembers = async () => {
      const loadedIds = loadedProjectMembersRef.current;
      const projectsToLoad = state.projects.filter(p => !loadedIds.has(p.id));

      if (projectsToLoad.length === 0) return; // 新しいプロジェクトがない場合は何もしない

      console.log(`[Members API] Loading members for ${projectsToLoad.length} new projects`);

      for (const project of projectsToLoad) {
        try {
          const members = await listProjectMembers(project.id, { status: 'active' });
          setAllProjectMembers(prev => new Map(prev).set(project.id, members));
          loadedIds.add(project.id);
        } catch (error: any) {
          // 404エラーの場合は警告レベルを下げる（プロジェクトがまだFirestoreに保存されていない可能性）
          if (error?.status === 404) {
            console.debug(`Project ${project.id} not found in Firestore, skipping member load`);
          } else {
            console.warn(`Failed to load members for project ${project.id}:`, error);
          }
          setAllProjectMembers(prev => new Map(prev).set(project.id, []));
          loadedIds.add(project.id); // エラーでも読み込み済みとしてマーク
        }
      }
    };

    loadNewMembers();
  }, [state.projects, canSync]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMembersUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string; members?: ProjectMember[] }>).detail;
      const projectId = detail?.projectId;
      const members = detail?.members;
      if (!projectId || !Array.isArray(members)) return;
      setAllProjectMembers((prev) => new Map(prev).set(projectId, members));
      loadedProjectMembersRef.current.add(projectId);
    };

    window.addEventListener('project-members:updated', handleMembersUpdated as EventListener);
    return () => {
      window.removeEventListener('project-members:updated', handleMembersUpdated as EventListener);
    };
  }, [setAllProjectMembers]);

  // 現在のユーザーのロールを取得
  useEffect(() => {
    if (!user) {
      setSubscriptionRequired(false);
      setOrgSetupRequired(null);
      setOrgSetupForm({ orgId: '', orgName: '' });
      setRoleChecking(false);
    }

    if (!user) {
      setCurrentUserRole(undefined);
      return;
    }

    const fetchUserRole = async () => {
      try {
        setRoleChecking(true);
        const userData = await getCurrentUser();
        setCurrentUserRole(userData.role);
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.code === 'ORG_SETUP_REQUIRED') {
            setOrgSetupRequired({ stripeCustomerId: error.data?.stripeCustomerId ?? null });
          } else if (error.status === 401) {
            // 401の場合でもStripe契約があるか確認し、あれば組織作成フローへ
            try {
              const eligibility = await checkOrgSetupEligibility();
              if (eligibility.eligible) {
                setOrgSetupRequired({ stripeCustomerId: eligibility.stripeCustomerId ?? null });
                setSubscriptionRequired(false);
              } else {
                setSubscriptionRequired(true);
              }
            } catch (eligibilityError) {
              console.error('Failed to check org setup eligibility:', eligibilityError);
              setSubscriptionRequired(true);
            }
          } else if (error.status === 402) {
            // 課金未契約・停止時は購読リクエスト画面を表示
            setSubscriptionRequired(true);
            setOrgSetupRequired(null);
            setOrgSetupForm({ orgId: '', orgName: '' });
          } else {
            console.error('Failed to fetch user role:', error);
          }
        } else {
          console.error('Failed to fetch user role:', error);
        }
        setCurrentUserRole(undefined);
      } finally {
        setRoleChecking(false);
      }
    };

    fetchUserRole();
  }, [user]);

  const generateLocalId = useCallback((prefix: string) => {
    return `local-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }, []);

  // Undo/Redoキーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z または Cmd+Z でUndo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          undo();
          pushToast({ tone: 'info', title: '元に戻しました' });
        }
      }
      // Ctrl+Shift+Z または Cmd+Shift+Z でRedo
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (canRedo) {
          redo();
          pushToast({ tone: 'info', title: 'やり直しました' });
        }
      }
      // Ctrl+Y または Cmd+Y でもRedo（Windowsの慣習）
      else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        if (canRedo) {
          redo();
          pushToast({ tone: 'info', title: 'やり直しました' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo, pushToast]);

  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [projectSort, setProjectSort] = useState<ProjectSortKey>('due');
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);

  const projectMap = useMemo(() => {
    const map: Record<string, Project> = {};
    state.projects.forEach((project) => {
      map[project.id] = project;
    });
    return map;
  }, [state.projects]);

  const dangerTasks = useMemo(
    () => buildDangerTasks(state.tasks, projectMap),
    [state.tasks, projectMap]
  );

  const handleStageTaskAdd = useCallback(
    (stage: GanttTask) => {
      openTaskModal({ projectId: stage.projectId, stageId: stage.id });
    },
    [openTaskModal]
  );

  useEffect(() => {
    if (!dangerTasks.length) return;
    if (dangerModalShownRef.current) return;
    dangerModalShownRef.current = true;
    setDangerModalTasks(dangerTasks.slice(0, 8));
    setShowDangerModal(true);
  }, [dangerTasks]);

  const filteredTasks = useMemo(() => {
    // pendingの変更を適用してから、フィルタリング
    const tasksWithPending = applyPendingToTasks(state.tasks, pending);

    const query = search.trim().toLowerCase();
    return tasksWithPending.filter((task) => {
      // 配列が空の場合は全て表示、配列に値がある場合は含まれているかチェック
      const projectMatch = projectFilter.length === 0 || projectFilter.includes(task.projectId);
      const assigneeMatch = assigneeFilter.length === 0 || assigneeFilter.includes(task.assignee ?? task.担当者 ?? '');
      const statusMatch = statusFilter.length === 0 || statusFilter.includes(task.ステータス);
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
  }, [state.tasks, pending, projectFilter, assigneeFilter, statusFilter, search, projectMap]);

  const projectOptions = useMemo(
    () => [
      { value: 'all', label: 'すべてのプロジェクト' },
      ...state.projects.map((project) => ({ value: project.id, label: project.物件名 || project.id })),
    ],
    [state.projects]
  );

  const assigneeOptions = useMemo(() => {
    const names = new Set<string>();
    state.people.forEach((person) => {
      const personType = person.type ?? 'person';
      if (personType === 'client') return;
      const trimmed = person.氏名?.trim();
      if (trimmed) {
        names.add(trimmed);
      }
    });
    allProjectMembers.forEach((members) => {
      members.forEach((member) => {
        const trimmed = member.displayName?.trim();
        if (!trimmed) return;
        const isExternal = member.memberType && member.memberType !== 'internal';
        if (isExternal || !member.email) {
          names.add(trimmed);
        }
      });
    });
    assigneeFilter.forEach((selected) => {
      if (selected) {
        names.add(selected);
      }
    });
    const sortedNames = Array.from(names).sort((a, b) => a.localeCompare(b, 'ja'));
    return [{ value: 'all', label: '全員' }, ...sortedNames.map((name) => ({ value: name, label: name }))];
  }, [state.people, allProjectMembers, assigneeFilter]);

  const statusOptions = useMemo(() => {
    const statuses = new Set<string>();
    state.tasks.forEach((task) => {
      if (task.ステータス) statuses.add(task.ステータス);
    });
    return [{ value: 'all', label: '全て' }, ...Array.from(statuses).map((status) => ({ value: status, label: status }))];
  }, [state.tasks]);

  const archivedProjectsCount = useMemo(
    () => state.projects.filter((project) => isArchivedProjectStatus(project.ステータス)).length,
    [state.projects]
  );

  const hasActiveFilters =
    projectFilter.length > 0 || assigneeFilter.length > 0 || statusFilter.length > 0 || (search ?? '').trim() !== '';

  const resetFilters = () => {
    setProjectFilter([]);
    setAssigneeFilter([]);
    setStatusFilter([]);
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
    onProjectChange: (value) => setProjectFilter(Array.isArray(value) ? value : []),
    onAssigneeChange: (value) => setAssigneeFilter(Array.isArray(value) ? value : []),
    onStatusChange: (value) => setStatusFilter(Array.isArray(value) ? value : []),
    onQueryChange: setSearch,
    onReset: resetFilters,
    hasActiveFilters,
    resultCount: filteredTasks.length,
  };

  const projectsWithDerived: ProjectWithDerived[] = useMemo(() => {
    return state.projects.map((project) => {
      const relatedTasks = state.tasks.filter((task) => task.projectId === project.id && task.type !== 'stage');
      const openTaskCount = relatedTasks.filter((task) => task.ステータス !== '完了').length;
      const nearestDue = relatedTasks
        .map((task) => parseDate(task.end ?? task.期限 ?? task.実績完了日))
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      // 進捗計算: 完了タスク数 / 全タスク数（マイルストーンを除く）
      const nonMilestoneTasks = relatedTasks.filter(task => !task.マイルストーン);
      const completedTasks = nonMilestoneTasks.filter(task => task.ステータス === '完了');
      const progressAggregate = nonMilestoneTasks.length
        ? completedTasks.length / nonMilestoneTasks.length
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

    const baseProjects = showArchivedProjects
      ? projectsWithDerived
      : projectsWithDerived.filter((project) => !isArchivedProjectStatus(project.ステータス));
    const copy = [...baseProjects];
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
  }, [projectsWithDerived, projectSort, showArchivedProjects]);

  const editingProjectId = editingProject?.id ?? null;
  const memoizedProjectMembers = useMemo(() => {
    if (!editingProjectId) return EMPTY_PROJECT_MEMBERS;
    return allProjectMembers.get(editingProjectId) ?? EMPTY_PROJECT_MEMBERS;
  }, [editingProjectId, allProjectMembers]);

  const memoizedProjectStages = useMemo(() => {
    if (!editingProjectId) return EMPTY_PROJECT_STAGES;
    return state.tasks.filter(
      (task) => task.projectId === editingProjectId && task.type === 'stage'
    );
  }, [editingProjectId, state.tasks]);

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
    const normalizedUpdates: Partial<Task> = { ...updates };
    const hasJapaneseAssignee = Object.prototype.hasOwnProperty.call(updates, '担当者');
    const hasEnglishAssignee = Object.prototype.hasOwnProperty.call(updates, 'assignee');
    if (hasJapaneseAssignee) {
      normalizedUpdates.assignee = updates.担当者;
    } else if (hasEnglishAssignee && !hasJapaneseAssignee) {
      normalizedUpdates.担当者 = updates.assignee;
    }

    const hasJapaneseMilestone = Object.prototype.hasOwnProperty.call(updates, 'マイルストーン');
    const hasEnglishMilestone = Object.prototype.hasOwnProperty.call(updates, 'milestone');
    if (hasJapaneseMilestone || hasEnglishMilestone) {
      const milestoneValue = hasJapaneseMilestone ? updates.マイルストーン : updates.milestone;
      const normalizedMilestone = milestoneValue === true;
      normalizedUpdates.マイルストーン = normalizedMilestone;
      normalizedUpdates.milestone = normalizedMilestone;
    }

    const updatesWithTimestamp = {
      ...normalizedUpdates,
      updatedAt: new Date().toISOString(),
    };

    // 1. 楽観的更新：まずUIを即座に更新
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? { ...task, ...updatesWithTimestamp }
          : task
      ),
    }));

    if (!canSync) {
      pushToast({ tone: 'success', title: 'タスクを更新しました（ローカル保存）' });
      return;
    }

    // 2. pendingに追加
    const opId = addPending(taskId, updatesWithTimestamp);

    // 3. バックグラウンドでAPIに保存
    try {
      await updateTask(taskId, normalizedUpdates);

      // 4. ACK - pendingを解除
      ackPending(taskId, opId);

      // 成功時は何もしない（UIは既に更新済み）
      // pushToast({ tone: 'success', title: 'タスクを更新しました' }); // トーストは表示しない
    } catch (err) {
      console.error('Task update error:', err);

      // 5. エラー時はロールバックとpending解除
      rollbackPending(taskId);

      pushToast({ tone: 'error', title: 'タスクの更新に失敗しました', description: String(err) });
      // エラー時はリロードして正しい状態に戻す
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    }
  };

  const handleCreateTask = async (payload: {
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
    parentId?: string | null;
    assignee?: string;
    milestone?: boolean;
  }) => {
    if (!payload.projectId) {
      pushToast({ tone: 'error', title: 'プロジェクトを選択してください' });
      return;
    }

    const normalizedAssignee = payload.assignee ?? payload.担当者 ?? undefined;
    const normalizedMilestone = payload.milestone === true || payload.マイルストーン === true;
    const payloadForApi: Partial<Task> = {
      ...payload,
      担当者: normalizedAssignee,
      assignee: normalizedAssignee,
      マイルストーン: normalizedMilestone,
      milestone: normalizedMilestone,
    };

    if (!canSync) {
      const id = generateLocalId('task');
      const now = todayString();
      const newTask: Task = {
        id,
        projectId: payload.projectId,
        タスク名: payload.タスク名,
        担当者: normalizedAssignee,
        assignee: normalizedAssignee,
        担当者メール: payload.担当者メール,
        ステータス: payload.ステータス,
        優先度: payload.優先度,
        予定開始日: payload.予定開始日,
        期限: payload.期限,
        start: payload.予定開始日,
        end: payload.期限,
        マイルストーン: normalizedMilestone,
        milestone: normalizedMilestone,
        ['工数見積(h)']: payload['工数見積(h)'],
        '通知設定': payload['通知設定'],
        parentId: payload.parentId,
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

    // 楽観的更新: 一時IDでタスクを追加
    const tempId = `temp-${Date.now()}`;
    const now = todayString();
    const optimisticTask: Task = {
        id: tempId,
        projectId: payload.projectId,
        タスク名: payload.タスク名,
        担当者: normalizedAssignee,
        assignee: normalizedAssignee,
        担当者メール: payload.担当者メール,
        ステータス: payload.ステータス,
        優先度: payload.優先度,
        予定開始日: payload.予定開始日,
        期限: payload.期限,
        start: payload.予定開始日,
        end: payload.期限,
        ['工数見積(h)']: payload['工数見積(h)'],
        '通知設定': payload['通知設定'],
        parentId: payload.parentId,
        マイルストーン: normalizedMilestone,
        milestone: normalizedMilestone,
        progress: 0,
        createdAt: now,
        updatedAt: now,
      };

    setState((prev) => ({
      ...prev,
      tasks: [...prev.tasks, optimisticTask],
    }));

    try {
      const result = await createTask(payloadForApi);
      // 成功: 一時タスクを実際のタスクで置き換え
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === tempId ? { ...optimisticTask, id: result.id } : t)),
      }));
      toast.success('タスクを追加しました');
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error(error);
      // 失敗: 一時タスクを削除
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== tempId),
      }));
      toast.error('タスクの追加に失敗しました');
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

    // サーバー同期モードの場合は認証チェック
    if (!user) {
      console.error('[Project] No authenticated user found');
      pushToast({
        tone: 'error',
        title: 'ログインが必要です',
        description: 'プロジェクトを保存するには、先にログインしてください。',
      });
      return;
    }

    try {
      console.debug('[Project] Authenticated user:', { uid: user.uid, email: user.email });
      await createProject(payload as unknown as Partial<Project>);
      pushToast({ tone: 'success', title: 'プロジェクトを追加しました' });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error('[Project] Failed to create project:', error);
      const errorMessage = error instanceof Error ? error.message : 'プロジェクトの追加に失敗しました';
      pushToast({ tone: 'error', title: 'エラー', description: errorMessage });
    }
  };

  // 楽観的更新: プロジェクトを即座にstateに反映
  const handleProjectOptimisticUpdate = (updatedProject: Project) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === updatedProject.id ? { ...p, ...updatedProject, updatedAt: todayString() } : p
      ),
    }));
  };

  // ロールバック: API失敗時に元のプロジェクトに戻す
  const handleProjectRollback = (projectId: string, prevProject: Project) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === projectId ? prevProject : p)),
    }));
  };

  const handleDeleteProject = async (project: Project) => {
    if (!confirm(`プロジェクト「${project.物件名}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    if (!canSync) {
      setState((current) => ({
        ...current,
        projects: current.projects.filter((p) => p.id !== project.id),
      }));
      pushToast({ tone: 'success', title: 'プロジェクトを削除しました（ローカル保存）' });
      return;
    }

    try {
      await deleteProject(project.id);
      pushToast({ tone: 'success', title: `プロジェクト「${project.物件名}」を削除しました` });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error('[Project] Failed to delete project:', error);
      const errorMessage = error instanceof Error ? error.message : 'プロジェクトの削除に失敗しました';
      pushToast({ tone: 'error', title: 'エラー', description: errorMessage });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (!confirm(`タスク「${task.タスク名}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    if (!canSync) {
      setState((current) => ({
        ...current,
        tasks: current.tasks.filter((t) => t.id !== taskId),
      }));
      pushToast({ tone: 'success', title: 'タスクを削除しました（ローカル保存）' });
      return;
    }

    try {
      await deleteTask(taskId);
      pushToast({ tone: 'success', title: `タスク「${task.タスク名}」を削除しました` });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error('[Task] Failed to delete task:', error);
      const errorMessage = error instanceof Error ? error.message : 'タスクの削除に失敗しました';
      pushToast({ tone: 'error', title: 'エラー', description: errorMessage });
    }
  };

  const handleCreatePerson = async (payload: {
    type?: 'person' | 'client';
    氏名: string;
    役割?: string;
    部署?: string;
    会社名?: string;
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
        type: payload.type || 'person',
        氏名: payload.氏名,
        役割: payload.役割,
        部署: payload.部署,
        会社名: payload.会社名,
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
      const entityType = (payload.type || 'person') === 'client' ? 'クライアント' : '担当者';
      pushToast({ tone: 'success', title: `${entityType}を追加しました（ローカル保存）` });
      return;
    }
    try {
      await createPerson(payload as unknown as Partial<Person>);
      const entityType = (payload.type || 'person') === 'client' ? 'クライアント' : '担当者';
      pushToast({ tone: 'success', title: `${entityType}を追加しました` });
      window.dispatchEvent(new CustomEvent('snapshot:reload'));
    } catch (error) {
      console.error(error);
      const entityType = (payload.type || 'person') === 'client' ? 'クライアント' : '担当者';
      pushToast({ tone: 'error', title: `${entityType}の追加に失敗しました` });
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

    let savedProjectId: string | undefined;

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
        savedProjectId = id;
        pushToast({ tone: 'success', title: 'プロジェクトを追加しました（ローカル保存）' });
      } else {
        // サーバー同期モードの場合は認証チェック
        if (!user) {
          console.error('[Project] No authenticated user found');
          pushToast({
            tone: 'error',
            title: 'ログインが必要です',
            description: 'プロジェクトを保存するには、先にログインしてください。',
          });
          throw new Error('認証が必要です');
        }

        try {
          console.debug('[Project] Authenticated user:', { uid: user.uid, email: user.email });
          const result = await createProject(clean);
          savedProjectId = result.id;
          pushToast({ tone: 'success', title: 'プロジェクトを追加しました' });
          // 再取得して描画
          const list = await listProjects();
          setState((prev) => ({ ...prev, projects: list.projects }));
        } catch (error) {
          console.error('[Project] Failed to create project:', error);
          const errorMessage = error instanceof Error ? error.message : 'プロジェクトの追加に失敗しました';
          pushToast({ tone: 'error', title: 'エラー', description: errorMessage });
          throw error; // Re-throw to prevent dialog from closing
        }
      }
    } else {
      // 編集モード
      console.debug('[Project] mode=edit → PATCH /api/projects/:id', editingProject?.id);
      if (!editingProject?.id) throw new Error('Missing id for edit');

      savedProjectId = editingProject.id;

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
        updatedAt: new Date().toISOString(),
      } as Partial<Task>;

      // 1. 楽観的更新：即座にUIを更新
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
      }));

      if (!canSync) {
        pushToast({ tone: 'success', title: '担当者を更新しました（ローカル保存）' });
        return;
      }

      // 2. pendingに追加
      const opId = addPending(taskId, updates);

      try {
        // 3. APIを呼び出し
        await updateTask(taskId, { 担当者: assignee });

        // 4. ACK - pendingを解除
        ackPending(taskId, opId);

        // pushToast({ tone: 'success', title: '担当者を更新しました' }); // トーストは表示しない

        // ⚠️ リロードイベントは発火しない
        // window.dispatchEvent(new CustomEvent('snapshot:reload'));
      } catch (error) {
        console.error(error);

        // 5. エラー時はロールバックとpending解除
        rollbackPending(taskId);

        setState((current) => ({
          ...current,
          tasks: current.tasks.map((task) => (task.id === taskId ? previousSnapshot : task)),
        }));
        pushToast({ tone: 'error', title: '担当者の更新に失敗しました' });

        // エラー時はリロードして正しい状態に戻す
        window.dispatchEvent(new CustomEvent('snapshot:reload'));
      }
    },
    [canSync, state.tasks, addPending, ackPending, rollbackPending]
  );

  const handleTaskDateChange = useCallback(
    async (
      taskId: string,
      payload: { start: string; end: string; kind: 'move' | 'resize-start' | 'resize-end' }
    ) => {
      const updates = {
        start: payload.start,
        end: payload.end,
        予定開始日: payload.start,
        期限: payload.end,
        duration_days: calculateDuration(payload.start, payload.end),
        updatedAt: new Date().toISOString(),
      } as Partial<Task>;

      // 1. 楽観的更新：即座にUIを更新
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
      }));

      if (!canSync) {
        pushToast({ tone: 'success', title: 'スケジュールを更新しました（ローカル保存）' });
        return;
      }

      // 2. pendingに追加（3秒間ロック）
      const opId = addPending(taskId, updates);

      try {
        // 3. APIを呼び出し
        await moveTaskDates(taskId, {
          予定開始日: payload.start,
          期限: payload.end,
          start: payload.start,
          end: payload.end
        });

        // 4. ACK - pendingを解除
        ackPending(taskId, opId);

        // pushToast({ tone: 'success', title: 'スケジュールを更新しました' }); // トーストは表示しない（即座に反映されるため）

        // ⚠️ リロードイベントは発火しない（pending中のデータが巻き戻らないようにするため）
        // window.dispatchEvent(new CustomEvent('snapshot:reload'));
      } catch (error) {
        console.error(error);

        // 5. エラー時はロールバックとpending解除
        rollbackPending(taskId);

        // 元の状態に戻す
        setState((current) => ({
          ...current,
          tasks: current.tasks.map((task) => {
            if (task.id === taskId) {
              // updatesを取り消し
              const reverted = { ...task };
              delete (reverted as any).start;
              delete (reverted as any).end;
              delete (reverted as any).予定開始日;
              delete (reverted as any).期限;
              return reverted;
            }
            return task;
          }),
        }));

        pushToast({ tone: 'error', title: 'スケジュールの更新に失敗しました' });

        // エラー時はリロードして正しい状態に戻す
        window.dispatchEvent(new CustomEvent('snapshot:reload'));
      }
    },
    [canSync, setState, addPending, ackPending, rollbackPending]
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

  if (authReady && authSupported && !user) {
    return (
      <>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <SignInRequired onSignIn={signIn} authError={authError} />
      </>
    );
  }

  // ロール判定が完了するまで他画面を描画しない（無権限API呼び出しを防ぐ）
  if (user && roleChecking) {
    return (
      <>
        <FullScreenLoader message="権限を確認しています..." />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (subscriptionRequired) {
    return (
      <>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center px-6">
          <div className="max-w-2xl w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-6 shadow-2xl">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.2em] text-indigo-200">Welcome to Compass</p>
              <h1 className="text-2xl font-bold text-white">サブスクリプションの登録が必要です</h1>
              <p className="text-slate-200 text-sm leading-relaxed">
                まだ招待またはご契約が確認できません。登録後に、組織作成・工程管理・通知連携などすべての機能をご利用いただけます。
              </p>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-100">
              <li className="flex items-start gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-300 mt-0.5" />
                <span>工程/タスク管理とガントチャート</span>
              </li>
              <li className="flex items-start gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-300 mt-0.5" />
                <span>チーム招待と権限管理</span>
              </li>
              <li className="flex items-start gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-300 mt-0.5" />
                <span>通知・カレンダー連携</span>
              </li>
              <li className="flex items-start gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-300 mt-0.5" />
                <span>サポート: compass@archi-prisma.co.jp</span>
              </li>
            </ul>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="https://buy.stripe.com/dRm00l0J75OR3eV8Cbf7i00"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-semibold shadow-lg shadow-indigo-900/30 transition"
              >
                サブスクリプションを申し込む
              </a>
              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                  setOrgSetupRequired({ stripeCustomerId: null });
                  setSubscriptionRequired(false);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold shadow-lg shadow-emerald-900/30 transition"
              >
                サブスク登録済みならこちら
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-white/20 text-sm font-semibold text-white hover:bg-white/5 transition"
              >
                再読み込み
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (orgSetupRequired) {
    const stripeId = orgSetupRequired.stripeCustomerId ?? '';
    return (
      <>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white flex items-center justify-center px-6">
          <div className="max-w-5xl w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 space-y-8 shadow-2xl">
            <div className="flex flex-col gap-3">
              <p className="text-sm uppercase tracking-[0.25em] text-indigo-200">Organization Setup</p>
              <h1 className="text-3xl font-bold text-white">ご契約ありがとうございます。まず組織を作成しましょう。</h1>
              <p className="text-slate-200 text-sm leading-relaxed">
                Stripeでご契約が確認できました。下のフォームから組織IDと名称を登録すると、自動的に管理者として設定され、人員管理（/users）からメンバー招待を開始できます。課金IDの登録が必要な場合はサポートまでご連絡ください。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="mt-1 rounded-full bg-indigo-600/30 p-2 border border-indigo-400/40">
                  <Wand2 className="h-5 w-5 text-indigo-200" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">ステップ1: 組織作成</p>
                  <p className="text-xs text-slate-200">IDと名称を入力して組織を登録。あなたが管理者になります。</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="mt-1 rounded-full bg-emerald-600/30 p-2 border border-emerald-400/40">
                  <Building2 className="h-5 w-5 text-emerald-200" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">ステップ2: Customer ID を控える</p>
                  <p className="text-xs text-slate-200">下記の Customer ID をサポート/担当者に共有しておくと、課金紐付けが円滑です。</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="mt-1 rounded-full bg-orange-600/30 p-2 border border-orange-400/40">
                  <Rocket className="h-5 w-5 text-orange-200" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">ステップ3: メンバー招待</p>
                  <p className="text-xs text-slate-200">人員管理（/users）から招待リンクを発行し、チームに共有。</p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                  <p className="text-xs text-indigo-200">Stripe Customer ID（控えがあれば記録）</p>
                  <p className="text-lg font-mono font-semibold text-white break-all">{stripeId || '取得できませんでした'}</p>
                </div>
              <button
                type="button"
                onClick={() => {
                  if (!stripeId) return;
                  navigator.clipboard.writeText(stripeId).then(() => pushToast({ tone: 'success', title: 'コピーしました' }));
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold border border-white/20 transition"
              >
                コピー
              </button>
            </div>

            <form onSubmit={handleOrgSetupSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">組織名</label>
                  <input
                    type="text"
                    value={orgSetupForm.orgName}
                    onChange={(e) => setOrgSetupForm((prev) => ({ ...prev, orgName: e.target.value }))}
                    placeholder="例: 株式会社コンパス"
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">組織ID（URL等で使用）</label>
                  <input
                    type="text"
                    value={orgSetupForm.orgId}
                    onChange={(e) => setOrgSetupForm((prev) => ({ ...prev, orgId: e.target.value }))}
                    onBlur={(e) => setOrgSetupForm((prev) => ({ ...prev, orgId: e.target.value ? e.target.value.toLowerCase() : '' }))}
                    placeholder="例: compass-team"
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <p className="text-xs text-slate-300 mt-1">小文字英数字とハイフンのみ使用できます</p>
                </div>
                {orgSetupError && <p className="text-xs text-rose-300">{orgSetupError}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={orgSetupLoading}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-semibold shadow-lg shadow-indigo-900/30 transition disabled:opacity-50"
                  >
                    {orgSetupLoading ? '作成中...' : '組織を作成する'}
                  </button>
                </div>
              </div>
                <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white mb-2">使えるようになること</p>
                  <div className="space-y-3 text-sm text-slate-100">
                    <div className="flex gap-3 items-start">
                      <CheckCircle2 className="h-4 w-4 text-emerald-300 mt-1" />
                      <div>
                        <p className="font-semibold">工程・タスク管理</p>
                        <p className="text-xs text-slate-300">ガント、進捗、担当アサイン、通知などフル機能</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <CheckCircle2 className="h-4 w-4 text-emerald-300 mt-1" />
                      <div>
                        <p className="font-semibold">メンバー招待と権限</p>
                        <p className="text-xs text-slate-300">人員管理（/users）から招待・権限付与</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <CheckCircle2 className="h-4 w-4 text-emerald-300 mt-1" />
                      <div>
                        <p className="font-semibold">サポート</p>
                        <p className="text-xs text-slate-300">compass@archi-prisma.co.jp が直接サポート</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-300 space-y-1">
                    <a
                      href="mailto:compass@archi-prisma.co.jp?subject=Compass%20%E7%B5%84%E7%B9%94%E4%BD%9C%E6%88%90%E3%82%B5%E3%83%9D%E3%83%BC%E3%83%88&body=Stripe%20Customer%20ID%3A%20"
                      className="inline-flex items-center gap-2 text-indigo-200 hover:text-white transition"
                    >
                      <span>サポートに連絡する</span>
                    </a>
                  </div>
                </div>
            </form>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <AppLayout
        onOpenTask={() => openTaskModal()}
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
        loading={loading}
      >
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
                onOpenTask={() => openTaskModal()}
                onOpenProject={() => {
                  setProjectDialogMode('create');
                  setEditingProject(null);
                  setProjectDialogOpen(true);
                }}
                onOpenPerson={() => setPersonModalOpen(true)}
                onEditPerson={setEditingPerson}
                onEditProject={(project) => {
                  setProjectDialogMode('edit');
                  setEditingProject(project);
                  setProjectDialogOpen(true);
                }}
                pushToast={pushToast}
                setState={setState}
                canEdit={canEdit}
                canSync={canSync}
                allProjectMembers={allProjectMembers}
                onStageAddTask={handleStageTaskAdd}
                stageProgressMap={stageProgressMap}
              />
            }
          />
          <Route
            path="/summary"
            element={
              <DashboardPage
                projects={sortedProjects}
                filteredTasks={filteredTasks}
                allTasks={state.tasks}
                filtersProps={filtersProps}
                onOpenTask={() => openTaskModal()}
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
                allProjectMembers={allProjectMembers}
                showArchivedProjects={showArchivedProjects}
                archivedProjectsCount={archivedProjectsCount}
                onToggleArchivedProjects={() => setShowArchivedProjects((prev) => !prev)}
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
                people={state.people}
                onComplete={handleComplete}
                onTaskUpdate={handleTaskUpdate}
                onDeleteTask={handleDeleteTask}
                onOpenTask={() => openTaskModal()}
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
                onOpenTask={() => openTaskModal()}
                onOpenProject={() => {
                  setProjectDialogMode('create');
                  setEditingProject(null);
                  setProjectDialogOpen(true);
                }}
                onOpenPerson={() => setPersonModalOpen(true)}
                onEditPerson={setEditingPerson}
                onEditProject={(project) => {
                  setProjectDialogMode('edit');
                  setEditingProject(project);
                  setProjectDialogOpen(true);
                }}
                pushToast={pushToast}
                setState={setState}
                canEdit={canEdit}
                canSync={canSync}
                allProjectMembers={allProjectMembers}
                onStageAddTask={handleStageTaskAdd}
                stageProgressMap={stageProgressMap}
              />
            }
          />
          <Route
            path="/workload"
            element={<WorkloadPage filtersProps={filtersProps} tasks={filteredTasks} projects={state.projects} />}
          />
          <Route path="/users" element={<UserManagement projects={state.projects} />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/admin" element={<AdminPage user={user} currentUserRole={currentUserRole} />} />
        </Routes>
      </AppLayout>
      <TaskModal
        open={taskModalOpen}
        onOpenChange={handleTaskModalOpenChange}
        projects={state.projects}
        people={state.people}
        onSubmit={handleCreateTask}
        onNotify={pushToast}
        defaultProjectId={taskModalDefaults?.projectId}
        defaultStageId={taskModalDefaults?.stageId}
        allowContinuousCreate
      />
      <TaskModal
        open={Boolean(editingTask)}
        onOpenChange={(open) => !open && setEditingTask(null)}
        projects={state.projects}
        people={state.people}
        editingTask={editingTask}
        onSubmit={handleCreateTask}
        onUpdate={handleTaskUpdate}
        onDelete={handleDeleteTask}
        onNotify={pushToast}
      />
      <ProjectModal open={projectModalOpen} onOpenChange={setProjectModalOpen} onSubmit={handleCreateProject} onNotify={pushToast} />
      <PersonModal open={personModalOpen} onOpenChange={setPersonModalOpen} onSubmit={handleCreatePerson} onNotify={pushToast} />
      {projectDialogOpen && (
        <ProjectEditDialog
          project={editingProject || null}
          mode={projectDialogMode}
          onClose={() => {
            setProjectDialogOpen(false);
            setEditingProject(null);
          }}
          onSave={handleSaveProject}
          onSaveLocal={handleProjectOptimisticUpdate}
          onRollback={handleProjectRollback}
          onDelete={handleDeleteProject}
          onTaskCreate={async (taskData) => {
            await handleCreateTask({
              projectId: taskData.projectId || '',
              タスク名: taskData.タスク名 || '',
              担当者: taskData.担当者,
              担当者メール: taskData.担当者メール,
              予定開始日: taskData.予定開始日,
              期限: taskData.期限,
              優先度: taskData.優先度 || '中',
              ステータス: taskData.ステータス || '未着手',
              ['工数見積(h)']: taskData['工数見積(h)'],
              parentId: taskData.parentId ?? null,
              マイルストーン: taskData.マイルストーン,
              '通知設定': taskData['通知設定'],
            });
          }}
          people={state.people}
          projectMembers={memoizedProjectMembers}
          stages={memoizedProjectStages}
          onStagesChanged={reloadTasks}
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
      {showDangerModal && dangerModalTasks.length > 0 && (
        <DangerTasksModal tasks={dangerModalTasks} onClose={handleCloseDangerModal} />
      )}
      <BillingGateOverlay billing={billingAccess} loading={billingChecking} onRetry={refreshBillingAccess} />
    </>
  );
}

export default App;

