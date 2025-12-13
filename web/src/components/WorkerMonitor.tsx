import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CalendarDays, CheckCircle2, RefreshCw } from 'lucide-react';
import { seedTaskReminders, syncTaskCalendar } from '../lib/api';
import type { Task } from '../lib/types';

interface WorkerMonitorProps {
  tasks: Task[];
  canSync?: boolean;
}

type WorkerState = 'idle' | 'running' | 'success' | 'error';

export function WorkerMonitor({ tasks, canSync = true }: WorkerMonitorProps) {
  const [state, setState] = useState<WorkerState>('idle');
  const [message, setMessage] = useState<string>('ジョブ待機中');
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    if (!tasks.length) {
      setMessage('ジョブ待機中（対象タスクなし）');
      return;
    }
    setMessage(`ジョブ待機中（対象: ${tasks.length} 件）`);
  }, [tasks]);

  const icon = useMemo(() => {
    switch (state) {
      case 'running':
        return <RefreshCw className="h-4 w-4 animate-spin text-slate-500" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-rose-500" />;
      case 'idle':
      default:
        return <BellRing className="h-4 w-4 text-slate-400" />;
    }
  }, [state]);

  const runSeed = async () => {
    if (!tasks.length || !canSync) {
      return;
    }
    setState('running');
    setMessage('通知ジョブを登録中...');
    setErrorDetails(null);
    try {
      await Promise.all(tasks.map((task) => seedTaskReminders(task.id)));
      setState('success');
      setMessage(`通知ジョブを登録しました（${tasks.length} 件）`);
      setLastRunAt(new Date());
    } catch (error) {
      setState('error');
      const errMsg = error instanceof Error ? error.message : String(error);
      setMessage('通知ジョブ登録に失敗しました');
      setErrorDetails(errMsg);
    }
  };

  const runCalendar = async () => {
    if (!tasks.length || !canSync) {
      return;
    }
    setState('running');
    setMessage('カレンダー同期を実行中...');
    setErrorDetails(null);
    try {
      await Promise.all(tasks.map((task) => syncTaskCalendar(task.id)));
      setState('success');
      setMessage(`カレンダー同期をリクエストしました（${tasks.length} 件）`);
      setLastRunAt(new Date());
    } catch (error) {
      setState('error');
      const errMsg = error instanceof Error ? error.message : String(error);
      setMessage('カレンダー同期のリクエストに失敗しました');
      setErrorDetails(errMsg);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {icon}
          <span>通知・カレンダー連携</span>
        </div>
        {lastRunAt ? (
          <span className="text-[11px] text-slate-400">最終実行: {lastRunAt.toLocaleTimeString()}</span>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-500">システムジョブのステータスを確認し、必要に応じて手動で実行できます。</p>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {message}{!canSync ? '（サインインすると実行できます）' : ''}
        {errorDetails ? <div className="mt-1 text-rose-500">{errorDetails}</div> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          onClick={runSeed}
          disabled={!tasks.length || state === 'running' || !canSync}
        >
          <BellRing className="h-4 w-4" /> 通知ジョブを登録
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          onClick={runCalendar}
          disabled={!tasks.length || state === 'running' || !canSync}
        >
          <CalendarDays className="h-4 w-4" /> カレンダー同期をリクエスト
        </button>
      </div>
    </div>
  );
}
