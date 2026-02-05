import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import DatePicker from 'react-datepicker';
import { Modal, ModalProps } from './Modal';
import { listProjectMembers, listStages } from '../../lib/api';
import { clampToSingleDecimal, parseHoursInput } from '../../lib/number';
import { PROJECT_ROLE_LABELS } from '../../lib/auth-types';
import { computeDiff, isDiffEmpty } from '../../lib/diff';
import type { Project, Task, Person, TaskNotificationSettings, Stage, WorkItemType } from '../../lib/types';
import type { ProjectMember } from '../../lib/auth-types';
import type { ToastMessage } from '../ToastStack';

type TaskType = 'task' | 'meeting';

type ToastInput = {
  tone: ToastMessage['tone'];
  title: string;
  description?: string;
  duration?: number;
};

export interface TaskModalProps extends ModalProps {
  projects: Project[];
  people: Person[];
  editingTask?: Task | null;
  defaultProjectId?: string;
  defaultStageId?: string;
  allowContinuousCreate?: boolean;
  preloadedProjectMembers?: ProjectMember[];
  lockProject?: boolean;
  onSubmit(payload: {
    projectId: string;
    タスク名: string;
    担当者?: string;
    予定開始日?: string;
    期限?: string;
    マイルストーン?: boolean;
    優先度: string;
    ステータス: string;
    進捗率?: number;
    ['工数見積(h)']?: number;
    担当者メール?: string;
    parentId?: string | null;
    '通知設定'?: TaskNotificationSettings;
    type?: TaskType;
    participants?: string[];
  }): Promise<void>;
  onUpdate?(taskId: string, updates: Partial<Task>): Promise<void>;
  onDelete?(taskId: string): Promise<void>;
  onNotify?(message: ToastInput): void;
}

export function TaskModal({
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
  preloadedProjectMembers,
  lockProject,
}: TaskModalProps) {
  const [project, setProject] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('task');
  const [participants, setParticipants] = useState<string[]>([]);
  const [assignee, setAssignee] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [durationDays, setDurationDays] = useState<number>(1);
  const [priority, setPriority] = useState('中');
  const [status, setStatus] = useState('未着手');
  const [progress, setProgress] = useState(0);
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
  const prevProjectRef = useRef<string>('');
  const allowContinuous = Boolean(allowContinuousCreate && !editingTask);

  const resetFormFields = useCallback((keepContext: boolean) => {
    setName('');
    setStartDate(null);
    setEndDate(null);
    setDurationDays(1);
    setIsMilestone(false);
    setTaskType('task');
    setParticipants([]);
    if (keepContext) return;
    setProject('');
    setStageId('');
    setAssignee('');
    setAssigneeEmail('');
    setPriority('中');
    setStatus('未着手');
    setProgress(0);
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
      setTaskType(editingTask.type === 'meeting' ? 'meeting' : 'task');
      setParticipants(editingTask.participants || []);
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
      const existingProgress = editingTask.progress ?? editingTask.進捗率 ?? 0;
      setProgress(existingProgress > 1 ? existingProgress : existingProgress * 100);
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
        // preloadedProjectMembersがあれば即座に設定
        if (preloadedProjectMembers && preloadedProjectMembers.length > 0) {
          setProjectMembers(preloadedProjectMembers);
          setMembersLoading(false);
        }
      }
      if (defaultStageId) {
        setStageId(defaultStageId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingTask, defaultProjectId, defaultStageId, resetFormFields]);

  useEffect(() => {
    if (!open) {
      prevProjectRef.current = '';
      return;
    }
    if (prevProjectRef.current && prevProjectRef.current !== project) {
      setStageId('');
      setAssignee('');
      setAssigneeEmail('');
    }
    prevProjectRef.current = project;
  }, [open, project]);

  // プロジェクト選択時に工程一覧を取得（常にAPIから取得）
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

    // preloadedProjectMembersにメンバーがある場合のみ使用、空配列の場合はAPIを呼ぶ
    if (preloadedProjectMembers && preloadedProjectMembers.length > 0 && project === defaultProjectId) {
      setProjectMembers(preloadedProjectMembers);
      setMembersLoading(false);
      return;
    }

    setMembersLoading(true);
    listProjectMembers(project, { status: 'active' })
      .then(members => {
        setProjectMembers(members);
      })
      .catch(error => {
        console.error('[TaskModal] Failed to load project members:', error);
        setProjectMembers([]);
      })
      .finally(() => {
        setMembersLoading(false);
      });
  }, [project, preloadedProjectMembers, defaultProjectId]);

  // 担当者選択時にメールアドレスを自動入力（プロジェクトメンバーから検索）
  useEffect(() => {
    if (!assignee) {
      setAssigneeEmail('');
      return;
    }
    const member = projectMembers.find((m) => m.displayName === assignee);
    if (member) {
      setAssigneeEmail(member.email);
      return;
    }
    // フォールバック: peopleから検索（後方互換性のため）
    const person = people.find((p) => p.氏名 === assignee);
    setAssigneeEmail(person?.メール ?? '');
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
        担当者: taskType === 'meeting' ? undefined : assignee,
        予定開始日: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
        期限: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
        優先度: priority,
        ステータス: status,
        進捗率: progress / 100,
        ['工数見積(h)']: estimate,
        担当者メール: taskType === 'meeting' ? undefined : (assigneeEmail || undefined),
        マイルストーン: isMilestone,
        parentId: stageId || null,
        '通知設定': {
          開始日: notifyStart,
          期限前日: notifyDayBefore,
          期限当日: notifyDue,
          超過: notifyOverdue,
        },
        type: taskType,
        participants: taskType === 'meeting' ? participants : undefined,
      } as {
        projectId: string;
        タスク名: string;
        担当者?: string;
        予定開始日?: string;
        期限?: string;
        マイルストーン?: boolean;
        優先度: string;
        ステータス: string;
        進捗率?: number;
        ['工数見積(h)']?: number;
        担当者メール?: string;
        parentId?: string | null;
        '通知設定'?: TaskNotificationSettings;
        type?: TaskType;
        participants?: string[];
      };

      const shouldClose = editingTask || !(allowContinuous && intent === 'continue');
      if (shouldClose) {
        onOpenChange(false);
      }

      if (editingTask && onUpdate) {
        // 編集モード: 変更されたフィールドのみを抽出して送信
        const originalData: Record<string, unknown> = {
          projectId: editingTask.projectId,
          タスク名: editingTask.タスク名,
          担当者: editingTask.担当者 || editingTask.assignee || '',
          予定開始日: editingTask.予定開始日 || editingTask.start || undefined,
          期限: editingTask.期限 || editingTask.end || undefined,
          優先度: editingTask.優先度 || '中',
          ステータス: editingTask.ステータス || '未着手',
          進捗率: (editingTask.progress ?? editingTask.進捗率 ?? 0) > 1
            ? (editingTask.progress ?? editingTask.進捗率 ?? 0) / 100
            : (editingTask.progress ?? editingTask.進捗率 ?? 0),
          ['工数見積(h)']: editingTask['工数見積(h)'] ?? 4,
          担当者メール: editingTask.担当者メール || '',
          マイルストーン: editingTask.マイルストーン === true || editingTask.milestone === true,
          parentId: editingTask.parentId || null,
          '通知設定': editingTask['通知設定'] ?? {
            開始日: true,
            期限前日: true,
            期限当日: true,
            超過: true,
          },
          type: editingTask.type || 'task',
          participants: editingTask.participants || [],
        };

        const diff = computeDiff(originalData, payload as Record<string, unknown>, {
          // projectIdは変更不可なので除外
          excludeFields: ['projectId'],
        });

        if (isDiffEmpty(diff)) {
          console.log('[TaskModal] No changes detected, skipping update');
          // 変更がない場合は閉じるだけ
        } else {
          console.log('[TaskModal] Updating task with diff:', diff, '(changed fields:', Object.keys(diff), ')');
          await onUpdate(editingTask.id, diff as Partial<Task>);
        }
      } else {
        console.log('[TaskModal] Creating task with payload:', payload);
        await onSubmit(payload);
      }
      if (!editingTask && allowContinuous && intent === 'continue') {
        resetFormFields(true);
        taskNameInputRef.current?.focus();
        return;
      }
    } catch (err) {
      console.error(err);
      onNotify?.({ tone: 'error', title: editingTask ? 'タスクの更新に失敗しました' : 'タスクの追加に失敗しました' });
    }
  };

  const assignableMembers = useMemo(
    () => projectMembers.filter((member) => member.status === 'active'),
    [projectMembers]
  );

  const assigneeOptions = assignableMembers.map((member) => {
    const roleLabel = PROJECT_ROLE_LABELS[member.role] ?? member.role;
    return {
      key: member.userId || member.displayName,
      value: member.displayName,
      label: `${member.displayName} (${roleLabel})`,
    };
  });

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    const nativeEvent = e.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number };
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) {
      e.preventDefault();
      return;
    }
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
      e.preventDefault();
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={editingTask ? "タスク編集" : "タスク追加"}>
      <form className="space-y-3" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">プロジェクト</label>
            {lockProject && project ? (
              <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {projects.find(p => p.id === project)?.物件名 || project}
              </div>
            ) : (
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
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">種別</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTaskType('task')}
                className={`flex-1 px-3 py-2 text-sm rounded-2xl border transition-colors ${
                  taskType === 'task'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                タスク
              </button>
              <button
                type="button"
                onClick={() => setTaskType('meeting')}
                className={`flex-1 px-3 py-2 text-sm rounded-2xl border transition-colors ${
                  taskType === 'meeting'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                打合せ
              </button>
            </div>
          </div>
        </div>

        {/* タスクの場合：担当者選択 */}
        {taskType === 'task' && (
          <>
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
              ) : assigneeOptions.length > 0 ? (
                <select
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">選択</option>
                  {assigneeOptions.map((option) => (
                    <option key={option.key} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div>
                  <select
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-400 bg-slate-50"
                    value=""
                    disabled
                  >
                    <option value="">担当者候補がありません</option>
                  </select>
                  <p className="mt-1 text-xs text-amber-600">
                    プロジェクトにメンバーを追加すると、担当者として選択できます
                  </p>
                </div>
              )}
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
          </>
        )}

        {/* 打合せの場合：参加者複数選択 */}
        {taskType === 'meeting' && (
          <div>
            <label className="mb-1 block text-xs text-slate-500">参加者</label>
            {!project ? (
              <div className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm text-slate-400">
                プロジェクトを選択してください
              </div>
            ) : membersLoading ? (
              <div className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm text-slate-400">
                メンバー読み込み中...
              </div>
            ) : assigneeOptions.length > 0 ? (
              <div className="border border-slate-200 rounded-2xl p-2 max-h-40 overflow-y-auto space-y-1">
                {assigneeOptions.map((option) => {
                  const isSelected = participants.includes(option.value);
                  return (
                    <label
                      key={option.key}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setParticipants([...participants, option.value]);
                          } else {
                            setParticipants(participants.filter(p => p !== option.value));
                          }
                        }}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">{option.label}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="w-full px-3 py-2 border border-slate-200 rounded-2xl">
                <p className="text-xs text-amber-600">
                  プロジェクトにメンバーを追加すると、参加者として選択できます
                </p>
              </div>
            )}
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-slate-500">工程</label>
          <select
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              onChange={(e) => {
                const newStatus = e.target.value;
                setStatus(newStatus);
                // 完了に変更したら進捗を100%に
                if (newStatus === '完了') setProgress(100);
              }}
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
          <label className="mb-1 block text-xs text-slate-500">進捗率: {Math.round(progress)}%</label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            value={progress}
            onChange={(e) => {
              const newProgress = Number(e.target.value);
              setProgress(newProgress);
              // 100%にしたら完了に、0%にしたら未着手に自動変更
              if (newProgress === 100 && status !== '完了') setStatus('完了');
              else if (newProgress === 0 && status === '完了') setStatus('未着手');
            }}
          />
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
