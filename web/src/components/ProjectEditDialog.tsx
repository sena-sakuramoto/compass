import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import DatePicker, { registerLocale } from 'react-datepicker';
import { X, Users, History, Plus, Trash2, UserPlus, Mail, Shield, Briefcase, AlertCircle, Check } from 'lucide-react';
import type { Project, Task, ManageableUserSummary } from '../lib/types';
import type { ProjectMember, ProjectMemberInput, ProjectRole, 職種Type } from '../lib/auth-types';
import { listProjectMembers, listActivityLogs, type ActivityLog, buildAuthHeaders, listManageableProjectUsers } from '../lib/api';
import { PROJECT_ROLE_LABELS, ROLE_LABELS } from '../lib/auth-types';
import { GoogleMapsAddressInput } from './GoogleMapsAddressInput';
import { GoogleDriveFolderPicker } from './GoogleDriveFolderPicker';
import { ClientSelector } from './ClientSelector';

// 日本語ロケールを登録
registerLocale('ja', ja);

interface ProjectEditDialogProps {
  project: Project | null;
  onClose: () => void;
  onSave: (project: Project) => Promise<void>;
  onDelete?: (project: Project) => Promise<void>;
  onTaskCreate?: (taskData: Partial<Task>) => Promise<void>;
  people?: Array<{ id: string; 氏名: string; メール?: string }>;
}

const STATUS_OPTIONS = ['未着手', '進行中', '確認待ち', '保留', '完了', '計画中', '見積', '実施中', '設計中'];
const PRIORITY_OPTIONS = ['高', '中', '低'];

// 職種の選択肢
const JOB_TYPE_OPTIONS: (職種Type | '')[] = [
  '',
  '営業',
  'PM',
  '設計',
  '施工管理',
  '設備（給排水）',
  '設備（電気）',
  '厨房',
  '看板',
  '家具',
  'その他',
];

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api';

export function ProjectEditDialog({ project, onClose, onSave, onDelete, onTaskCreate, people = [] }: ProjectEditDialogProps) {
  const [formData, setFormData] = useState<Partial<Project>>({
    id: '',
    物件名: '',
    クライアント: '',
    ステータス: '未着手',
    優先度: '中',
    開始日: '',
    予定完了日: '',
    現地調査日: '',
    着工日: '',
    竣工予定日: '',
    引渡し予定日: '',
    '所在地/現地': '',
    '所在地_現地': '',
    'フォルダURL': '',
    備考: '',
    施工費: undefined,
  });
  const [saving, setSaving] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // メンバー管理用の状態
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('member');
  const [inviteJob, setInviteJob] = useState<職種Type | ''>('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [manageableUsers, setManageableUsers] = useState<ManageableUserSummary[]>([]);
  const [manageableLoading, setManageableLoading] = useState(false);
  const [manageableLoaded, setManageableLoaded] = useState(false);
  const [manageableError, setManageableError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskAssigneeEmail, setNewTaskAssigneeEmail] = useState('');
  const [newTaskStartDate, setNewTaskStartDate] = useState<Date | null>(null);
  const [newTaskEndDate, setNewTaskEndDate] = useState<Date | null>(null);
  const [newTaskPriority, setNewTaskPriority] = useState('中');
  const [newTaskStatus, setNewTaskStatus] = useState('未着手');
  const [newTaskEstimate, setNewTaskEstimate] = useState(4);
  const [newTaskNotifyStart, setNewTaskNotifyStart] = useState(true);
  const [newTaskNotifyDayBefore, setNewTaskNotifyDayBefore] = useState(true);
  const [newTaskNotifyDue, setNewTaskNotifyDue] = useState(true);
  const [newTaskNotifyOverdue, setNewTaskNotifyOverdue] = useState(true);
  const [newTaskIsMilestone, setNewTaskIsMilestone] = useState(false);
  const [taskCreating, setTaskCreating] = useState(false);

  useEffect(() => {
    if (project) {
      setFormData(project);
      // プロジェクトメンバーを取得（編集モード時のみ）
      if (project.id) {
        setMembersLoading(true);
        setLogsLoading(true);

        Promise.all([
          listProjectMembers(project.id, { status: 'active' }),
          listActivityLogs({ projectId: project.id, limit: 20 }),
        ])
          .then(([members, logsData]) => {
            setProjectMembers(members);
            setActivityLogs(logsData.logs);
          })
          .catch(error => {
            console.error('Failed to load project data:', error);
            setProjectMembers([]);
            setActivityLogs([]);
          })
          .finally(() => {
            setMembersLoading(false);
            setLogsLoading(false);
          });
      } else {
        setProjectMembers([]);
        setActivityLogs([]);
      }
    } else {
      // Reset to default values for new project
      setFormData({
        id: '',
        物件名: '',
        クライアント: '',
        ステータス: '未着手',
        優先度: '中',
        開始日: '',
        予定完了日: '',
        現地調査日: '',
        着工日: '',
        竣工予定日: '',
        引渡し予定日: '',
        '所在地/現地': '',
        '所在地_現地': '',
        'フォルダURL': '',
        備考: '',
        施工費: undefined,
      });
      setProjectMembers([]);
    }
  }, [project]);

  // 招待フォームが開かれたときに候補ユーザーをロード
  useEffect(() => {
    if (showInviteForm && project?.id) {
      loadManageableUsers().catch(() => {
        /* errors handled inside */
      });
    }
  }, [showInviteForm, project?.id]);

  // ESCキーでダイアログを閉じる
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

  const getAuthToken = async () => {
    const { getAuth } = await import('firebase/auth');
    const { getApp } = await import('firebase/app');
    const app = getApp();
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken(true);
  };

  const loadManageableUsers = async (force = false): Promise<void> => {
    if (!project?.id) return;
    if (manageableLoading) return;
    if (!force && manageableLoaded) return;

    try {
      setManageableLoading(true);
      setManageableError(null);

      const users = await listManageableProjectUsers(project.id);
      setManageableUsers(users);
      setManageableLoaded(true);

      if (selectedCandidateId && !users.some(user => user.id === selectedCandidateId)) {
        setSelectedCandidateId('');
      }
    } catch (err) {
      console.error('Error loading manageable users:', err);
      if (err instanceof Error && err.message.toLowerCase().includes('forbidden')) {
        setManageableError('このプロジェクトのメンバーを管理する権限がありません。');
      } else {
        setManageableError('候補の取得に失敗しました。');
      }
      setManageableUsers([]);
      setManageableLoaded(true);
    } finally {
      setManageableLoading(false);
    }
  };

  const handleCandidateSelect = (candidate: ManageableUserSummary) => {
    if (selectedCandidateId === candidate.id) {
      setSelectedCandidateId('');
    } else {
      setSelectedCandidateId(candidate.id);
      setInviteEmail(candidate.email);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteEmail || !project?.id) {
      setError('メールアドレスを入力してください');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const input: ProjectMemberInput = {
        email: inviteEmail,
        role: inviteRole,
        職種: inviteJob || undefined,
        message: inviteMessage || undefined,
      };

      const token = await getAuthToken();
      const response = await fetch(`${BASE_URL}/projects/${project.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to invite member');
      }

      // メンバー一覧を再読み込み
      const members = await listProjectMembers(project.id, { status: 'active' });
      setProjectMembers(members);
      await loadManageableUsers(true);

      setSuccess('メンバーを追加/招待しました');
      setInviteEmail('');
      setInviteRole('member');
      setInviteJob('');
      setInviteMessage('');
      setSelectedCandidateId('');
      setShowInviteForm(false);
    } catch (err: any) {
      console.error('Error inviting member:', err);
      setError(err.message || 'メンバーの追加/招待に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('このメンバーをプロジェクトから削除しますか？') || !project?.id) return;

    try {
      setError(null);
      const token = await getAuthToken();
      const response = await fetch(`${BASE_URL}/projects/${project.id}/members/${userId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(token),
      });

      if (!response.ok) throw new Error('Failed to remove member');

      // メンバーリストを再読み込み
      try {
        const members = await listProjectMembers(project.id, { status: 'active' });
        setProjectMembers(members);
      } catch (memberLoadErr) {
        console.error('Failed to reload members:', memberLoadErr);
        // エラーがあっても空配列で続行
        setProjectMembers([]);
      }

      // 候補ユーザーリストを再読み込み
      try {
        await loadManageableUsers(true);
      } catch (userLoadErr) {
        console.error('Failed to reload manageable users:', userLoadErr);
        // エラーがあっても続行
      }

      setSuccess('メンバーを削除しました');
    } catch (err) {
      console.error('Error removing member:', err);
      setError('メンバーの削除に失敗しました');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: ProjectRole) => {
    if (!project?.id) return;

    try {
      const token = await getAuthToken();
      const response = await fetch(`${BASE_URL}/projects/${project.id}/members/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) throw new Error('Failed to update member');

      setSuccess('メンバーのロールを更新しました');
      const members = await listProjectMembers(project.id, { status: 'active' });
      setProjectMembers(members);
    } catch (err) {
      console.error('Error updating member:', err);
      setError('メンバーの更新に失敗しました');
    }
  };

  const handleUpdateJobType = async (userId: string, newJobType: 職種Type | '') => {
    if (!project?.id) return;

    try {
      const token = await getAuthToken();
      const response = await fetch(`${BASE_URL}/projects/${project.id}/members/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
        body: JSON.stringify({ 職種: newJobType || null }),
      });

      if (!response.ok) throw new Error('Failed to update member');

      setSuccess('メンバーの職種を更新しました');
      const members = await listProjectMembers(project.id, { status: 'active' });
      setProjectMembers(members);
    } catch (err) {
      console.error('Error updating member job type:', err);
      setError('職種の更新に失敗しました');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // デバッグ：保存するデータをログ出力
      console.log('[ProjectEditDialog] 保存データ:', {
        id: formData.id,
        物件名: formData.物件名,
        施工費: formData.施工費,
        施工費タイプ: typeof formData.施工費,
      });
      // Pass formData directly to parent handler
      // Parent will handle mode-based branching and id stripping for create mode
      await onSave(formData as Project);
      onClose();
    } catch (error) {
      console.error('プロジェクトの保存に失敗しました:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 担当者選択時にメールアドレスを自動入力
  useEffect(() => {
    if (!newTaskAssignee) {
      setNewTaskAssigneeEmail('');
      return;
    }
    const member = projectMembers.find((m) => m.displayName === newTaskAssignee);
    if (member) {
      setNewTaskAssigneeEmail(member.email);
    } else {
      const person = people.find((p) => p.氏名 === newTaskAssignee);
      setNewTaskAssigneeEmail(person?.メール ?? '');
    }
  }, [newTaskAssignee, projectMembers, people]);

  // マイルストーン用の日付変更ハンドラ
  const handleMilestoneDateChange = (date: Date | null) => {
    setNewTaskStartDate(date);
    setNewTaskEndDate(date);
  };

  // 通常タスク用の日付範囲変更ハンドラ
  const handleRangeDateChange = (date: Date | null) => {
    if (!date) {
      setNewTaskStartDate(null);
      setNewTaskEndDate(null);
      return;
    }

    // 開始日が未設定、または既に範囲が確定している場合は新しい開始日として設定
    if (!newTaskStartDate || (newTaskStartDate && newTaskEndDate)) {
      setNewTaskStartDate(date);
      setNewTaskEndDate(null);
    } else {
      // 開始日が設定済みで終了日が未設定の場合
      if (newTaskStartDate.getTime() === date.getTime()) {
        // 同じ日をクリック → 単日タスク
        setNewTaskEndDate(date);
      } else if (date < newTaskStartDate) {
        // クリックした日が開始日より前 → 開始日と終了日を入れ替え
        setNewTaskEndDate(newTaskStartDate);
        setNewTaskStartDate(date);
      } else {
        // クリックした日が開始日より後 → 範囲選択
        setNewTaskEndDate(date);
      }

      // マイルストーン解除判定
      if (newTaskStartDate.getTime() !== date.getTime() && newTaskIsMilestone) {
        setNewTaskIsMilestone(false);
      }
    }
  };

  // マイルストーンチェックボックスが有効かどうかを判定
  const isMilestoneCheckboxEnabled = newTaskStartDate && newTaskEndDate && newTaskStartDate.getTime() === newTaskEndDate.getTime();

  const handleCreateTask = async () => {
    if (!newTaskName.trim() || !project?.id || !onTaskCreate) return;

    setTaskCreating(true);
    try {
      await onTaskCreate({
        タスク名: newTaskName,
        担当者: newTaskAssignee || undefined,
        担当者メール: newTaskAssigneeEmail || undefined,
        予定開始日: newTaskStartDate ? format(newTaskStartDate, 'yyyy-MM-dd') : undefined,
        期限: newTaskEndDate ? format(newTaskEndDate, 'yyyy-MM-dd') : undefined,
        ステータス: newTaskStatus,
        優先度: newTaskPriority,
        ['工数見積(h)']: newTaskEstimate,
        マイルストーン: newTaskIsMilestone,
        '通知設定': {
          開始日: newTaskNotifyStart,
          期限前日: newTaskNotifyDayBefore,
          期限当日: newTaskNotifyDue,
          超過: newTaskNotifyOverdue,
        },
        projectId: project.id,
      });

      // フォームをリセット
      setNewTaskName('');
      setNewTaskAssignee('');
      setNewTaskAssigneeEmail('');
      setNewTaskStartDate(null);
      setNewTaskEndDate(null);
      setNewTaskPriority('中');
      setNewTaskStatus('未着手');
      setNewTaskEstimate(4);
      setNewTaskNotifyStart(true);
      setNewTaskNotifyDayBefore(true);
      setNewTaskNotifyDue(true);
      setNewTaskNotifyOverdue(true);
      setNewTaskIsMilestone(false);
      setShowTaskForm(false);
    } catch (error) {
      console.error('タスクの作成に失敗しました:', error);
      alert('タスクの作成に失敗しました');
    } finally {
      setTaskCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!project || !onDelete) return;

    if (!confirm(`プロジェクト「${project.物件名}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    try {
      await onDelete(project);
      onClose();
    } catch (error) {
      console.error('プロジェクトの削除に失敗しました:', error);
      alert('プロジェクトの削除に失敗しました');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {project ? 'プロジェクト編集' : 'プロジェクト作成'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 transition hover:bg-slate-100"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                プロジェクト名 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.物件名}
                onChange={(e) => setFormData({ ...formData, 物件名: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">ステータス</label>
                <select
                  value={formData.ステータス}
                  onChange={(e) => setFormData({ ...formData, ステータス: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">優先度</label>
                <select
                  value={formData.優先度 || '中'}
                  onChange={(e) => setFormData({ ...formData, 優先度: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">受注日</label>
                <input
                  type="date"
                  value={formData.開始日 || ''}
                  onChange={(e) => setFormData({ ...formData, 開始日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">現地調査日</label>
                <input
                  type="date"
                  value={formData.現地調査日 || ''}
                  onChange={(e) => setFormData({ ...formData, 現地調査日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">着工日</label>
                <input
                  type="date"
                  value={formData.着工日 || ''}
                  onChange={(e) => setFormData({ ...formData, 着工日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">竣工予定日</label>
                <input
                  type="date"
                  value={formData.竣工予定日 || ''}
                  onChange={(e) => setFormData({ ...formData, 竣工予定日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">引渡し予定日</label>
                <input
                  type="date"
                  value={formData.引渡し予定日 || ''}
                  onChange={(e) => setFormData({ ...formData, 引渡し予定日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">予定完了日</label>
                <input
                  type="date"
                  value={formData.予定完了日 || ''}
                  onChange={(e) => setFormData({ ...formData, 予定完了日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">施工費（円）</label>
              <input
                type="number"
                value={formData.施工費 ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = value === '' ? undefined : Number(value);
                  if (value === '' || !isNaN(numValue as number)) {
                    setFormData({ ...formData, 施工費: numValue });
                  }
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="例：10000000"
                step="1000"
              />
              {formData.施工費 !== undefined && formData.施工費 !== null && (
                <p className="mt-1 text-xs text-slate-500">
                  ¥{formData.施工費.toLocaleString()}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">クライアント</label>
              <div className="mt-1">
                <ClientSelector
                  value={formData.クライアント || ''}
                  onChange={(value) => {
                    // "__new__"が選択された場合は空文字列に変更
                    if (value === '__new__') {
                      setFormData({ ...formData, クライアント: '' });
                    } else {
                      setFormData({ ...formData, クライアント: value });
                    }
                  }}
                  placeholder="クライアントを選択"
                  className="text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">所在地/現地</label>
                <div className="mt-1">
                  <GoogleMapsAddressInput
                    value={formData['所在地/現地'] || ''}
                    onChange={(value) => {
                      setFormData({
                        ...formData,
                        '所在地/現地': value,
                        '所在地_現地': value,
                      });
                    }}
                    placeholder="住所を入力（例：東京都渋谷区...）"
                    className="text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">フォルダURL</label>
                <div className="mt-1">
                  <GoogleDriveFolderPicker
                    value={formData['フォルダURL'] || ''}
                    onChange={(value) => setFormData({ ...formData, 'フォルダURL': value })}
                    placeholder="Google DriveフォルダのURLまたは直接入力"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">備考</label>
              <textarea
                value={formData.備考 || ''}
                onChange={(e) => setFormData({ ...formData, 備考: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* タスク追加（編集モード時のみ） */}
            {project && project.id && onTaskCreate && (
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">
                    <Plus className="inline h-4 w-4 mr-1" />
                    タスク追加
                  </label>
                  {!showTaskForm && (
                    <button
                      type="button"
                      onClick={() => setShowTaskForm(true)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + 新しいタスク
                    </button>
                  )}
                </div>

                {showTaskForm && (
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white">
                    {/* 担当者 */}
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">担当者</label>
                      {membersLoading ? (
                        <div className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm text-slate-400">
                          メンバー読み込み中...
                        </div>
                      ) : projectMembers.length > 0 ? (
                        <select
                          value={newTaskAssignee}
                          onChange={(e) => setNewTaskAssignee(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">選択</option>
                          {projectMembers.map((member) => (
                            <option key={member.userId} value={member.displayName}>
                              {member.displayName} ({member.role})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={newTaskAssignee}
                          onChange={(e) => setNewTaskAssignee(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">未割り当て</option>
                          {people.map((person) => (
                            <option key={person.id} value={person.氏名}>
                              {person.氏名}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* 通知送信先メール */}
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">通知送信先メール</label>
                      <input
                        type="email"
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                        value={newTaskAssigneeEmail}
                        onChange={(e) => setNewTaskAssigneeEmail(e.target.value)}
                        placeholder="担当者メールアドレス"
                      />
                    </div>

                    {/* タスク名 */}
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">
                        タスク名 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newTaskName}
                        onChange={(e) => setNewTaskName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="タスク名を入力"
                      />
                    </div>

                    {/* マイルストーンチェックボックス */}
                    <div className={`flex items-center gap-2 p-2 rounded-lg border ${
                      isMilestoneCheckboxEnabled
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}>
                      <input
                        type="checkbox"
                        id="new-task-milestone"
                        checked={newTaskIsMilestone}
                        disabled={!isMilestoneCheckboxEnabled}
                        onChange={(e) => {
                          setNewTaskIsMilestone(e.target.checked);
                          if (e.target.checked && newTaskStartDate) {
                            setNewTaskEndDate(newTaskStartDate);
                          }
                        }}
                        className={`w-4 h-4 rounded focus:ring-red-500 flex-shrink-0 ${
                          isMilestoneCheckboxEnabled
                            ? 'text-red-600 cursor-pointer'
                            : 'text-gray-400 cursor-not-allowed'
                        }`}
                      />
                      <label
                        htmlFor="new-task-milestone"
                        className={`text-xs ${
                          isMilestoneCheckboxEnabled
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
                        {newTaskIsMilestone ? '◆ 実施日' : '作業期間'}
                      </label>
                      {newTaskIsMilestone ? (
                        <DatePicker
                          selected={newTaskStartDate}
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
                              ...(newTaskStartDate ? [newTaskStartDate] : []),
                              ...(newTaskStartDate && newTaskEndDate ?
                                Array.from({ length: Math.ceil((newTaskEndDate.getTime() - newTaskStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 }, (_, i) => {
                                  const d = new Date(newTaskStartDate);
                                  d.setDate(newTaskStartDate.getDate() + i);
                                  return d;
                                }) : []
                              )
                            ]}
                            inline
                            locale="ja"
                            className="w-full"
                          />
                          <div className="mt-2 text-xs text-slate-600 text-center bg-blue-50 rounded-lg py-2 px-3">
                            {!newTaskStartDate && '📅 開始日を選択してください'}
                            {newTaskStartDate && !newTaskEndDate && '📅 終了日を選択してください（同じ日をもう一度クリックで単日タスク）'}
                            {newTaskStartDate && newTaskEndDate && (
                              <span className="font-semibold text-blue-600">
                                {newTaskStartDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })} 〜 {newTaskEndDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                                {newTaskStartDate.getTime() === newTaskEndDate.getTime() && ' (単日)'}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 優先度とステータス */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">優先度</label>
                        <select
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                          value={newTaskPriority}
                          onChange={(e) => setNewTaskPriority(e.target.value)}
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
                          value={newTaskStatus}
                          onChange={(e) => setNewTaskStatus(e.target.value)}
                        >
                          <option value="未着手">未着手</option>
                          <option value="進行中">進行中</option>
                          <option value="確認待ち">確認待ち</option>
                          <option value="保留">保留</option>
                          <option value="完了">完了</option>
                        </select>
                      </div>
                    </div>

                    {/* 工数見積 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">工数見積(h)</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                          value={newTaskEstimate}
                          onChange={(e) => setNewTaskEstimate(Number(e.target.value || 0))}
                        />
                      </div>
                    </div>

                    {/* メール通知 */}
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-500">メール通知</p>
                      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={newTaskNotifyStart} onChange={(e) => setNewTaskNotifyStart(e.target.checked)} className="w-3.5 h-3.5" />
                          <span>開始日</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={newTaskNotifyDayBefore} onChange={(e) => setNewTaskNotifyDayBefore(e.target.checked)} className="w-3.5 h-3.5" />
                          <span>期限前日</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={newTaskNotifyDue} onChange={(e) => setNewTaskNotifyDue(e.target.checked)} className="w-3.5 h-3.5" />
                          <span>期限当日</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={newTaskNotifyOverdue} onChange={(e) => setNewTaskNotifyOverdue(e.target.checked)} className="w-3.5 h-3.5" />
                          <span>期限超過</span>
                        </label>
                      </div>
                    </div>

                    {/* ボタン */}
                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowTaskForm(false);
                          setNewTaskName('');
                          setNewTaskAssignee('');
                          setNewTaskAssigneeEmail('');
                          setNewTaskStartDate(null);
                          setNewTaskEndDate(null);
                          setNewTaskPriority('中');
                          setNewTaskStatus('未着手');
                          setNewTaskEstimate(4);
                          setNewTaskNotifyStart(true);
                          setNewTaskNotifyDayBefore(true);
                          setNewTaskNotifyDue(true);
                          setNewTaskNotifyOverdue(true);
                          setNewTaskIsMilestone(false);
                        }}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-2xl hover:bg-slate-50 transition-colors"
                        disabled={taskCreating}
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateTask}
                        disabled={!newTaskName.trim() || taskCreating}
                        className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-2xl hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {taskCreating ? '作成中...' : '保存'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* プロジェクトメンバー管理（編集モード時のみ） */}
            {project && project.id && (
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">
                    <Users className="inline h-4 w-4 mr-1" />
                    プロジェクトメンバー
                  </label>
                  {!showInviteForm && (
                    <button
                      type="button"
                      onClick={() => setShowInviteForm(true)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      メンバー追加
                    </button>
                  )}
                </div>

                {/* エラー・成功メッセージ */}
                {error && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {success && (
                  <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-green-800">{success}</p>
                    </div>
                    <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* 招待フォーム */}
                {showInviteForm && (
                  <form onSubmit={handleInvite} className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900">メンバーを追加/招待</h4>

                    {/* 社内メンバー選択 */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-700">社内メンバーから選択</label>
                        <button
                          type="button"
                          onClick={() => loadManageableUsers(true)}
                          disabled={manageableLoading}
                          className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          再読み込み
                        </button>
                      </div>
                      {manageableError ? (
                        <p className="text-xs text-red-600">{manageableError}</p>
                      ) : manageableLoading ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                          <span>読み込み中...</span>
                        </div>
                      ) : manageableUsers.length > 0 ? (
                        <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-32 overflow-y-auto bg-white">
                          {manageableUsers.map(user => {
                            const isSelected = selectedCandidateId === user.id;
                            return (
                              <button
                                key={user.id}
                                type="button"
                                onClick={() => handleCandidateSelect(user)}
                                className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50'}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="truncate">
                                    <p className="font-medium text-gray-900 truncate">{user.displayName}</p>
                                    <p className="text-gray-500 truncate">{user.email}</p>
                                  </div>
                                  {isSelected && <span className="text-blue-600 font-semibold">選択中</span>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">候補なし</p>
                      )}
                    </div>

                    {/* メールアドレス */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">メールアドレス *</label>
                      <div className="relative">
                        <Mail className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => {
                            setInviteEmail(e.target.value);
                            if (selectedCandidateId && !manageableUsers.find(u => u.id === selectedCandidateId && u.email === e.target.value)) {
                              setSelectedCandidateId('');
                            }
                          }}
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="user@example.com"
                          required
                        />
                      </div>
                    </div>

                    {/* ロールと職種 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">ロール *</label>
                        <div className="relative">
                          <Shield className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as ProjectRole)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            {Object.entries(PROJECT_ROLE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">職種</label>
                        <div className="relative">
                          <Briefcase className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <select
                            value={inviteJob}
                            onChange={(e) => setInviteJob(e.target.value as 職種Type | '')}
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            {JOB_TYPE_OPTIONS.map((job) => (
                              <option key={job || 'none'} value={job}>{job || '未設定'}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* メッセージ */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">メッセージ（任意）</label>
                      <textarea
                        value={inviteMessage}
                        onChange={(e) => setInviteMessage(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={2}
                        placeholder="メッセージを入力..."
                      />
                    </div>

                    {/* ボタン */}
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setShowInviteForm(false);
                          setInviteEmail('');
                          setInviteRole('member');
                          setInviteJob('');
                          setInviteMessage('');
                          setSelectedCandidateId('');
                        }}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        disabled={submitting}
                      >
                        キャンセル
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? '処理中...' : '追加/招待'}
                      </button>
                    </div>
                  </form>
                )}

                {/* メンバー一覧 */}
                {membersLoading ? (
                  <div className="text-sm text-slate-400 text-center py-4">読み込み中...</div>
                ) : projectMembers.length > 0 ? (
                  <div className="space-y-2">
                    {projectMembers.map((member) => (
                      <div
                        key={member.userId}
                        className="p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-medium flex-shrink-0">
                              {member.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm text-slate-700 truncate">{member.displayName}</div>
                              <div className="text-xs text-slate-500 truncate">{member.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="flex flex-col gap-1">
                              <select
                                value={member.role}
                                onChange={(e) => handleUpdateRole(member.userId, e.target.value as ProjectRole)}
                                className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                disabled={member.role === 'owner'}
                              >
                                {Object.entries(PROJECT_ROLE_LABELS).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                              <select
                                value={member.職種 || ''}
                                onChange={(e) => handleUpdateJobType(member.userId, e.target.value as 職種Type | '')}
                                className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              >
                                {JOB_TYPE_OPTIONS.map((job) => (
                                  <option key={job || 'none'} value={job}>{job || '未設定'}</option>
                                ))}
                              </select>
                            </div>
                            {member.role !== 'owner' && (
                              <button
                                onClick={() => handleRemoveMember(member.userId)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="メンバーを削除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 text-center py-4 border border-slate-200 rounded-lg">
                    メンバーがいません
                  </div>
                )}
              </div>
            )}

            {/* アクティビティログ表示（編集モード時のみ） */}
            {project && project.id && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <History className="inline h-4 w-4 mr-1" />
                  編集履歴
                </label>
                {logsLoading ? (
                  <div className="text-sm text-slate-400 text-center py-4">
                    読み込み中...
                  </div>
                ) : activityLogs.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      {activityLogs.map((log) => (
                        <div
                          key={log.id}
                          className="px-3 py-2 text-sm border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-slate-700">{log.userName}</span>
                                <span className="text-slate-500">が</span>
                                <span className="font-medium text-blue-600">{log.action}</span>
                              </div>
                              {log.changes && Object.keys(log.changes).length > 0 && (
                                <div className="mt-1 pl-2 border-l-2 border-slate-200">
                                  {Object.entries(log.changes).map(([field, change]) => (
                                    <div key={field} className="text-xs text-slate-600 mb-0.5">
                                      <span className="font-medium">{field}:</span>{' '}
                                      <span className="line-through text-slate-400">{JSON.stringify(change.before)}</span>
                                      {' → '}
                                      <span className="text-green-600">{JSON.stringify(change.after)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 ml-2 whitespace-nowrap">
                              {(() => {
                                try {
                                  const date = log.createdAt && typeof log.createdAt === 'object' && '_seconds' in log.createdAt
                                    ? new Date((log.createdAt as any)._seconds * 1000)
                                    : new Date(log.createdAt);
                                  return format(date, 'yyyy/MM/dd HH:mm');
                                } catch (e) {
                                  return '-';
                                }
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 text-center py-4 border border-slate-200 rounded-lg">
                    編集履歴がありません
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 border-t border-slate-200 px-6 py-4 flex justify-between gap-3">
            {project?.id && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 flex items-center gap-2"
                disabled={saving}
              >
                <Trash2 className="h-4 w-4" />
                削除
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                disabled={saving}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
