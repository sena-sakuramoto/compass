import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
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
  Search,
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
  updateStage,
  deleteStage,
  listActivityLogs,
  listUserProjects,
  ApiError,
  getCurrentUser,
  getBillingAccess,
  createOrgForStripeSubscriber,
  checkOrgSetupEligibility,
  checkOrgIdAvailability,
} from './lib/api';
import type { BillingAccessInfo } from './lib/api';
import { Filters } from './components/Filters';
import { ProjectCard } from './components/ProjectCard';
import { TaskCard, computeProgress } from './components/TaskCard';
import { TaskTable, TaskTableRow, TaskTableSortDirection, TaskTableSortKey } from './components/TaskTable';
import { GanttDatum } from './components/GanttChart';
import { GanttChart as NewGanttChart, GanttTask } from './components/GanttChart/GanttChart';
import GanttPrintView from './components/GanttChart/GanttPrintView';
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
import type { Project, Task, Person, SnapshotPayload, TaskNotificationSettings, Stage, CompassState } from './lib/types';
import type { ProjectMember } from './lib/auth-types';
import { PROJECT_ROLE_LABELS } from './lib/auth-types';
import { isArchivedProjectStatus, isClosedProjectStatus, STATUS_PROGRESS } from './lib/constants';
import { clampToSingleDecimal, parseHoursInput } from './lib/number';
import { getCachedIdToken } from './lib/authToken';
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
  addWeeks,
  addMonths,
  addYears,
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
import { useJapaneseHolidaySet } from './lib/japaneseHolidays';
import { getCachedSnapshot, cacheSnapshot, cacheProjectMembers, getAllCachedProjectMembers } from './lib/idbCache';
import type { User } from 'firebase/auth';
import { usePendingOverlay, applyPendingToTasks } from './state/pendingOverlay';
import { calculateProjectStatus } from './lib/projectStatus';
import {
  WorkloadScale,
  DateRange,
  ProjectRevenueSpan,
  WorkloadSummaryRow,
  getPeriodRange,
  getPreviousRange,
  getTaskRange,
  getOverlapRange,
  getTaskHoursInRange,
  sumTaskHoursInRange,
  filterTasksByRange,
  countTasksInRange,
  sumHoursForRange,
  buildActiveDaysByAssignee,
  buildWorkload,
  buildProjectRevenueSpans,
  getRevenueInRange,
  sumRevenueForRange,
  sumRevenueForWindow,
  countProjectsInRange,
  calculateDelta,
  buildTimelineData,
  buildWeeklySummary,
  buildMonthlySummary,
} from './lib/workload';
import { formatHours, formatCurrency, formatPeriodLabel, escapeCsvValue, downloadCsv } from './lib/formatting';
import { buildGantt, TimeScale, GanttItemInput, BuildGanttOptions, DangerTaskInfo } from './lib/gantt';
import { PEOPLE_CACHE_TTL_MS, readPeopleCache, writePeopleCache, buildMemberNamesFromMembers } from './lib/peopleCache';
import { DangerTasksModal } from './components/Modals/DangerTasksModal';
import { Modal, ModalProps } from './components/Modals/Modal';
import { TaskModal } from './components/Modals/TaskModal';
import { ProjectModal } from './components/Modals/ProjectModal';
import { PersonModal } from './components/Modals/PersonModal';
import { StageEditModal } from './components/Modals/StageEditModal';
import { SummaryCard } from './components/Charts/SummaryCard';
import { WorkloadChart, WorkloadTimelineChart } from './components/Charts/WorkloadCharts';
import { useSnapshot } from './hooks/useSnapshot';
import { useRemoteData } from './hooks/useRemoteData';

type ToastInput = {
  tone: ToastMessage['tone'];
  title: string;
  description?: string;
  duration?: number;
};

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
  actionPanel,
  loading,
  sidebarPanel,
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
  actionPanel?: React.ReactNode;
  loading?: boolean;
  sidebarPanel?: React.ReactNode;
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
    <div className="app-root h-screen flex flex-col bg-slate-50">
      <div className="no-print">
        <Sidebar
          user={user}
          onSignOut={onSignOut}
          loading={loading}
          panel={
            <>
              {actionPanel}
              {sidebarPanel}
            </>
          }
        />
      </div>
      <div className="app-content flex-1 flex flex-col lg:pl-56 min-h-0">
        <header className="no-print flex-shrink-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
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
        <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 lg:px-8">
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
  }, [checkOrgSetupEligibility]);

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

type ProjectSortKey = 'due' | 'progress' | 'tasks' | 'priority';

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
  onRequestProjectMembers,
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
  onRequestProjectMembers?: (projectId: string) => void;
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

  const sortOptions: { value: ProjectSortKey; label: string }[] = [
    { value: 'due', label: '期限が近い順' },
    { value: 'progress', label: '進捗が低い順' },
    { value: 'tasks', label: '未完了が多い順' },
    { value: 'priority', label: '優先度が高い順' },
  ];

  // 役職フィールドがないプロジェクトのために、メンバーを読み込む
  useEffect(() => {
    if (!onRequestProjectMembers) return;
    projects.forEach((project) => {
      const hasRoleFields = project.営業 || project.PM || project.設計 || project.施工管理;
      if (!hasRoleFields) {
        onRequestProjectMembers(project.id);
      }
    });
  }, [projects, onRequestProjectMembers]);

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
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {archivedProjectsCount > 0
              ? showArchivedProjects
                ? `${archivedProjectsCount}件の完了/失注/引渡し済みプロジェクトを表示中です`
                : `${archivedProjectsCount}件の完了/失注/引渡し済みプロジェクトを非表示にしています`
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
          <div className="hidden md:block" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              条件に一致するプロジェクトがありません。フィルタを調整するか、新しいプロジェクトを追加してください。
            </div>
          ) : (
            projects.map((project) => {
              // プロジェクトに関連するタスクを取得（工程は除外）
              const relatedTasks = allTasks.filter((task) => task.projectId === project.id && task.type !== 'stage');

              let dueLabel: string | undefined;
              let overdue = false;

              // プロジェクトが完了/失注している場合は期限超過判定をスキップ
              const isProjectCompleted = isClosedProjectStatus(calculateProjectStatus(project));

              if (isProjectCompleted) {
                // 完了済みプロジェクトは期限表示なし
                dueLabel = undefined;
                overdue = false;
              } else {
                // 期限超過タスクをチェック（サマリーと同じロジック、工程は除外）
                const overdueTasks = relatedTasks.filter((task) => {
                  if (task.type === 'stage') return false;
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

              // 役職フィールドの取得（フォールバック対応）
              const members = allProjectMembers.get(project.id) || [];
              const hasRoleFields = project.営業 || project.PM || project.設計 || project.施工管理;

              // 役職フィールドがない場合、project_membersから動的に生成
              let 営業 = project.営業 || undefined;
              let PM = project.PM || undefined;
              let 設計 = project.設計 || undefined;
              let 施工管理 = project.施工管理 || undefined;

              if (!hasRoleFields && members.length > 0) {
                const roleMap: Record<string, Set<string>> = {
                  営業: new Set(),
                  PM: new Set(),
                  設計: new Set(),
                  施工管理: new Set(),
                };
                members.forEach((member) => {
                  if (!member.jobTitle) return;
                  const name = member.displayName?.trim() || member.email?.split('@')[0]?.trim() || '';
                  if (!name) return;
                  if (roleMap[member.jobTitle]) {
                    roleMap[member.jobTitle].add(name);
                  }
                });
                営業 = roleMap.営業.size > 0 ? Array.from(roleMap.営業).sort((a, b) => a.localeCompare(b, 'ja')).join('、') : undefined;
                PM = roleMap.PM.size > 0 ? Array.from(roleMap.PM).sort((a, b) => a.localeCompare(b, 'ja')).join('、') : undefined;
                設計 = roleMap.設計.size > 0 ? Array.from(roleMap.設計).sort((a, b) => a.localeCompare(b, 'ja')).join('、') : undefined;
                施工管理 = roleMap.施工管理.size > 0 ? Array.from(roleMap.施工管理).sort((a, b) => a.localeCompare(b, 'ja')).join('、') : undefined;
              }

              return (
                <motion.div key={project.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                  <ProjectCard
                    id={project.id}
                    name={project.物件名 || project.id}
                    status={calculateProjectStatus(project)}
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
  onCollapseAll?: () => void;
  onExpandAll?: () => void;
  dimOthersEnabled?: boolean;
  onDimOthersToggle?: () => void;
}

interface ProjectWithDerived extends Project {
  taskCount: number;
  openTaskCount: number;
  nearestDue?: string | null;
}

function TasksPage({
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
  const [sortKey, setSortKey] = useState<TaskTableSortKey>('status');
  const [sortDirection, setSortDirection] = useState<TaskTableSortDirection>('asc');

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
    const direction = sortDirection === 'asc' ? 1 : -1;
    const statusOrder = { '未着手': 0, '進行中': 1, '完了': 2 };
    const priorityOrder = { '高': 0, '中': 1, '低': 2 };

    const compareStrings = (aValue: string, bValue: string) => aValue.localeCompare(bValue, 'ja') * direction;
    const compareNumbers = (aValue: number, bValue: number) => (aValue - bValue) * direction;
    const parseEffort = (value: string) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
    };
    const parseScheduleDate = (row: TaskTableRow) => {
      const date = parseDate(row.scheduleEnd ?? row.scheduleStart ?? null);
      return date ? date.getTime() : Number.POSITIVE_INFINITY;
    };

    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'completed': {
          const aDone = a.status === '完了' ? 1 : 0;
          const bDone = b.status === '完了' ? 1 : 0;
          return compareNumbers(aDone, bDone);
        }
        case 'name':
          return compareStrings(a.name, b.name);
        case 'project':
          return compareStrings(a.projectLabel, b.projectLabel);
        case 'assignee':
          return compareStrings(a.assignee, b.assignee);
        case 'schedule':
          return compareNumbers(parseScheduleDate(a), parseScheduleDate(b));
        case 'effort':
          return compareNumbers(parseEffort(a.effort), parseEffort(b.effort));
        case 'progress': {
          const aProgress = computeProgress(a.progress, a.status);
          const bProgress = computeProgress(b.progress, b.status);
          return compareNumbers(aProgress, bProgress);
        }
        case 'priority':
          return compareNumbers(
            priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3,
            priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3
          );
        case 'status':
        default:
          return compareNumbers(
            statusOrder[a.status as keyof typeof statusOrder] ?? 3,
            statusOrder[b.status as keyof typeof statusOrder] ?? 3
          );
      }
    });
    return sorted;
  }, [rows, sortKey, sortDirection]);

  return (
    <div className="space-y-4">
      <WorkerMonitor tasks={filteredTasks} canSync={canSync} />
      {!canSync ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] text-slate-500">
          通知・カレンダー連携はサインイン後にご利用いただけます。
        </div>
      ) : null}
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as TaskTableSortKey)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"
          >
            <option value="status">並替: ステータス</option>
            <option value="name">並替: タスク名</option>
            <option value="project">並替: プロジェクト</option>
            <option value="assignee">並替: 担当者</option>
            <option value="schedule">並替: 期限</option>
            <option value="effort">並替: 工数</option>
            <option value="progress">並替: 進捗</option>
            <option value="priority">並替: 優先度</option>
            <option value="completed">並替: 完了</option>
          </select>
          <div className="hidden md:block" />
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
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={(key, direction) => {
            setSortKey(key);
            setSortDirection(direction);
          }}
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
  filteredTasks,
  filteredTasksWithStages,
  projectMap,
  people,
  projects,
  onTaskDateChange,
  onTaskAssigneeChange,
  onTaskUpdate,
  onTaskDelete,
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
  onStageClick,
  stageProgressMap,
  onRequestPeople,
  onRequestProjectMembers,
  projectFilter,
  assigneeFilter,
  printPanelOpen,
  printProjectIds,
  printPaperSize,
  printRangeMode,
  printProjectOptions,
  filteredPrintProjectOptions,
  printProjectSearch,
  setPrintProjectSearch,
  openPrintPanel,
  togglePrintProject,
  handlePrintSubmit,
  setPrintPanelOpen,
  setPrintProjectIds,
  setPrintPaperSize,
  setPrintRangeMode,
  holidaySet,
  user,
  expandedProjectIds,
  onToggleProject,
  dimOthersEnabled,
}: {
  filteredTasks: Task[];
  filteredTasksWithStages: Task[];
  projectMap: Record<string, Project>;
  people: Person[];
  projects: Project[];
  onTaskDateChange?: (taskId: string, payload: { start: string; end: string; kind: 'move' | 'resize-start' | 'resize-end' }) => void;
  onTaskAssigneeChange?: (taskId: string, assignee: string) => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
  onTaskDelete?: (taskId: string) => Promise<void>;
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
  onStageClick?: (stage: GanttTask) => void;
  stageProgressMap: Record<string, number>;
  onRequestPeople?: () => void;
  onRequestProjectMembers?: (projectId: string) => void;
  projectFilter: string[];
  assigneeFilter: string[];
  printPanelOpen: boolean;
  printProjectIds: string[];
  printPaperSize: 'a3' | 'a4';
  printRangeMode: 'tasks' | 'construction';
  printProjectOptions: { id: string; name: string; client?: string; location?: string }[];
  filteredPrintProjectOptions: { id: string; name: string; client?: string; location?: string }[];
  printProjectSearch: string;
  setPrintProjectSearch: (search: string) => void;
  openPrintPanel: () => void;
  togglePrintProject: (id: string) => void;
  handlePrintSubmit: () => void;
  setPrintPanelOpen: (open: boolean) => void;
  setPrintProjectIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  setPrintPaperSize: (size: 'a3' | 'a4') => void;
  setPrintRangeMode: (mode: 'tasks' | 'construction') => void;
  holidaySet: any;
  user: User | null;
  expandedProjectIds?: Set<string>;
  onToggleProject?: (projectId: string) => void;
  dimOthersEnabled?: boolean;
}) {
  const [draggedAssignee, setDraggedAssignee] = useState<string | null>(null);
  const jumpToTodayRef = useRef<(() => void) | null>(null);
  const today = new Date();
  const todayLabel = formatDate(today);
  const focusIdentity = useMemo(() => buildFocusIdentity(user), [user]);
  const shouldDimOtherAssignees = (dimOthersEnabled ?? false) && Boolean(focusIdentity) && assigneeFilter.length === 0;

  // 初回スクロールはGanttChart内で処理するため、ここでは不要
  // jumpToTodayRefは「今日」ボタン用に保持

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


  // 新しいGanttChartのためのデータ変換
  const newGanttTasks = useMemo((): GanttTask[] => {
    const clampPct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    const progressOf = (task: Task): number => {
      if (task.type === 'stage') {
        return stageProgressMap[task.id] ?? 0;
      }
      const ratio = computeProgress(task.progress, task.ステータス);
      return clampPct(ratio * 100);
    };

    const tasks = filteredTasksWithStages
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
        const isAssignedToFocus = focusIdentity ? isTaskAssignedToIdentity(task, focusIdentity) : false;
        const isDimmed = shouldDimOtherAssignees && task.type !== 'stage' && !isAssignedToFocus;

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
          isDimmed,
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
  }, [filteredTasksWithStages, projectMap, stageProgressMap, focusIdentity, shouldDimOtherAssignees]);

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
    <>
      <div className="no-print h-full flex flex-col gap-0 min-h-0 -mx-4 lg:-mx-8">
      {/* ヘッダー & フィルター */}
      <section className="sticky top-0 z-[45] border-b border-slate-200 bg-white px-3 py-1.5 shadow-sm sm:px-4 lg:px-6 flex-shrink-0">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="min-w-[160px]">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                <span>工程表</span>
                <span className="text-slate-300">/</span>
                <span>{todayLabel}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
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
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => jumpToTodayRef.current?.()}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                今日
              </button>
              <button
                type="button"
                onClick={openPrintPanel}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                PDF出力
              </button>
            </div>
          </div>

        </div>
      </section>

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
            onRequestPeople={onRequestPeople}
            onRequestProjectMembers={onRequestProjectMembers}
            showMilestonesWithoutTasks={projectFilter.length === 0}
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
            onStageClick={onStageClick}
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
          onTaskBatchUpdate={(taskIds, updates) => {
            // 一括編集処理
            if (!onTaskUpdate) return;

            taskIds.forEach(taskId => {
              const taskUpdates: Partial<Task> = {};

              // 担当者
              if (updates.assignee !== undefined) {
                taskUpdates.担当者 = updates.assignee;
                if (updates.assigneeEmail) {
                  taskUpdates.担当者メール = updates.assigneeEmail;
                }
              }

              // ステータス
              if (updates.status !== undefined) {
                let statusJa = '未着手';
                if (updates.status === 'completed') statusJa = '完了';
                else if (updates.status === 'in_progress') statusJa = '進行中';
                else if (updates.status === 'on_hold') statusJa = '保留';
                taskUpdates.ステータス = statusJa;
              }

              // 優先度
              if (updates.priority !== undefined) {
                taskUpdates.優先度 = updates.priority;
              }

              // 日付シフト
              if (updates.shiftDays !== undefined && updates.shiftDays !== 0) {
                // 工程も含めて検索（filteredTasksWithStagesを使用）
                const task = filteredTasksWithStages.find(t => t.id === taskId);
                if (task) {
                  const startDate = task.予定開始日 ? new Date(task.予定開始日) : new Date();
                  const endDate = task.期限 ? new Date(task.期限) : new Date();

                  startDate.setDate(startDate.getDate() + updates.shiftDays);
                  endDate.setDate(endDate.getDate() + updates.shiftDays);

                  const newStart = formatDate(startDate);
                  const newEnd = formatDate(endDate);
                  if (newStart && newEnd) {
                    taskUpdates.予定開始日 = newStart;
                    taskUpdates.期限 = newEnd;
                    taskUpdates.start = newStart;
                    taskUpdates.end = newEnd;
                  }
                }
              }

              // 所属工程の変更
              if (updates.parentId !== undefined) {
                taskUpdates.parentId = updates.parentId;
              }

              if (Object.keys(taskUpdates).length > 0) {
                onTaskUpdate(taskId, taskUpdates);
              }
            });

            pushToast({ title: `${taskIds.length}個のアイテムを更新しました`, tone: 'success' });
          }}
          onTaskDelete={async (task) => {
            // handleDeleteTaskを使用（temp IDガード付き、確認ダイアログはGanttChart側で表示済み）
            if (onTaskDelete) {
              await onTaskDelete(task.id);
            }
          }}
          jumpToTodayRef={jumpToTodayRef}
          expandedProjectIds={expandedProjectIds}
          onToggleProject={onToggleProject}
        />
      </section>
    </div>

      {printPanelOpen && (
        <div className="no-print fixed inset-0 z-[1600] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">工程表PDFの出力</h2>
                <p className="text-xs text-slate-500">出力したいプロジェクトを選択してください。</p>
              </div>
              <button
                type="button"
                onClick={() => setPrintPanelOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                閉じる
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <span>複数選択可・1件のみの出力もOKです</span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600">
                  <input
                    type="radio"
                    name="print-paper-size"
                    value="a3"
                    checked={printPaperSize === 'a3'}
                    onChange={() => setPrintPaperSize('a3')}
                  />
                  A3横
                </label>
                <label className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600">
                  <input
                    type="radio"
                    name="print-paper-size"
                    value="a4"
                    checked={printPaperSize === 'a4'}
                    onChange={() => setPrintPaperSize('a4')}
                  />
                  A4横
                </label>
                <label className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600">
                  <input
                    type="radio"
                    name="print-range-mode"
                    value="tasks"
                    checked={printRangeMode === 'tasks'}
                    onChange={() => setPrintRangeMode('tasks')}
                  />
                  タスク範囲優先
                </label>
                <label className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600">
                  <input
                    type="radio"
                    name="print-range-mode"
                    value="construction"
                    checked={printRangeMode === 'construction'}
                    onChange={() => setPrintRangeMode('construction')}
                  />
                  工期優先
                </label>
                <button
                  type="button"
                  onClick={() => setPrintProjectIds(filteredPrintProjectOptions.map((option) => option.id))}
                  className="rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  全選択
                </button>
                <button
                  type="button"
                  onClick={() => setPrintProjectIds([])}
                  className="rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  全解除
                </button>
              </div>
            </div>

            {/* プロジェクト検索 */}
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="プロジェクトを検索..."
                value={printProjectSearch}
                onChange={(e) => setPrintProjectSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {printProjectSearch && (
                <button
                  type="button"
                  onClick={() => setPrintProjectSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {filteredPrintProjectOptions.length === 0 ? (
                <div className="text-sm text-slate-500">
                  {printProjectSearch
                    ? `「${printProjectSearch}」に一致するプロジェクトがありません。`
                    : '出力できるプロジェクトがありません。'}
                </div>
              ) : (
                filteredPrintProjectOptions.map((option) => (
                  <label key={option.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={printProjectIds.includes(option.id)}
                      onChange={() => togglePrintProject(option.id)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <span>{option.name}</span>
                  </label>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPrintPanelOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handlePrintSubmit}
                disabled={printProjectIds.length === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                PDF出力
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="print-only">
        <GanttPrintView
          tasks={newGanttTasks}
          projectIds={printProjectIds}
          viewMode="week"
          holidaySet={holidaySet}
          generatedBy={user?.displayName || user?.email || null}
          projectMeta={projectMap}
          rangeMode={printRangeMode}
        />
      </div>
    </>
  );
}

function WorkloadPage({ tasks, projects, people }: { tasks: Task[]; projects: Project[]; people: Person[] }) {
  const [timeScale, setTimeScale] = useState<WorkloadScale>('week');
  const [workloadSortKey, setWorkloadSortKey] = useState<'hours' | 'tasks' | 'capacity' | 'utilization' | 'overload' | 'assignee'>('hours');
  const [workloadSortDirection, setWorkloadSortDirection] = useState<'asc' | 'desc'>('desc');
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');

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
  const activeAssignees = useMemo(() => {
    const names = new Set<string>();
    tasksInRange.forEach((task) => {
      const name = (task.assignee ?? task.担当者 ?? '').trim();
      if (name) names.add(name);
    });
    return names;
  }, [tasksInRange]);
  const activeMembers = activeAssignees.size;
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

  const activeDaysByAssignee = useMemo(
    () => buildActiveDaysByAssignee(tasksInRange, currentRange),
    [tasksInRange, currentRange]
  );
  const personDailyHours = useMemo(() => {
    const map = new Map<string, number>();
    people.forEach((person) => {
      const name = person.氏名?.trim();
      if (!name) return;
      const daily = toNumber(person['稼働時間/日(h)']);
      map.set(name, daily || 8);
    });
    return map;
  }, [people]);

  const workloadRows = useMemo(() => {
    return workload.map((entry) => {
      const dailyHours = personDailyHours.get(entry.assignee) ?? (entry.assignee ? 8 : 0);
      const activeDays = activeDaysByAssignee.get(entry.assignee) ?? 0;
      const capacity = dailyHours > 0 ? dailyHours * activeDays : 0;
      const utilization = capacity > 0 ? entry.est / capacity : null;
      const overload = capacity > 0 ? Math.max(0, entry.est - capacity) : null;
      return {
        assignee: entry.assignee,
        hours: entry.est,
        tasks: entry.count,
        capacity,
        utilization,
        overload,
      };
    });
  }, [workload, personDailyHours, activeDaysByAssignee]);

  const sortedWorkloadRows = useMemo(() => {
    const copy = [...workloadRows];
    const direction = workloadSortDirection === 'asc' ? 1 : -1;
    const compareNumbers = (a: number, b: number) => (a - b) * direction;
    const compareStrings = (a: string, b: string) => a.localeCompare(b, 'ja') * direction;
    copy.sort((a, b) => {
      switch (workloadSortKey) {
        case 'assignee':
          return compareStrings(a.assignee, b.assignee);
        case 'capacity':
          return compareNumbers(a.capacity, b.capacity);
        case 'tasks':
          return compareNumbers(a.tasks, b.tasks);
        case 'utilization':
          return compareNumbers(a.utilization ?? -1, b.utilization ?? -1);
        case 'overload':
          return compareNumbers(a.overload ?? 0, b.overload ?? 0);
        case 'hours':
        default:
          return compareNumbers(a.hours, b.hours);
      }
    });
    return copy;
  }, [workloadRows, workloadSortKey, workloadSortDirection]);

  const weeklySummary = useMemo(
    () => buildWeeklySummary(currentRange, tasksInRange, revenueSpans),
    [currentRange, tasksInRange, revenueSpans]
  );
  const monthlySummary = useMemo(
    () => buildMonthlySummary(currentRange, tasksInRange, revenueSpans),
    [currentRange, tasksInRange, revenueSpans]
  );

  const handleShiftRange = useCallback(
    (direction: 'prev' | 'next') => {
      const offset = direction === 'prev' ? -1 : 1;
      setReferenceDate((current) => {
        if (timeScale === 'week') return addWeeks(current, offset);
        if (timeScale === 'month') return addMonths(current, offset);
        return addYears(current, offset);
      });
    },
    [timeScale]
  );

  const selectedAssigneeTasks = useMemo(() => {
    if (!selectedAssignee) return [];
    return tasksInRange.filter((task) => {
      const assignee = (task.assignee ?? task.担当者 ?? '').trim() || '未設定';
      return assignee === selectedAssignee;
    });
  }, [tasksInRange, selectedAssignee]);

  const assigneeProjectBreakdown = useMemo(() => {
    if (!selectedAssigneeTasks.length) return [];
    const map = new Map<string, { projectId: string; projectName: string; hours: number; tasks: number }>();
    selectedAssigneeTasks.forEach((task) => {
      const entry = map.get(task.projectId) ?? {
        projectId: task.projectId,
        projectName: projects.find((project) => project.id === task.projectId)?.物件名 || task.projectId,
        hours: 0,
        tasks: 0,
      };
      entry.hours += getTaskHoursInRange(task, currentRange);
      entry.tasks += 1;
      map.set(task.projectId, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.hours - a.hours);
  }, [selectedAssigneeTasks, projects, currentRange]);

  const assigneeTaskBreakdown = useMemo(() => {
    if (!selectedAssigneeTasks.length) return [];
    return selectedAssigneeTasks
      .map((task) => ({
        id: task.id,
        name: task.タスク名 || '（無題）',
        projectName: projects.find((project) => project.id === task.projectId)?.物件名 || task.projectId,
        hours: getTaskHoursInRange(task, currentRange),
        status: task.ステータス || '',
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [selectedAssigneeTasks, projects, currentRange]);

  const utilizationTone = (value: number | null) => {
    if (value == null) return 'bg-slate-200';
    if (value >= 1.2) return 'bg-rose-500';
    if (value >= 1.0) return 'bg-amber-500';
    if (value >= 0.8) return 'bg-emerald-500';
    return 'bg-slate-300';
  };

  const handleExportCsv = () => {
    const lines = [
      ['担当者', '稼働時間(h)', 'タスク数', 'キャパ(h)', '稼働率', '超過(h)'],
      ...sortedWorkloadRows.map((row) => [
        row.assignee || '未設定',
        formatHours(row.hours),
        String(row.tasks),
        row.capacity ? formatHours(row.capacity) : '',
        row.utilization != null ? `${Math.round(row.utilization * 100)}%` : '',
        row.overload != null ? formatHours(row.overload) : '',
      ]),
    ];
    const csv = lines.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadCsv(blob, `workload_${formatDate(currentRange.start)}_${formatDate(currentRange.end)}.csv`);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">対象期間</p>
            <p className="text-lg font-semibold text-slate-900">{periodLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1">
              <button
                type="button"
                onClick={() => handleShiftRange('prev')}
                className="rounded-full px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                前
              </button>
              <DatePicker
                selected={referenceDate}
                onChange={(date) => date && setReferenceDate(date)}
                locale="ja"
                showMonthYearPicker={timeScale === 'month'}
                showYearPicker={timeScale === 'year'}
                dateFormat={timeScale === 'week' ? 'yyyy/MM/dd' : timeScale === 'month' ? 'yyyy年MM月' : 'yyyy年'}
                className="w-[120px] bg-transparent text-center text-xs font-semibold text-slate-700 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleShiftRange('next')}
                className="rounded-full px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                次
              </button>
            </div>
            <a
              href="/help#workload"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              計算ロジック
            </a>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
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

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">担当者別 稼働</h3>
              <div className="text-[11px] text-slate-500">稼働日数は担当タスクのある日数で算出</div>
            </div>
            <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {renderWorkloadSortHeader('assignee', '担当者', workloadSortKey, workloadSortDirection, setWorkloadSortKey, setWorkloadSortDirection)}
                    {renderWorkloadSortHeader('hours', '稼働(h)', workloadSortKey, workloadSortDirection, setWorkloadSortKey, setWorkloadSortDirection)}
                    {renderWorkloadSortHeader('tasks', 'タスク', workloadSortKey, workloadSortDirection, setWorkloadSortKey, setWorkloadSortDirection)}
                    {renderWorkloadSortHeader('capacity', 'キャパ(h)', workloadSortKey, workloadSortDirection, setWorkloadSortKey, setWorkloadSortDirection)}
                    {renderWorkloadSortHeader('utilization', '稼働率', workloadSortKey, workloadSortDirection, setWorkloadSortKey, setWorkloadSortDirection)}
                    {renderWorkloadSortHeader('overload', '超過(h)', workloadSortKey, workloadSortDirection, setWorkloadSortKey, setWorkloadSortDirection)}
                  </tr>
                </thead>
                <tbody>
                  {sortedWorkloadRows.length ? (
                    sortedWorkloadRows.map((row) => {
                      const utilizationPct = row.utilization != null ? Math.round(row.utilization * 100) : null;
                      const isOver = utilizationPct != null && utilizationPct >= 110;
                      const isSelected = selectedAssignee === (row.assignee || '未設定');
                      return (
                        <tr
                          key={row.assignee}
                          className={`border-t border-slate-100 cursor-pointer transition ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                          onClick={() => setSelectedAssignee(row.assignee || '未設定')}
                        >
                          <td className="px-3 py-2 font-medium text-slate-800">{row.assignee || '未設定'}</td>
                          <td className="px-3 py-2 text-slate-600">{formatHours(row.hours)}</td>
                          <td className="px-3 py-2 text-slate-600">{row.tasks}</td>
                          <td className="px-3 py-2 text-slate-600">{row.capacity ? formatHours(row.capacity) : '-'}</td>
                          <td className="px-3 py-2">
                            {utilizationPct != null ? (
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-20 rounded-full bg-slate-100">
                                  <div
                                    className={`h-2 rounded-full ${utilizationTone(row.utilization)}`}
                                    style={{ width: `${Math.min(100, utilizationPct)}%` }}
                                  />
                                </div>
                                <span className={isOver ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
                                  {utilizationPct}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className={`px-3 py-2 ${row.overload && row.overload > 0 ? 'text-rose-600 font-semibold' : 'text-slate-600'}`}>
                            {row.overload != null ? formatHours(row.overload) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        対象期間の稼働がありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              {selectedAssignee ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">内訳</p>
                      <p className="text-sm font-semibold text-slate-800">{selectedAssignee}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAssignee('')}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      閉じる
                    </button>
                  </div>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                        プロジェクト別
                      </div>
                      <div className="max-h-48 overflow-auto">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-50 text-slate-500">
                            <tr>
                              <th className="px-3 py-2 text-left">プロジェクト</th>
                              <th className="px-3 py-2 text-right">稼働(h)</th>
                              <th className="px-3 py-2 text-right">タスク</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assigneeProjectBreakdown.map((row) => (
                              <tr key={row.projectId} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-700">{row.projectName}</td>
                                <td className="px-3 py-2 text-right text-slate-600">{formatHours(row.hours)}</td>
                                <td className="px-3 py-2 text-right text-slate-500">{row.tasks}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                        タスク別
                      </div>
                      <div className="max-h-48 overflow-auto">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-50 text-slate-500">
                            <tr>
                              <th className="px-3 py-2 text-left">タスク</th>
                              <th className="px-3 py-2 text-right">稼働(h)</th>
                              <th className="px-3 py-2 text-right">ステータス</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assigneeTaskBreakdown.map((row) => (
                              <tr key={row.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-700">
                                  <div className="text-[11px] text-slate-400">{row.projectName}</div>
                                  <div>{row.name}</div>
                                </td>
                                <td className="px-3 py-2 text-right text-slate-600">{formatHours(row.hours)}</td>
                                <td className="px-3 py-2 text-right text-slate-500">{row.status || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500">担当者行をクリックすると稼働内訳が表示されます。</div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800">週次サマリー</h3>
              <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">週</th>
                      <th className="px-3 py-2 text-left">稼働(h)</th>
                      <th className="px-3 py-2 text-left">タスク</th>
                      <th className="px-3 py-2 text-left">稼ぎ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklySummary.map((row) => (
                      <tr key={row.label} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{row.label}</td>
                        <td className="px-3 py-2 text-slate-600">{formatHours(row.hours)}</td>
                        <td className="px-3 py-2 text-slate-600">{row.tasks}</td>
                        <td className="px-3 py-2 text-slate-600">{formatCurrency(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800">月次サマリー</h3>
              <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">月</th>
                      <th className="px-3 py-2 text-left">稼働(h)</th>
                      <th className="px-3 py-2 text-left">タスク</th>
                      <th className="px-3 py-2 text-left">稼ぎ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((row) => (
                      <tr key={row.label} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{row.label}</td>
                        <td className="px-3 py-2 text-slate-600">{formatHours(row.hours)}</td>
                        <td className="px-3 py-2 text-slate-600">{row.tasks}</td>
                        <td className="px-3 py-2 text-slate-600">{formatCurrency(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderWorkloadSortHeader(
  key: 'hours' | 'tasks' | 'capacity' | 'utilization' | 'overload' | 'assignee',
  label: string,
  sortKey: 'hours' | 'tasks' | 'capacity' | 'utilization' | 'overload' | 'assignee',
  sortDirection: 'asc' | 'desc',
  setSortKey: React.Dispatch<
    React.SetStateAction<'hours' | 'tasks' | 'capacity' | 'utilization' | 'overload' | 'assignee'>
  >,
  setSortDirection: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
) {
  const active = sortKey === key;
  const nextDirection = active && sortDirection === 'asc' ? 'desc' : 'asc';
  return (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        onClick={() => {
          setSortKey(key);
          setSortDirection(nextDirection);
        }}
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
      >
        {label}
        {active ? <span>{sortDirection === 'asc' ? '▲' : '▼'}</span> : <span className="text-slate-300">▲</span>}
      </button>
    </th>
  );
}

const CRITICAL_THRESHOLD_DAYS = 2;

function buildDangerTasks(
  tasks: Task[],
  projectMap: Record<string, Project>,
  currentUser?: { displayName?: string | null; email?: string | null } | null
): DangerTaskInfo[] {
  if (!currentUser) return [];
  const userName = (currentUser.displayName || '').trim().toLowerCase();
  const userEmail = (currentUser.email || '').trim().toLowerCase();
  if (!userName && !userEmail) return [];
  const today = startOfDay(new Date());
  return tasks
    .filter((task) => {
      if (task.type === 'stage') return false;
      if (task.ステータス === '完了') return false;
      const taskAssignee = (task.assignee || task.担当者 || '').trim().toLowerCase();
      const taskEmail = (task.担当者メール || '').trim().toLowerCase();
      // 名前またはメールアドレスで一致判定
      const nameMatch = taskAssignee && userName && taskAssignee === userName;
      const emailMatch = taskEmail && userEmail && taskEmail === userEmail;
      if (!nameMatch && !emailMatch) return false;
      return true;
    })
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

type FocusIdentity = {
  uid?: string;
  tokens: Set<string>;
};

const normalizeIdentityToken = (value?: string | null) => (value ?? '').trim().toLowerCase();
const normalizeIdentityComparable = (value?: string | null) => normalizeIdentityToken(value).replace(/\s+/g, '');
const MY_PROJECTS_FILTER_VALUE = '__my_projects__';
const PROJECT_FILTER_STORAGE_KEY = 'compass_project_filter_v1';
const areSameIdSet = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
};

const addIdentityToken = (tokens: Set<string>, value?: string | null) => {
  const normalized = normalizeIdentityToken(value);
  if (!normalized) return;
  tokens.add(normalized);
  const collapsed = normalizeIdentityComparable(value);
  if (collapsed && collapsed !== normalized) {
    tokens.add(collapsed);
  }
};

const buildFocusIdentity = (user: User | null): FocusIdentity | null => {
  if (!user) return null;
  const tokens = new Set<string>();
  addIdentityToken(tokens, user.displayName ?? null);
  addIdentityToken(tokens, user.email ?? null);
  const emailLower = normalizeIdentityToken(user.email ?? null);
  if (emailLower) {
    const local = emailLower.split('@')[0];
    if (local) addIdentityToken(tokens, local);
  }
  if (tokens.size === 0) return null;
  return { uid: user.uid || undefined, tokens };
};

const matchesIdentityValue = (value: string | null | undefined, identity: FocusIdentity): boolean => {
  const normalized = normalizeIdentityToken(value);
  if (!normalized) return false;
  if (identity.tokens.has(normalized)) return true;
  const collapsed = normalizeIdentityComparable(value);
  return collapsed ? identity.tokens.has(collapsed) : false;
};

const isTaskAssignedToIdentity = (task: Task, identity: FocusIdentity): boolean => {
  if (matchesIdentityValue(task.assignee ?? task.担当者 ?? null, identity)) return true;
  if (matchesIdentityValue(task.担当者メール ?? null, identity)) return true;
  return false;
};

const isProjectInUserScope = (project: Project, identity: FocusIdentity, members?: ProjectMember[]): boolean => {
  const memberMatch = members?.some((member) => {
    if (identity.uid && member.userId === identity.uid) return true;
    if (matchesIdentityValue(member.email ?? null, identity)) return true;
    if (matchesIdentityValue(member.displayName ?? null, identity)) return true;
    return false;
  });
  if (memberMatch) return true;

  if (project.memberNames?.some((name) => matchesIdentityValue(name, identity))) return true;

  const roleNames = [
    project.LS担当者,
    project.自社PM,
    project.営業,
    project.PM,
    project.設計,
    project.施工管理,
  ];
  return roleNames.some((name) => matchesIdentityValue(name ?? null, identity));
};

const EMPTY_PROJECT_MEMBERS: ProjectMember[] = [];
const EMPTY_PROJECT_STAGES: Task[] = [];

function App() {
  const [state, setState, undo, redo, canUndo, canRedo] = useSnapshot();
  const location = useLocation();
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [subscriptionCheckLoading, setSubscriptionCheckLoading] = useState(false);
  const [subscriptionCheckError, setSubscriptionCheckError] = useState<string | null>(null);
  const [orgSetupRequired, setOrgSetupRequired] = useState<{ stripeCustomerId?: string | null } | null>(null);
  const [orgSetupForm, setOrgSetupForm] = useState({ orgId: '', orgName: '' });
  const [orgSetupLoading, setOrgSetupLoading] = useState(false);
  const [orgSetupError, setOrgSetupError] = useState<string | null>(null);
  const [orgIdAvailability, setOrgIdAvailability] = useState<'idle' | 'checking' | 'available' | 'unavailable' | 'invalid' | 'error'>('idle');
  const [orgIdNormalized, setOrgIdNormalized] = useState('');
  const [authBlocked, setAuthBlocked] = useState(false);
  const [authBlockedMessage, setAuthBlockedMessage] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalDefaults, setTaskModalDefaults] = useState<{ projectId?: string; stageId?: string } | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState<'create' | 'edit'>('create');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingStage, setEditingStage] = useState<Task | null>(null);
  const [stageEditModalOpen, setStageEditModalOpen] = useState(false);
  const [managingMembersProject, setManagingMembersProject] = useState<Project | null>(null);
  const [allProjectMembers, setAllProjectMembers] = useState<Map<string, ProjectMember[]>>(new Map());
  const [dangerModalTasks, setDangerModalTasks] = useState<DangerTaskInfo[]>([]);
  const [showDangerModal, setShowDangerModal] = useState(false);
  const loadedProjectMembersRef = useRef<Set<string>>(new Set()); // 既に読み込んだプロジェクトIDを追跡
  const dangerModalShownRef = useRef(false);
  const [allActivityLogs, setAllActivityLogs] = useState<Map<string, any[]>>(new Map());
  const loadedActivityLogsRef = useRef<Set<string>>(new Set()); // 既に読み込んだプロジェクトIDを追跡
  const projectFilterHydratedRef = useRef(false);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [dimOthersEnabled, setDimOthersEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('dimOthersEnabled') === 'true';
    } catch {
      return false;
    }
  });
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const [projectSort, setProjectSort] = useState<ProjectSortKey>('due');
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [printPanelOpen, setPrintPanelOpen] = useState(false);
  const [printProjectIds, setPrintProjectIds] = useState<string[]>([]);
  const [printPaperSize, setPrintPaperSize] = useState<'a3' | 'a4'>('a3');
  const [printRangeMode, setPrintRangeMode] = useState<'tasks' | 'construction'>('tasks');
  const [printProjectSearch, setPrintProjectSearch] = useState('');
  const { user, authReady, authSupported, authError, signIn, signUpWithEmail, signOut } = useFirebaseAuth();
  const holidaySet = useJapaneseHolidaySet(authReady && Boolean(user));
  const [emailAuthInput, setEmailAuthInput] = useState({ email: '', password: '' });
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [emailAuthError, setEmailAuthError] = useState<string | null>(null);
  const peopleLoadInFlightRef = useRef(false);
  const peopleCacheKey = useMemo(
    () => (user?.uid ? `compass_people_cache_${user.uid}` : 'compass_people_cache_guest'),
    [user]
  );
  const [currentUserRole, setCurrentUserRole] = useState<string | undefined>(undefined);
  const [roleChecking, setRoleChecking] = useState(false);
  const toastTimers = useRef<Map<string, number>>(new Map());
  const billingErrorNotifiedRef = useRef(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [billingAccess, setBillingAccess] = useState<BillingAccessInfo | null>(null);
  const [billingChecking, setBillingChecking] = useState(false);
  const snapshotReloadTimerRef = useRef<number | null>(null);
  const snapshotReloadReasonsRef = useRef<string[]>([]);
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
  const { addPending, ackPending, rollbackPending, pending, deletedTasks, addPendingProject, ackPendingProject, rollbackPendingProject, pendingProjects } = usePendingOverlay();

  const canSync = authSupported && Boolean(user);

  // 起動時にIndexedDBキャッシュからProject Membersを読み込む
  useEffect(() => {
    const loadCachedMembers = async () => {
      try {
        const cached = await getAllCachedProjectMembers();
        if (cached && Object.keys(cached).length > 0) {
          console.log('[App] Loading project members from cache:', Object.keys(cached).length, 'projects');
          const newMap = new Map<string, ProjectMember[]>();
          Object.entries(cached).forEach(([projectId, members]) => {
            newMap.set(projectId, members);
            loadedProjectMembersRef.current.add(projectId);
          });
          setAllProjectMembers(newMap);
        }
      } catch (err) {
        console.warn('[App] Failed to load cached project members:', err);
      }
    };
    loadCachedMembers();
  }, []);

  const requestSnapshotReload = useCallback(
    (reason: string, delayMs = 120000) => {
      if (!canSync) return;
      snapshotReloadReasonsRef.current = [...snapshotReloadReasonsRef.current, reason];
      if (snapshotReloadTimerRef.current) {
        window.clearTimeout(snapshotReloadTimerRef.current);
      }
      snapshotReloadTimerRef.current = window.setTimeout(() => {
        snapshotReloadTimerRef.current = null;
        snapshotReloadReasonsRef.current = [];
        window.dispatchEvent(new CustomEvent('snapshot:reload'));
      }, delayMs);
    },
    [canSync]
  );

  const togglePrintProject = useCallback((id: string) => {
    setPrintProjectIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  }, []);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('printing');
      document.body.removeAttribute('data-print-size');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  useEffect(() => {
    return () => {
      if (snapshotReloadTimerRef.current) {
        window.clearTimeout(snapshotReloadTimerRef.current);
        snapshotReloadTimerRef.current = null;
      }
    };
  }, []);

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
      const token = await getCachedIdToken();
      if (!token) {
        setBillingChecking(false);
        return;
      }
      const info = await getBillingAccess();
      setBillingAccess(info);
      billingErrorNotifiedRef.current = false;
    } catch (error) {
      console.error('[App] 課金状態の取得に失敗しました:', error);
      if (!billingErrorNotifiedRef.current) {
        pushToast({
          tone: 'error',
          title: '課金状態の確認に失敗しました',
          description: '時間をおいて再度お試しください。',
        });
        billingErrorNotifiedRef.current = true;
      }
    } finally {
      setBillingChecking(false);
    }
  }, [authReady, authSupported, user, pushToast]);

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

  const canEdit = true;

  useEffect(() => {
    if (!canSync) return;
    if (state.people.length > 0) return;
    const cached = readPeopleCache(peopleCacheKey);
    if (!cached) return;
    if (Date.now() - cached.fetchedAt > PEOPLE_CACHE_TTL_MS) return;
    setState((prev) => ({ ...prev, people: cached.people }));
  }, [canSync, peopleCacheKey, setState, state.people.length]);

  const ensurePeopleLoaded = useCallback(
    async (options?: { force?: boolean }) => {
      if (!canSync) return;
      if (peopleLoadInFlightRef.current) return;

      if (!options?.force) {
        if (state.people.length > 0) return;
        const cached = readPeopleCache(peopleCacheKey);
        if (cached && Date.now() - cached.fetchedAt <= PEOPLE_CACHE_TTL_MS) {
          setState((prev) => ({ ...prev, people: cached.people }));
          return;
        }
      }

      peopleLoadInFlightRef.current = true;
      try {
        const { people } = await listPeople();
        const normalizedPeople = normalizeSnapshot({ projects: [], tasks: [], people }).people;
        setState((prev) => ({ ...prev, people: normalizedPeople }));
        writePeopleCache(peopleCacheKey, normalizedPeople);
      } catch (error) {
        console.warn('Failed to load people', error);
      } finally {
        peopleLoadInFlightRef.current = false;
      }
    },
    [canSync, peopleCacheKey, setState, state.people.length]
  );

  const loadProjectMembersForProject = useCallback(
    async (projectId: string) => {
      if (!canSync || !projectId) return;
      if (loadedProjectMembersRef.current.has(projectId)) return;

      try {
        const members = await listProjectMembers(projectId, { status: 'active' });
        setAllProjectMembers(prev => new Map(prev).set(projectId, members));
        // IndexedDBキャッシュに保存
        cacheProjectMembers(projectId, members).catch(() => {});
      } catch (error: any) {
        if (error?.status === 404) {
          console.debug(`Project ${projectId} not found in Firestore, skipping member load`);
        } else {
          console.warn(`Failed to load members for project ${projectId}:`, error);
        }
        setAllProjectMembers(prev => new Map(prev).set(projectId, []));
      } finally {
        loadedProjectMembersRef.current.add(projectId);
      }
    },
    [canSync]
  );

  useEffect(() => {
    if (taskModalOpen || editingTask) {
      ensurePeopleLoaded();
    }
  }, [taskModalOpen, editingTask, ensurePeopleLoaded]);

  const normalizeOrgId = useCallback((value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '');
  }, []);

  const handleSubscriptionCheck = useCallback(async () => {
    setSubscriptionCheckLoading(true);
    setSubscriptionCheckError(null);
    try {
      const eligibility = await checkOrgSetupEligibility();
      if (eligibility.eligible) {
        setOrgSetupRequired({ stripeCustomerId: eligibility.stripeCustomerId ?? null });
        setSubscriptionRequired(false);
      } else {
        setSubscriptionCheckError('サブスク登録が確認できませんでした。決済直後の場合は数分後にお試しください。');
      }
    } catch (error) {
      console.error('[App] サブスク確認に失敗しました:', error);
      setSubscriptionCheckError('サブスク状態の確認に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSubscriptionCheckLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!orgSetupRequired) {
      setOrgIdAvailability('idle');
      setOrgIdNormalized('');
      return;
    }
    const raw = orgSetupForm.orgId.trim();
    if (!raw) {
      setOrgIdAvailability('idle');
      setOrgIdNormalized('');
      return;
    }
    const normalized = normalizeOrgId(raw);
    setOrgIdNormalized(normalized);
    if (!normalized || !/^[a-z0-9-]+$/.test(normalized)) {
      setOrgIdAvailability('invalid');
      return;
    }

    let active = true;
    setOrgIdAvailability('checking');
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkOrgIdAvailability(normalized);
        if (!active) return;
        setOrgIdAvailability(result.available ? 'available' : 'unavailable');
      } catch (error: any) {
        console.error('[App] Org ID availability check failed:', error);
        console.error('[App] Error details:', {
          message: error?.message,
          status: error?.status,
          statusText: error?.statusText,
          code: error?.code,
          data: error?.data,
        });
        if (!active) return;
        setOrgIdAvailability('error');
      }
    }, 400);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [orgSetupForm.orgId, orgSetupRequired, normalizeOrgId, checkOrgIdAvailability]);

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
    if (location.pathname !== '/summary') return;

    const loadMissingMembers = async () => {
      const loadedIds = loadedProjectMembersRef.current;
      const projectsToLoad = state.projects.filter(
        (project) =>
          !loadedIds.has(project.id) &&
          (!project.memberNames || project.memberNames.length === 0)
      );

      if (projectsToLoad.length === 0) return; // 追加ロード不要

      console.log(`[Members API] Loading members for ${projectsToLoad.length} projects missing summary`);

      for (const project of projectsToLoad) {
        try {
          const members = await listProjectMembers(project.id, { status: 'active' });
          const memberNames = buildMemberNamesFromMembers(members);
          setAllProjectMembers(prev => new Map(prev).set(project.id, members));
          // IndexedDBキャッシュに保存
          cacheProjectMembers(project.id, members).catch(() => {});
          setState((prev) => ({
            ...prev,
            projects: prev.projects.map((item) =>
              item.id === project.id ? { ...item, memberNames } : item
            ),
          }));
          loadedIds.add(project.id);
        } catch (error: any) {
          if (error?.status === 404) {
            console.debug(`Project ${project.id} not found in Firestore, skipping member load`);
          } else {
            console.warn(`Failed to load members for project ${project.id}:`, error);
          }
          setAllProjectMembers(prev => new Map(prev).set(project.id, []));
          loadedIds.add(project.id);
        }
      }
    };

    loadMissingMembers();
  }, [state.projects, canSync, location.pathname, setState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMembersUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string; members?: ProjectMember[] }>).detail;
      const projectId = detail?.projectId;
      const members = detail?.members;
      if (!projectId || !Array.isArray(members)) return;
      setAllProjectMembers((prev) => new Map(prev).set(projectId, members));
      loadedProjectMembersRef.current.add(projectId);
      // IndexedDBキャッシュに保存
      cacheProjectMembers(projectId, members).catch(() => {});
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
      setAuthBlocked(false);
      setAuthBlockedMessage(null);
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
        setAuthBlocked(false);
        setAuthBlockedMessage(null);
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.code === 'ORG_SETUP_REQUIRED') {
            setOrgSetupRequired({ stripeCustomerId: error.data?.stripeCustomerId ?? null });
            setSubscriptionRequired(false);
            setAuthBlocked(false);
            setAuthBlockedMessage(null);
          } else if (error.status === 401) {
            setAuthBlocked(true);
            setAuthBlockedMessage(
              'このアカウントでは利用できません。招待済みのメールでサインインするか、Stripe決済時のメールアドレスが一致しているかご確認ください。'
            );
            setSubscriptionRequired(false);
            setOrgSetupRequired(null);
          } else if (error.status === 402) {
            // 課金未契約・停止時は購読リクエスト画面を表示
            setSubscriptionRequired(true);
            setOrgSetupRequired(null);
            setOrgSetupForm({ orgId: '', orgName: '' });
            setAuthBlocked(false);
            setAuthBlockedMessage(null);
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

  // Mキーで「自分以外を薄くする」トグル
  const toggleDimOthers = useCallback(() => {
    setDimOthersEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dimOthersEnabled', String(next));
      } catch {
        // ignore
      }
      pushToast({ tone: 'info', title: next ? '自分以外を薄く表示' : '全員同じ濃さで表示' });
      return next;
    });
  }, [pushToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力中は無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Mキーで薄くするトグル（修飾キーなし）
      if (e.key === 'm' || e.key === 'M') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          toggleDimOthers();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDimOthers]);

  const projectMap = useMemo(() => {
    const map: Record<string, Project> = {};
    state.projects.forEach((project) => {
      map[project.id] = project;
    });
    return map;
  }, [state.projects]);

  const [focusUserProjectIds, setFocusUserProjectIds] = useState<string[]>([]);
  const [focusUserProjectsReady, setFocusUserProjectsReady] = useState(false);

  const focusIdentity = useMemo(() => buildFocusIdentity(user), [user]);
  const focusProjectIds = useMemo(() => {
    const ids = new Set<string>();

    // APIから取得したユーザーのプロジェクトIDを追加
    focusUserProjectIds.forEach((projectId) => {
      const project = projectMap[projectId];
      if (!showArchivedProjects && project && isArchivedProjectStatus(calculateProjectStatus(project))) {
        return;
      }
      ids.add(projectId);
    });

    return Array.from(ids).sort((a, b) => {
      const nameA = projectMap[a]?.物件名 || '';
      const nameB = projectMap[b]?.物件名 || '';
      const nameDiff = nameA.localeCompare(nameB, 'ja');
      if (nameDiff !== 0) return nameDiff;
      return a.localeCompare(b);
    });
  }, [focusUserProjectIds, showArchivedProjects, projectMap]);

  const projectFilterHasMy = projectFilter.includes(MY_PROJECTS_FILTER_VALUE);
  const effectiveProjectFilter = projectFilterHasMy
    ? (focusUserProjectsReady ? focusProjectIds : [])
    : projectFilter;
  const myProjectsFilterActive = projectFilterHasMy && focusUserProjectsReady;

  // 「自分参加のみ」フィルタが有効になったら、そのプロジェクトだけ展開
  const myProjectsExpandAppliedRef = useRef(false);
  useEffect(() => {
    if (!myProjectsFilterActive) {
      myProjectsExpandAppliedRef.current = false;
      return;
    }
    if (myProjectsExpandAppliedRef.current) return;
    if (focusProjectIds.length === 0) return;
    myProjectsExpandAppliedRef.current = true;
    setExpandedProjectIds(new Set(focusProjectIds));
  }, [myProjectsFilterActive, focusProjectIds]);

  const printProjectOptions = useMemo(() => {
    const projectIds = Array.from(new Set(state.tasks.map((task) => task.projectId)));
    const options = projectIds.map((id) => {
      const project = state.projects.find(p => p.id === id);
      return {
        id,
        name: project?.物件名 || id,
        client: project?.クライアント || '',
        location: project?.['所在地/現地'] ?? project?.['所在地_現地'] ?? '',
      };
    });
    return options.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [state.tasks, state.projects]);

  const filteredPrintProjectOptions = useMemo(() => {
    const query = printProjectSearch.trim().toLowerCase();
    if (!query) return printProjectOptions;
    return printProjectOptions.filter((opt) => {
      const haystack = [opt.name, opt.client, opt.location].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [printProjectOptions, printProjectSearch]);

  const openPrintPanel = useCallback(() => {
    // プロジェクトフィルターがある場合のみそれを使用、なければ空
    const defaults = effectiveProjectFilter.length > 0 ? effectiveProjectFilter : [];
    setPrintProjectIds(defaults);
    setPrintProjectSearch('');
    setPrintPanelOpen(true);
  }, [effectiveProjectFilter]);

  const handlePrintSubmit = useCallback(() => {
    if (printProjectIds.length === 0) {
      pushToast({ tone: 'error', title: '出力するプロジェクトを選択してください' });
      return;
    }
    setPrintPanelOpen(false);
    const styleId = 'print-page-style';
    const style = document.getElementById(styleId) || document.createElement('style');
    style.id = styleId;
    style.textContent = `@media print { @page { size: ${printPaperSize.toUpperCase()} landscape; margin: 8mm; } }`;
    if (!style.parentNode) {
      document.head.appendChild(style);
    }
    document.body.classList.add('printing');
    document.body.setAttribute('data-print-size', printPaperSize);
    window.setTimeout(() => window.print(), 120);
  }, [printProjectIds, printPaperSize, pushToast]);

  const dangerTasks = useMemo(
    () => buildDangerTasks(state.tasks, projectMap, user),
    [state.tasks, projectMap, user]
  );
  const focusAppliedRef = useRef(false);
  const lastFocusUidRef = useRef<string | null>(null);
  const focusAutoFilterActiveRef = useRef(false);
  const focusAutoProjectIdsRef = useRef<string[] | null>(null);
  const focusUserProjectsLoadedRef = useRef(false);
  const remoteLoadStartedRef = useRef(false);
  const remoteLoadCompletedRef = useRef(false);

  useEffect(() => {
    if (!canSync) {
      remoteLoadCompletedRef.current = true;
      return;
    }
    if (loading) {
      remoteLoadStartedRef.current = true;
      return;
    }
    if (!loading && remoteLoadStartedRef.current) {
      remoteLoadCompletedRef.current = true;
    }
  }, [loading, canSync]);

  useEffect(() => {
    const currentUid = user?.uid ?? null;
    if (lastFocusUidRef.current !== currentUid) {
      lastFocusUidRef.current = currentUid;
      focusAppliedRef.current = false;
      focusAutoFilterActiveRef.current = false;
      focusAutoProjectIdsRef.current = null;
      focusUserProjectsLoadedRef.current = false;
      projectFilterHydratedRef.current = false;
      setFocusUserProjectIds([]);
      setFocusUserProjectsReady(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    projectFilterHydratedRef.current = false;
    if (typeof window === 'undefined') return;
    if (!user?.uid) {
      setProjectFilter([]);
      projectFilterHydratedRef.current = true;
      return;
    }
    const storageKey = `${PROJECT_FILTER_STORAGE_KEY}:${user.uid}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setProjectFilter(parsed.filter((item) => typeof item === 'string' && item.trim().length > 0));
        }
      } else {
        // 初回ログイン時はデフォルトで「自分参加のみ」を有効に
        setProjectFilter([MY_PROJECTS_FILTER_VALUE]);
      }
    } catch (error) {
      console.warn('[App] Failed to restore project filter:', error);
    } finally {
      projectFilterHydratedRef.current = true;
    }
  }, [user?.uid]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user?.uid) return;
    if (!projectFilterHydratedRef.current) return;
    const storageKey = `${PROJECT_FILTER_STORAGE_KEY}:${user.uid}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(projectFilter));
    } catch (error) {
      console.warn('[App] Failed to persist project filter:', error);
    }
  }, [projectFilter, user?.uid]);

  // ローカルストレージから即座にキャッシュを読み込む
  useEffect(() => {
    if (!user?.uid) return;
    const cacheKey = `focusUserProjectIds:${user.uid}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFocusUserProjectIds(parsed);
          setFocusUserProjectsReady(true);
        }
      }
    } catch (e) {
      // ignore
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !canSync) {
      setFocusUserProjectIds([]);
      setFocusUserProjectsReady(false);
      focusUserProjectsLoadedRef.current = false;
      return;
    }
    if (focusUserProjectsLoadedRef.current) return;
    focusUserProjectsLoadedRef.current = true;

    listUserProjects(user.uid)
      .then((projects) => {
        // 明示的に参加しているプロジェクトのみ
        // - invitedBy !== 'system'（招待された）
        // - role === 'owner'（オーナー）
        const explicitProjectIds = projects
          .filter((item) => {
            if (item.member?.status !== 'active') return false;
            if (item.member?.role === 'owner') return true;
            if (item.member?.invitedBy && item.member.invitedBy !== 'system') return true;
            return false;
          })
          .map((item) => item.projectId)
          .filter(Boolean);
        setFocusUserProjectIds(explicitProjectIds);
        setFocusUserProjectsReady(true);
        // ローカルストレージにキャッシュ
        const cacheKey = `focusUserProjectIds:${user.uid}`;
        try {
          localStorage.setItem(cacheKey, JSON.stringify(explicitProjectIds));
        } catch (e) {
          // ignore
        }
      })
      .catch((error) => {
        console.warn('[App] Failed to load user project memberships:', error);
        setFocusUserProjectIds([]);
        setFocusUserProjectsReady(true);
      });
  }, [user, canSync]);

  useEffect(() => {
    if (!focusIdentity) return;
    if (focusAppliedRef.current) return;
    if (loading) return;
    if (canSync && !remoteLoadCompletedRef.current) return;
    if (!projectFilterHydratedRef.current) return;
    if (projectFilter.length > 0 || assigneeFilter.length > 0 || statusFilter.length > 0 || (search ?? '').trim()) {
      return;
    }
    if (state.tasks.length === 0 && state.projects.length === 0) return;
    if (focusProjectIds.length === 0) return;
    setProjectFilter(focusProjectIds);
    setExpandedProjectIds(new Set(focusProjectIds));
    focusAppliedRef.current = true;
    focusAutoFilterActiveRef.current = true;
    focusAutoProjectIdsRef.current = focusProjectIds;
  }, [
    focusIdentity,
    focusProjectIds,
    projectFilter,
    assigneeFilter,
    statusFilter,
    search,
    state.tasks.length,
    state.projects.length,
    loading,
    canSync,
  ]);

  useEffect(() => {
    if (!focusIdentity) return;
    if (!focusAutoFilterActiveRef.current) return;
    if (assigneeFilter.length > 0 || statusFilter.length > 0 || (search ?? '').trim()) {
      focusAutoFilterActiveRef.current = false;
      return;
    }
    if (focusProjectIds.length === 0) return;
    const lastApplied = focusAutoProjectIdsRef.current ?? [];
    if (!areSameIdSet(projectFilter, lastApplied)) {
      focusAutoFilterActiveRef.current = false;
      return;
    }
    if (areSameIdSet(lastApplied, focusProjectIds)) return;
    setProjectFilter(focusProjectIds);
    setExpandedProjectIds(new Set(focusProjectIds));
    focusAutoProjectIdsRef.current = focusProjectIds;
  }, [focusIdentity, focusProjectIds, projectFilter, assigneeFilter, statusFilter, search]);

  const normalizeTaskStatus = useCallback((value?: string | null) => {
    const normalized = (value ?? '').trim();
    if (!normalized) return '';
    if (normalized === '進捗中') return '進行中';
    return normalized;
  }, []);

  const handleStageTaskAdd = useCallback(
    (stage: GanttTask) => {
      openTaskModal({ projectId: stage.projectId, stageId: stage.id });
    },
    [openTaskModal]
  );

  const handleStageClick = useCallback(
    (stage: GanttTask) => {
      // GanttTask を Task に変換して編集モーダルを開く
      const stageAsTask = state.tasks.find((t) => t.id === stage.id);
      if (stageAsTask) {
        setEditingStage(stageAsTask);
        setStageEditModalOpen(true);
      }
    },
    [state.tasks]
  );

  const handleStageUpdate = useCallback(
    async (stageId: string, updates: { タスク名?: string }) => {
      await updateStage(stageId, updates);
      // ローカル状態を更新
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === stageId ? { ...t, ...updates } : t
        ),
      }));
    },
    [setState]
  );

  const handleStageDelete = useCallback(
    async (stageId: string) => {
      await deleteStage(stageId);
      // ローカル状態から削除し、子タスクのparentIdをnullに
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks
          .filter((t) => t.id !== stageId)
          .map((t) => (t.parentId === stageId ? { ...t, parentId: null } : t)),
      }));
    },
    [setState]
  );

  useEffect(() => {
    if (!user) {
      dangerModalShownRef.current = false;
      setShowDangerModal(false);
      setDangerModalTasks([]);
      return;
    }
    if (!dangerTasks.length) return;
    if (dangerModalShownRef.current) return;
    dangerModalShownRef.current = true;
    setDangerModalTasks(dangerTasks.slice(0, 8));
    setShowDangerModal(true);
  }, [dangerTasks, user]);

  const filteredTasks = useMemo(() => {
    // pendingの変更を適用してから、フィルタリング
    const tasksWithPending = applyPendingToTasks(state.tasks, pending);
    const now = Date.now();

    const query = search.trim().toLowerCase();
    return tasksWithPending.filter((task) => {
      // 削除済みタスクを除外
      const deletion = deletedTasks[task.id];
      if (deletion && now < deletion.lockUntil) return false;

      // 工程は除外（タスクのみ表示）
      if (task.type === 'stage') return false;

      if (!showArchivedProjects) {
        const project = projectMap[task.projectId];
        if (project && isArchivedProjectStatus(calculateProjectStatus(project))) return false;
      }

      // 配列が空の場合は全て表示、配列に値がある場合は含まれているかチェック
      const projectMatch = myProjectsFilterActive
        ? effectiveProjectFilter.includes(task.projectId)
        : effectiveProjectFilter.length === 0 || effectiveProjectFilter.includes(task.projectId);
      const assigneeMatch = assigneeFilter.length === 0 || assigneeFilter.includes(task.assignee ?? task.担当者 ?? '');
      // タスクのステータスは「完了/未完了」でフィルター
      const isCompleted = task.ステータス === '完了';
      const statusMatch = statusFilter.length === 0 ||
        (statusFilter.includes('完了') && isCompleted) ||
        (statusFilter.includes('未完了') && !isCompleted);
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
  }, [state.tasks, pending, deletedTasks, effectiveProjectFilter, myProjectsFilterActive, assigneeFilter, statusFilter, search, projectMap, showArchivedProjects]);

  // ガントチャート用：工程（stage）も含むフィルタ済みタスク
  const filteredTasksWithStages = useMemo(() => {
    const tasksWithPending = applyPendingToTasks(state.tasks, pending);
    const now = Date.now();
    const query = search.trim().toLowerCase();
    return tasksWithPending.filter((task) => {
      // 削除済みタスクを除外
      const deletion = deletedTasks[task.id];
      if (deletion && now < deletion.lockUntil) return false;

      // ガントチャートでは工程（stage）も表示する（タスク一覧とは異なる）
      if (!showArchivedProjects) {
        const project = projectMap[task.projectId];
        if (project && isArchivedProjectStatus(calculateProjectStatus(project))) return false;
      }

      const projectMatch = myProjectsFilterActive
        ? effectiveProjectFilter.includes(task.projectId)
        : effectiveProjectFilter.length === 0 || effectiveProjectFilter.includes(task.projectId);
      const assigneeMatch = assigneeFilter.length === 0 || assigneeFilter.includes(task.assignee ?? task.担当者 ?? '');
      // タスクのステータスは「完了/未完了」でフィルター
      const isCompleted = task.ステータス === '完了';
      const statusMatch = statusFilter.length === 0 ||
        (statusFilter.includes('完了') && isCompleted) ||
        (statusFilter.includes('未完了') && !isCompleted);
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
  }, [state.tasks, pending, deletedTasks, effectiveProjectFilter, myProjectsFilterActive, assigneeFilter, statusFilter, search, projectMap, showArchivedProjects]);

  const projectOptions = useMemo(
    () => [
      { value: 'all', label: 'すべてのプロジェクト' },
      { value: MY_PROJECTS_FILTER_VALUE, label: '自分参加のみ' },
      ...state.projects.map((project) => ({ value: project.id, label: project.物件名 || project.id })),
    ],
    [state.projects]
  );

  const assigneeOptions = useMemo(() => {
    const names = new Set<string>();
    state.tasks
      .filter((task) => task.type !== 'stage')
      .forEach((task) => {
        const name = (task.assignee ?? task.担当者 ?? '').trim();
        if (name) {
          names.add(name);
        }
      });
    assigneeFilter.forEach((selected) => {
      if (selected) {
        names.add(selected);
      }
    });
    const sortedNames = Array.from(names).sort((a, b) => a.localeCompare(b, 'ja'));
    return [{ value: 'all', label: '全員' }, ...sortedNames.map((name) => ({ value: name, label: name }))];
  }, [state.tasks, assigneeFilter]);

  // タスクのステータスフィルターはシンプルに「完了/未完了」のみ
  const statusOptions = useMemo(() => {
    return [
      { value: 'all', label: '全て' },
      { value: '未完了', label: '未完了' },
      { value: '完了', label: '完了' },
    ];
  }, []);

  const archivedProjectsCount = useMemo(
    () => state.projects.filter((project) => isArchivedProjectStatus(calculateProjectStatus(project))).length,
    [state.projects]
  );

  const hasActiveFilters =
    projectFilter.length > 0 || assigneeFilter.length > 0 || statusFilter.length > 0 || (search ?? '').trim() !== '';

  const handleProjectFilterChange = useCallback((value: string | string[]) => {
    const nextValues = Array.isArray(value) ? value : [];
    const hasMyOnly = nextValues.includes(MY_PROJECTS_FILTER_VALUE);
    const wasMyOnly = projectFilter.includes(MY_PROJECTS_FILTER_VALUE);
    if (hasMyOnly && wasMyOnly) {
      setProjectFilter(nextValues.filter((item) => item !== MY_PROJECTS_FILTER_VALUE));
      return;
    }
    if (hasMyOnly) {
      setProjectFilter([MY_PROJECTS_FILTER_VALUE]);
      // 自分参加のプロジェクトだけ展開
      setExpandedProjectIds(new Set(focusProjectIds));
      return;
    }
    setProjectFilter(nextValues);
  }, [projectFilter, focusProjectIds]);

  const resetFilters = () => {
    setProjectFilter([]);
    setAssigneeFilter([]);
    setStatusFilter([]);
    setSearch('');
  };

  // 折畳/展開ハンドラ
  const handleCollapseAll = useCallback(() => {
    setExpandedProjectIds(new Set());
  }, []);

  const handleExpandAll = useCallback(() => {
    const allProjectIds = new Set(filteredTasksWithStages.map(task => task.projectId).filter(Boolean) as string[]);
    setExpandedProjectIds(allProjectIds);
  }, [filteredTasksWithStages]);

  // 初回マウント時にすべて展開
  const initialExpandDoneRef = useRef(false);
  useEffect(() => {
    if (!initialExpandDoneRef.current && filteredTasksWithStages.length > 0) {
      const allProjectIds = new Set(filteredTasksWithStages.map(task => task.projectId).filter(Boolean) as string[]);
      setExpandedProjectIds(allProjectIds);
      initialExpandDoneRef.current = true;
    }
  }, [filteredTasksWithStages]);


  const filtersProps: FiltersProps = {
    projects: projectOptions,
    assignees: assigneeOptions,
    statuses: statusOptions,
    project: projectFilter,
    assignee: assigneeFilter,
    status: statusFilter,
    query: search,
    onProjectChange: handleProjectFilterChange,
    onAssigneeChange: (value) => setAssigneeFilter(Array.isArray(value) ? value : []),
    onStatusChange: (value) => setStatusFilter(Array.isArray(value) ? value : []),
    onQueryChange: setSearch,
    onReset: resetFilters,
    hasActiveFilters,
    resultCount: filteredTasks.length,
    onCollapseAll: handleCollapseAll,
    onExpandAll: handleExpandAll,
    dimOthersEnabled,
    onDimOthersToggle: toggleDimOthers,
  };

  const filterChips = useMemo(() => {
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

  const showFilterSidebar =
    location.pathname === '/' ||
    location.pathname === '/gantt' ||
    location.pathname === '/summary' ||
    location.pathname === '/tasks' ||
    location.pathname === '/workload';
  const actionPanel = showFilterSidebar ? (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase text-slate-500">クイック操作</div>
      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => openTaskModal()}
          disabled={!canEdit}
          className="inline-flex items-center justify-center rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          title={!canEdit ? 'ローカル閲覧中は追加できません' : undefined}
        >
          タスク追加
        </button>
        <button
          type="button"
          onClick={() => {
            setProjectDialogMode('create');
            setEditingProject(null);
            setProjectDialogOpen(true);
          }}
          disabled={!canEdit}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          title={!canEdit ? 'ローカル閲覧中は追加できません' : undefined}
        >
          プロジェクト追加
        </button>
      </div>
    </div>
  ) : null;
  const filtersSidebarPanel = showFilterSidebar ? (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase text-slate-500">フィルターと検索</div>
      <div className="text-[11px] text-slate-500">{filteredTasks.length} 件が条件に一致</div>
      <Filters {...filtersProps} compact stacked />
      {filterChips.length > 0 ? (
        <div className="flex flex-wrap gap-1 text-[10px] text-slate-600">
          {filterChips.map((chip) => (
            <span key={chip} className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

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
      : projectsWithDerived.filter((project) => !isArchivedProjectStatus(calculateProjectStatus(project)));
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

  useEffect(() => {
    if (!editingProjectId) return;
    loadProjectMembersForProject(editingProjectId);
  }, [editingProjectId, loadProjectMembersForProject]);

  const memoizedProjectStages = useMemo(() => {
    if (!editingProjectId) return EMPTY_PROJECT_STAGES;
    return state.tasks.filter(
      (task) => task.projectId === editingProjectId && task.type === 'stage'
    );
  }, [editingProjectId, state.tasks]);

  const handleComplete = async (task: Task, done: boolean) => {
    const nextStatus = done
      ? '完了'
      : task.ステータス === '完了'
        ? '進行中'
        : task.ステータス;
    const optimisticUpdates: Partial<Task> = {
      ステータス: nextStatus,
      progress: done ? 1 : task.progress ?? 0,
      updatedAt: todayString(),
    };

    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) => (item.id === task.id ? { ...item, ...optimisticUpdates } : item)),
    }));

    if (!canSync) {
      pushToast({
        tone: 'success',
        title: done ? 'タスクを完了にしました（ローカル保存）' : 'タスクを再オープンしました（ローカル保存）',
      });
      return;
    }

    const opId = addPending(task.id, optimisticUpdates);

    try {
      await completeTask(task.id, done);
      ackPending(task.id, opId);
      pushToast({
        tone: 'success',
        title: done ? 'タスクを完了にしました' : 'タスクを再オープンしました',
      });
      requestSnapshotReload('task:complete');
    } catch (err) {
      console.error(err);
      rollbackPending(task.id);
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((item) => (item.id === task.id ? task : item)),
      }));
      pushToast({ tone: 'error', title: '完了処理に失敗しました' });
    }
  };

  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    // 一時IDの場合はAPIを呼び出さない（作成中のタスク）
    if (taskId.startsWith('temp-')) {
      console.warn('[handleTaskUpdate] Skipping API call for temp task:', taskId);
      // ローカルのみ更新
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId ? { ...task, ...updates, updatedAt: new Date().toISOString() } : task
        ),
      }));
      return;
    }

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

    // 進捗率の正規化（進捗率 ↔ progress を同期）
    const hasJapaneseProgress = Object.prototype.hasOwnProperty.call(updates, '進捗率');
    const hasEnglishProgress = Object.prototype.hasOwnProperty.call(updates, 'progress');
    if (hasJapaneseProgress) {
      normalizedUpdates.progress = updates.進捗率;
    } else if (hasEnglishProgress && !hasJapaneseProgress) {
      normalizedUpdates.進捗率 = updates.progress;
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
      requestSnapshotReload('task:update:recover', 0);
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
      進捗率: (payload as any).進捗率 ?? 0,
    };

    const normalizedProgress = (payload as any).進捗率 ?? 0;

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
        progress: normalizedProgress,
        進捗率: normalizedProgress,
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
        progress: normalizedProgress,
        進捗率: normalizedProgress,
        createdAt: now,
        updatedAt: now,
      };

    // 1. 楽観的更新：UIに即座に追加
    setState((prev) => ({
      ...prev,
      tasks: [...prev.tasks, optimisticTask],
    }));

    // 2. 作成中として追跡（サーバーリロードで消えないように）
    usePendingOverlay.getState().addCreatingTask(tempId);

    try {
      const result = await createTask(payloadForApi);

      // 3. 成功: realIdを設定してから一時タスクを置き換え
      usePendingOverlay.getState().setCreatingTaskRealId(tempId, result.id);

      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === tempId ? { ...optimisticTask, id: result.id } : t)),
      }));

      // 4. ACK - 作成完了
      usePendingOverlay.getState().ackCreatingTask(tempId);

      toast.success('タスクを追加しました');
      // リロードは不要（タスクは既にstateにある）
    } catch (error) {
      console.error(error);
      // 5. 失敗: ロールバック
      usePendingOverlay.getState().rollbackCreatingTask(tempId);
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

    const tempId = `temp-${Date.now()}`;
    const now = todayString();
    const optimisticProject: Project = {
      id: tempId,
      物件名: payload.物件名,
      ステータス: payload.ステータス,
      優先度: payload.優先度,
      開始日: payload.開始日,
      予定完了日: payload.予定完了日,
      createdAt: now,
      updatedAt: now,
    };

    try {
      console.debug('[Project] Authenticated user:', { uid: user.uid, email: user.email });
      setState((prev) => ({
        ...prev,
        projects: [...prev.projects, optimisticProject],
      }));

      const result = await createProject(payload as unknown as Partial<Project>);
      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((project) =>
          project.id === tempId ? { ...optimisticProject, id: result.id } : project
        ),
      }));
      pushToast({ tone: 'success', title: 'プロジェクトを追加しました' });
      requestSnapshotReload('project:create');
    } catch (error) {
      console.error('[Project] Failed to create project:', error);
      setState((prev) => ({
        ...prev,
        projects: prev.projects.filter((project) => project.id !== tempId),
      }));
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

    const removedProject = project;
    const removedTasks = state.tasks.filter((task) => task.projectId === project.id);
    setState((current) => ({
      ...current,
      projects: current.projects.filter((p) => p.id !== project.id),
      tasks: current.tasks.filter((task) => task.projectId !== project.id),
    }));

    try {
      await deleteProject(project.id);
      pushToast({ tone: 'success', title: `プロジェクト「${project.物件名}」を削除しました` });
      requestSnapshotReload('project:delete');
    } catch (error) {
      console.error('[Project] Failed to delete project:', error);
      setState((current) => {
        const hasProject = current.projects.some((p) => p.id === removedProject.id);
        const restoredProjects = hasProject ? current.projects : [...current.projects, removedProject];
        const missingTasks = removedTasks.filter(
          (task) => !current.tasks.some((existing) => existing.id === task.id)
        );
        return {
          ...current,
          projects: restoredProjects,
          tasks: [...current.tasks, ...missingTasks],
        };
      });
      const errorMessage = error instanceof Error ? error.message : 'プロジェクトの削除に失敗しました';
      pushToast({ tone: 'error', title: 'エラー', description: errorMessage });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    // 一時IDの場合はローカルのみ削除（作成中のタスク）
    if (taskId.startsWith('temp-')) {
      console.warn('[handleDeleteTask] Deleting temp task locally:', taskId);
      setState((current) => ({
        ...current,
        tasks: current.tasks.filter((t) => t.id !== taskId),
      }));
      usePendingOverlay.getState().rollbackCreatingTask(taskId);
      pushToast({ tone: 'success', title: 'タスクを削除しました' });
      return;
    }

    // 注：確認ダイアログは呼び出し元（TaskModal, TaskEditModal等）で表示するため、
    // ここでは確認なしで即座に削除処理を実行する

    if (!canSync) {
      setState((current) => ({
        ...current,
        tasks: current.tasks.filter((t) => t.id !== taskId),
      }));
      pushToast({ tone: 'success', title: 'タスクを削除しました（ローカル保存）' });
      return;
    }

    const removedTask = task;

    // 1. 楽観的更新：UIから即座に削除
    setState((current) => ({
      ...current,
      tasks: current.tasks.filter((t) => t.id !== taskId),
    }));

    // 2. 削除済みとしてpendingに追加（サーバーリロード時に復活を防ぐ）
    const opId = usePendingOverlay.getState().addDeletedTask(taskId);

    try {
      await deleteTask(taskId);
      // 3. ACK - 削除済み追跡を解除
      usePendingOverlay.getState().ackDeletedTask(taskId, opId);
      pushToast({ tone: 'success', title: `タスク「${task.タスク名}」を削除しました` });
      // リロードは不要（サーバー側で削除済み）
    } catch (error: any) {
      console.error('[Task] Failed to delete task:', error);

      // 503（サーバー一時的利用不可）の場合はロールバックしない
      // UIからは削除されたままにして、後でリトライ可能にする
      const is503 = error?.status === 503 || error?.message?.includes('503');
      if (is503) {
        console.warn('[Task] Server unavailable (503), keeping task deleted in UI');
        pushToast({ tone: 'info', title: 'サーバーが一時的に利用不可です', description: '削除はサーバー復旧後に反映されます' });
        // deletedTasksは維持してUIから消えたままにする
        return;
      }

      // 4. その他のエラー時はロールバック
      usePendingOverlay.getState().rollbackDeletedTask(taskId);
      setState((current) => {
        const exists = current.tasks.some((t) => t.id === removedTask.id);
        return exists
          ? current
          : { ...current, tasks: [...current.tasks, removedTask] };
      });
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
    const tempId = `temp-${Date.now()}`;
    const now = todayString();
    const optimisticPerson: Person = {
      id: tempId,
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
    try {
      setState((prev) => ({
        ...prev,
        people: [...prev.people, optimisticPerson],
      }));
      const result = await createPerson(payload as unknown as Partial<Person>);
      const entityType = (payload.type || 'person') === 'client' ? 'クライアント' : '担当者';
      setState((prev) => ({
        ...prev,
        people: prev.people.map((person) =>
          person.id === tempId ? { ...optimisticPerson, id: result.id } : person
        ),
      }));
      pushToast({ tone: 'success', title: `${entityType}を追加しました` });
      requestSnapshotReload('person:create');
    } catch (error) {
      console.error(error);
      setState((prev) => ({
        ...prev,
        people: prev.people.filter((person) => person.id !== tempId),
      }));
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
      requestSnapshotReload('project:update');
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

        const tempId = `temp-${Date.now()}`;
        const now = todayString();
        const optimisticProject: Project = {
          ...(clean as Project),
          id: tempId,
          createdAt: now,
          updatedAt: now,
        };
        try {
          console.debug('[Project] Authenticated user:', { uid: user.uid, email: user.email });
          setState((prev) => ({
            ...prev,
            projects: [...prev.projects, optimisticProject],
          }));
          const result = await createProject(clean);
          savedProjectId = result.id;
          setState((prev) => ({
            ...prev,
            projects: prev.projects.map((project) =>
              project.id === tempId ? { ...optimisticProject, id: result.id } : project
            ),
          }));
          pushToast({ tone: 'success', title: 'プロジェクトを追加しました' });
          requestSnapshotReload('project:create');
        } catch (error) {
          console.error('[Project] Failed to create project:', error);
          setState((prev) => ({
            ...prev,
            projects: prev.projects.filter((project) => project.id !== tempId),
          }));
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
    return savedProjectId;
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
    const prevPerson = state.people.find((person) => person.id === personId) ?? null;
    setState((prev) => ({
      ...prev,
      people: prev.people.map((person) =>
        person.id === personId
          ? { ...person, ...payload, updatedAt: todayString() }
          : person
      ),
    }));
    try {
      await updatePerson(personId, payload);
      pushToast({ tone: 'success', title: '担当者を更新しました' });
      requestSnapshotReload('person:update');
      setEditingPerson(null);
    } catch (error) {
      console.error(error);
      if (prevPerson) {
        setState((prev) => ({
          ...prev,
          people: prev.people.map((person) =>
            person.id === personId ? prevPerson : person
          ),
        }));
      }
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
        requestSnapshotReload('task:assignee:recover', 0);
      }
    },
    [canSync, state.tasks, addPending, ackPending, rollbackPending, requestSnapshotReload]
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
        requestSnapshotReload('task:dates:recover', 0);
      }
    },
    [canSync, setState, addPending, ackPending, rollbackPending, requestSnapshotReload]
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
      requestSnapshotReload('snapshot:import', 1000);
      return;
    }
    const normalized = normalizeSnapshot(payload);
    setState({
      projects: normalized.projects,
      tasks: normalized.tasks,
      people: normalized.people,
    });
  }, [canSync, setState, requestSnapshotReload]);

  const handleImportExcelSafe = useCallback(async (file: File) => {
    if (!canSync) {
      throw new Error('Excel import is available after signing in.');
    }
    await importExcel(file);
    requestSnapshotReload('excel:import', 1000);
  }, [canSync, requestSnapshotReload]);

  const handleEmailAuth = useCallback(
    async (mode: 'signin' | 'signup') => {
      const email = emailAuthInput.email.trim();
      const password = emailAuthInput.password;
      if (!email || !password) {
        setEmailAuthError('メールアドレスとパスワードを入力してください。');
        return;
      }
      setEmailAuthError(null);
      setEmailAuthLoading(true);
      try {
        if (mode === 'signin') {
          await signIn('email', { email, password });
        } else {
          await signUpWithEmail(email, password);
        }
      } finally {
        setEmailAuthLoading(false);
      }
    },
    [emailAuthInput, signIn, signUpWithEmail]
  );

  // 認証準備中
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">サインイン状態を確認しています...</p>
        </div>
      </div>
    );
  }

  // 未認証
  if (authSupported && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md p-8 bg-white rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">サインインが必要です</h2>
          <p className="text-slate-600 mb-6">このアプリケーションを使用するには、サインインしてください。</p>
          <button
            onClick={() => signIn()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Googleでサインイン
          </button>
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">または</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="space-y-3 text-left">
            <label className="block text-xs font-semibold text-slate-600">
              メールアドレス
              <input
                type="email"
                value={emailAuthInput.email}
                onChange={(event) => setEmailAuthInput((prev) => ({ ...prev, email: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                placeholder="example@company.co.jp"
                autoComplete="email"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              パスワード
              <input
                type="password"
                value={emailAuthInput.password}
                onChange={(event) => setEmailAuthInput((prev) => ({ ...prev, password: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                placeholder="8文字以上"
                autoComplete="current-password"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleEmailAuth('signin')}
                disabled={emailAuthLoading}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                メールでログイン
              </button>
              <button
                type="button"
                onClick={() => handleEmailAuth('signup')}
                disabled={emailAuthLoading}
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                メールで新規登録
              </button>
            </div>
            {(emailAuthError || authError) && (
              <p className="text-xs text-rose-500">{emailAuthError || authError}</p>
            )}
            <p className="text-[11px] text-slate-400">
              会社のメールで登録する場合、管理者の許可が必要なことがあります。
            </p>
          </div>
        </div>
      </div>
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
              <p className="text-xs text-slate-300 leading-relaxed">
                すでに登録済みなのに確認できない場合、Stripe決済時のメールアドレスが異なる可能性があります。Stripeから届いた領収書メールの宛先、または決済完了画面のメールアドレスをご確認ください。
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">
                解決しない場合は compass@archi-prisma.co.jp までご連絡ください。
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
                target="blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-semibold shadow-lg shadow-indigo-900/30 transition"
              >
                サブスクリプションを申し込む
              </a>
              <button
                type="button"
                onClick={handleSubscriptionCheck}
                disabled={subscriptionCheckLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold shadow-lg shadow-emerald-900/30 transition disabled:opacity-50"
              >
                {subscriptionCheckLoading ? '確認中…' : 'サブスク登録済みならこちら'}
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-white/20 text-sm font-semibold text-white hover:bg-white/5 transition"
              >
                別アカウントで試す
              </button>
            </div>
            {subscriptionCheckError && <p className="text-xs text-rose-200">{subscriptionCheckError}</p>}
          </div>
        </div>
      </>
    );
  }

  if (authBlocked) {
    return (
      <>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center px-6">
          <div className="max-w-2xl w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-6 shadow-2xl">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.2em] text-indigo-200">Welcome to Compass</p>
              <h1 className="text-2xl font-bold text-white">認証が完了できませんでした</h1>
              <p className="text-slate-200 text-sm leading-relaxed">
                {authBlockedMessage ??
                  'このアカウントでは利用できません。招待済みのメールでサインインするか、管理者にご確認ください。'}
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">
                解決しない場合は compass@archi-prisma.co.jp までご連絡ください。
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => signOut()}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold shadow-lg shadow-emerald-900/30 transition"
              >
                別アカウントで試す
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
                  {orgIdNormalized && orgIdNormalized !== orgSetupForm.orgId.trim() && (
                    <p className="text-xs text-slate-400">使用されるID: {orgIdNormalized}</p>
                  )}
                  {orgIdAvailability === 'checking' && (
                    <p className="text-xs text-slate-300">利用可否を確認中...</p>
                  )}
                  {orgIdAvailability === 'available' && (
                    <p className="text-xs text-emerald-200">この組織IDは利用できます</p>
                  )}
                  {orgIdAvailability === 'unavailable' && (
                    <p className="text-xs text-rose-300">この組織IDは既に使われています</p>
                  )}
                  {orgIdAvailability === 'invalid' && (
                    <p className="text-xs text-rose-300">組織IDの形式が正しくありません</p>
                  )}
                  {orgIdAvailability === 'error' && (
                    <p className="text-xs text-rose-300">組織IDの確認に失敗しました</p>
                  )}
                </div>
                {orgSetupError && <p className="text-xs text-rose-300">{orgSetupError}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={
                      orgSetupLoading ||
                      !orgSetupForm.orgId.trim() ||
                      !orgSetupForm.orgName.trim() ||
                      orgIdAvailability === 'checking' ||
                      orgIdAvailability === 'invalid' ||
                      orgIdAvailability === 'unavailable'
                    }
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-semibold shadow-lg shadow-indigo-900/30 transition disabled:opacity-50"
                  >
                    {orgSetupLoading ? '作成中...' : '組織を作成する'}
                  </button>
                  {orgIdAvailability === 'error' && (
                    <p className="text-xs text-amber-200">
                      IDの確認ができませんでしたが、作成は可能です（重複時はエラーになります）
                    </p>
                  )}
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
        sidebarPanel={filtersSidebarPanel}
        actionPanel={actionPanel}
      >
        <Routes>
          <Route
            path="/"
            element={
              <SchedulePage
                filteredTasks={filteredTasks}
                filteredTasksWithStages={filteredTasksWithStages}
                projectMap={projectMap}
                people={state.people}
                projects={state.projects}
                onTaskDateChange={handleTaskDateChange}
                onTaskAssigneeChange={handleTaskAssigneeChange}
                onTaskUpdate={handleTaskUpdate}
                onTaskDelete={handleDeleteTask}
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
                onStageClick={handleStageClick}
                stageProgressMap={stageProgressMap}
                onRequestPeople={ensurePeopleLoaded}
                onRequestProjectMembers={loadProjectMembersForProject}
                projectFilter={projectFilter}
                assigneeFilter={assigneeFilter}
                printPanelOpen={printPanelOpen}
                printProjectIds={printProjectIds}
                printPaperSize={printPaperSize}
                printRangeMode={printRangeMode}
                printProjectOptions={printProjectOptions}
                filteredPrintProjectOptions={filteredPrintProjectOptions}
                printProjectSearch={printProjectSearch}
                setPrintProjectSearch={setPrintProjectSearch}
                openPrintPanel={openPrintPanel}
                togglePrintProject={togglePrintProject}
                handlePrintSubmit={handlePrintSubmit}
                setPrintPanelOpen={setPrintPanelOpen}
                setPrintProjectIds={setPrintProjectIds}
                setPrintPaperSize={setPrintPaperSize}
                setPrintRangeMode={setPrintRangeMode}
                holidaySet={holidaySet}
                user={user}
                expandedProjectIds={expandedProjectIds}
                onToggleProject={(projectId) => {
                  setExpandedProjectIds(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(projectId)) {
                      newSet.delete(projectId);
                    } else {
                      newSet.add(projectId);
                    }
                    return newSet;
                  });
                }}
                dimOthersEnabled={dimOthersEnabled}
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
                onRequestProjectMembers={loadProjectMembersForProject}
              />
            }
          />
          <Route
            path="/tasks"
            element={
              <TasksPage
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
                filteredTasks={filteredTasks}
                filteredTasksWithStages={filteredTasksWithStages}
                projectMap={projectMap}
                people={state.people}
                projects={state.projects}
                onTaskDateChange={handleTaskDateChange}
                onTaskAssigneeChange={handleTaskAssigneeChange}
                onTaskUpdate={handleTaskUpdate}
                onTaskDelete={handleDeleteTask}
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
                onStageClick={handleStageClick}
                stageProgressMap={stageProgressMap}
                projectFilter={projectFilter}
                assigneeFilter={assigneeFilter}
                printPanelOpen={printPanelOpen}
                printProjectIds={printProjectIds}
                printPaperSize={printPaperSize}
                printRangeMode={printRangeMode}
                printProjectOptions={printProjectOptions}
                filteredPrintProjectOptions={filteredPrintProjectOptions}
                printProjectSearch={printProjectSearch}
                setPrintProjectSearch={setPrintProjectSearch}
                openPrintPanel={openPrintPanel}
                togglePrintProject={togglePrintProject}
                handlePrintSubmit={handlePrintSubmit}
                setPrintPanelOpen={setPrintPanelOpen}
                setPrintProjectIds={setPrintProjectIds}
                setPrintPaperSize={setPrintPaperSize}
                setPrintRangeMode={setPrintRangeMode}
                holidaySet={holidaySet}
                user={user}
                expandedProjectIds={expandedProjectIds}
                onToggleProject={(projectId) => {
                  setExpandedProjectIds(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(projectId)) {
                      newSet.delete(projectId);
                    } else {
                      newSet.add(projectId);
                    }
                    return newSet;
                  });
                }}
                dimOthersEnabled={dimOthersEnabled}
              />
            }
          />
          <Route
            path="/workload"
            element={<WorkloadPage tasks={filteredTasks} projects={state.projects} people={state.people} />}
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
        preloadedProjectMembers={taskModalDefaults?.projectId ? allProjectMembers.get(taskModalDefaults.projectId) : undefined}
        lockProject={Boolean(taskModalDefaults?.projectId)}
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
      <StageEditModal
        open={stageEditModalOpen}
        onOpenChange={setStageEditModalOpen}
        stage={editingStage}
        onUpdate={handleStageUpdate}
        onDelete={handleStageDelete}
        onAddTask={(stage) => {
          openTaskModal({ projectId: stage.projectId, stageId: stage.id });
        }}
        onNotify={pushToast}
      />
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
          onOpenTaskModal={openTaskModal}
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
