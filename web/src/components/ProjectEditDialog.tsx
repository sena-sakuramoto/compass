import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import DatePicker, { registerLocale } from 'react-datepicker';
import toast from 'react-hot-toast';
import { X, Users, History, Plus, Trash2, UserPlus, Mail, Shield, Briefcase, AlertCircle, Check } from 'lucide-react';
import type { Project, Task, ManageableUserSummary, Stage } from '../lib/types';
import type { ProjectMember, ProjectMemberInput, ProjectRole, JobTitleType, ProjectPermissions } from '../lib/auth-types';
import { listProjectMembers, addProjectMember, listActivityLogs, type ActivityLog, buildAuthHeaders, listManageableProjectUsers, listCollaborators, type Collaborator, listStages, createStage, updateStage, deleteStage, updateProject, listUsers, getCurrentUser } from '../lib/api';
import { PROJECT_ROLE_LABELS, ROLE_LABELS } from '../lib/auth-types';
import { GoogleMapsAddressInput } from './GoogleMapsAddressInput';
import { GoogleDriveFolderPicker } from './GoogleDriveFolderPicker';
import { ClientSelector } from './ClientSelector';
import { useJapaneseHolidaySet, isJapaneseHoliday } from '../lib/japaneseHolidays';
import { formatDate, formatJapaneseEra } from '../lib/date';
import { resolveApiBase } from '../lib/apiBase';
import { usePendingOverlay } from '../state/pendingOverlay';
import { calculateProjectStatus, getStatusColor } from '../lib/projectStatus';

// 日本語ロケールを登録
registerLocale('ja', ja);

interface ProjectEditDialogProps {
  project: Project | null;
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSave: (project: Project) => Promise<string | undefined>;
  onSaveLocal?: (project: Project) => void;
  onRollback?: (projectId: string, prevProject: Project) => void;
  onDelete?: (project: Project) => Promise<void>;
  onOpenTaskModal?: (defaults?: { projectId?: string; stageId?: string }) => void;
  projectMembers?: ProjectMember[];
  stages?: Task[];
  onStagesChanged?: () => void | Promise<void>;
}

// 手動で設定するステータス（自動計算をオーバーライドする特別なケース）
const MANUAL_STATUS_OPTIONS = [
  '', // 自動計算を使用
  '保留',
  '失注',
];
const PRIORITY_OPTIONS = ['高', '中', '低'];
const DEFAULT_MEMBER_PERMISSIONS: ProjectPermissions = {
  canEditProject: false,
  canDeleteProject: false,
  canManageMembers: false,
  canViewTasks: false,
  canCreateTasks: false,
  canEditTasks: false,
  canDeleteTasks: false,
  canViewFiles: false,
  canUploadFiles: false,
};

// 職種の選択肢
const JOB_TYPE_OPTIONS: (JobTitleType | '')[] = [
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

const BASE_URL = resolveApiBase();

export function ProjectEditDialog({ project, mode = 'edit', onClose, onSave, onSaveLocal, onRollback, onDelete, onOpenTaskModal, projectMembers: propsProjectMembers = [], stages: propsStages = [], onStagesChanged }: ProjectEditDialogProps) {
  const [formData, setFormData] = useState<Partial<Project>>({
    id: '',
    物件名: '',
    クライアント: '',
    ステータス: '未着手',
    優先度: '中',
    開始日: '',
    現地調査日: '',
    レイアウト確定日: '',
    基本設計完了日: '',
    設計施工現調日: '',
    見積確定日: '',
    着工日: '',
    中間検査日: '',
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
  const { addPendingProject, ackPendingProject, rollbackPendingProject } = usePendingOverlay();
  const [currentUserOrgId, setCurrentUserOrgId] = useState<string | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // メンバー管理用の状態
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('member');
  const [inviteJob, setInviteJob] = useState<JobTitleType | ''>('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [manageableUsers, setManageableUsers] = useState<ManageableUserSummary[]>([]);
  const [manageableLoading, setManageableLoading] = useState(false);
  const [manageableLoaded, setManageableLoaded] = useState(false);
  const [manageableError, setManageableError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [collaboratorsLoaded, setCollaboratorsLoaded] = useState(false);
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState('');
  const [inputMode, setInputMode] = useState<'email' | 'text'>('email');
  const [inviteName, setInviteName] = useState('');

  // 工程管理用の状態
  const [stages, setStages] = useState<Task[]>([]);
  const [hasLocalStageChanges, setHasLocalStageChanges] = useState(false); // 楽観的更新中フラグ
  const [showStageForm, setShowStageForm] = useState(false);
  const [editingStage, setEditingStage] = useState<Task | null>(null);
  const [stageName, setStageName] = useState('');
  const [stageStartDate, setStageStartDate] = useState('');
const [stageEndDate, setStageEndDate] = useState('');
const [stageSaving, setStageSaving] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
const [logsLoadedProjectId, setLogsLoadedProjectId] = useState<string | null>(null);

  // プロジェクト作成時の初期メンバー管理
  interface InitialMember {
    userId: string;
    displayName: string;
    email: string;
    role: ProjectRole;
    jobTitle: JobTitleType | '';
  }
  const [initialMembers, setInitialMembers] = useState<InitialMember[]>([]);
  const [showInitialMembersSection, setShowInitialMembersSection] = useState(false);

  const holidaySet = useJapaneseHolidaySet();
  const broadcastMemberUpdate = useCallback((projectId: string, members: ProjectMember[]) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('project-members:updated', { detail: { projectId, members } }));
  }, []);

  // プロジェクトIDが変わった時に初期化フラグをリセット
  const isInitialMount = useRef(true);
  const prevProjectId = useRef<string | undefined>(undefined);
  const lastAppliedProjectId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const currentProjectId = project?.id;
    if (currentProjectId !== prevProjectId.current) {
      isInitialMount.current = true;
      prevProjectId.current = currentProjectId;
    }
  }, [project?.id]);

  // 現在のユーザーの組織IDを取得
  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        setCurrentUserOrgId(user.orgId);
      })
      .catch((err) => {
        console.error('Failed to get current user:', err);
      });
  }, []);

  useEffect(() => {
    if (project) {
      // 新規作成モードの場合、初回のみformDataを設定（入力中のリセットを防ぐ）
      if (!project.id && mode === 'create') {
        if (isInitialMount.current) {
          setFormData((prev) => ({
            ...prev,
            ...project,
          }));
          isInitialMount.current = false;
        }
        return;
      }

      // 編集モードはプロジェクトIDが変わった時だけ反映（入力中の巻き戻り防止）
      if (project.id && project.id !== lastAppliedProjectId.current) {
        setFormData(project);
        lastAppliedProjectId.current = project.id;
      }
    } else {
      lastAppliedProjectId.current = undefined;
      setFormData({
        id: '',
        物件名: '',
        クライアント: '',
        ステータス: '未着手',
        優先度: '中',
        開始日: '',
        現地調査日: '',
        レイアウト確定日: '',
        基本設計完了日: '',
        設計施工現調日: '',
        見積確定日: '',
        着工日: '',
        中間検査日: '',
        竣工予定日: '',
        引渡し予定日: '',
        '所在地/現地': '',
        '所在地_現地': '',
        'フォルダURL': '',
        備考: '',
        施工費: undefined,
      });
      setProjectMembers([]);
      setActivityLogs([]);
      setStages([]);
    }
  }, [project, mode]);

  useEffect(() => {
    if (!project) return;
    setProjectMembers(propsProjectMembers);
    if (!hasLocalStageChanges) {
      setStages(propsStages);
    }
  }, [project?.id, propsProjectMembers, propsStages, hasLocalStageChanges]);

  const projectId = project?.id;

  const renderDateMeta = (value?: string | null) => {
    if (!value) return null;
    const iso = formatDate(value);
    if (!iso) return null;
    const holiday = isJapaneseHoliday(iso, holidaySet);
    const japaneseEra = formatJapaneseEra(value);
    if (!holiday && !japaneseEra) return null;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        {holiday && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
            祝日
          </span>
        )}
        {japaneseEra && <span className="text-slate-500">和暦 {japaneseEra}</span>}
      </div>
    );
  };

  useEffect(() => {
    setActivityLogs([]);
    setLogsExpanded(false);
    setLogsLoadedProjectId(null);
    setLogsLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !logsExpanded) return;
    if (logsLoadedProjectId === projectId) {
      return;
    }

    let cancelled = false;
    setLogsLoading(true);

    listActivityLogs({ projectId, limit: 20 })
      .then((logsData) => {
        if (!cancelled) {
          setActivityLogs(logsData.logs);
          setLogsLoadedProjectId(projectId);
        }
      })
      .catch(error => {
        console.error('Failed to load activity logs:', error);
        if (!cancelled) {
          setActivityLogs([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLogsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, logsExpanded, logsLoadedProjectId]);

  // プロジェクト作成モードで初期メンバーセクションが開かれた時に自組織のユーザーを取得
  useEffect(() => {
    if (mode !== 'create' || !showInitialMembersSection || manageableLoaded) return;

    let cancelled = false;
    setManageableLoading(true);
    setManageableError(null);

    // 現在のユーザー情報を取得して、その組織のユーザーのみを取得
    getCurrentUser()
      .then((currentUser) => {
        if (cancelled) return Promise.reject(new Error('Cancelled'));
        if (!currentUser.orgId) {
          throw new Error('組織IDが見つかりません');
        }
        return listUsers({ isActive: true, orgId: currentUser.orgId });
      })
      .then((users) => {
        if (!cancelled && users) {
          // User型をManageableUserSummary型に変換
          const manageableSummaries: ManageableUserSummary[] = users.map(user => ({
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            isActive: user.isActive,
            memberType: 'internal' as const,
          }));
          setManageableUsers(manageableSummaries);
          setManageableLoaded(true);
        }
      })
      .catch((error) => {
        console.error('Failed to load users:', error);
        if (!cancelled) {
          setManageableError('ユーザーの取得に失敗しました');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setManageableLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, showInitialMembersSection, manageableLoaded]);

  // 招待フォームが開かれたときに候補ユーザーと協力者をロード
  useEffect(() => {
    if (showInviteForm && project?.id) {
      loadManageableUsers().catch(() => {
        /* errors handled inside */
      });
      loadCollaborators().catch(() => {
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

const loadCollaborators = async (force = false): Promise<void> => {
  if (collaboratorsLoading) return;
  if (!force && collaboratorsLoaded) return;

    try {
      setCollaboratorsLoading(true);
      console.log('[ProjectEditDialog] Loading collaborators...');
      const data = await listCollaborators();
      console.log('[ProjectEditDialog] Collaborators loaded:', data);
      setCollaborators(data.collaborators || []);
      setCollaboratorsLoaded(true);

      if (selectedCollaboratorId && !data.collaborators.some(c => c.id === selectedCollaboratorId)) {
        setSelectedCollaboratorId('');
      }
    } catch (err) {
      console.error('[ProjectEditDialog] Error loading collaborators:', err);
      setCollaborators([]);
      setCollaboratorsLoaded(true);
    } finally {
      setCollaboratorsLoading(false);
    }
  };

  const resetInviteForm = () => {
    setInviteEmail('');
    setInviteName('');
    setInviteRole('member');
    setInviteJob('');
    setInviteMessage('');
    setSelectedCandidateId('');
    setSelectedCollaboratorId('');
    setInputMode('email');
    setShowInviteForm(false);
  };

  const buildMemberInputFromState = (mode: 'any' | 'textOnly' = 'any'): ProjectMemberInput | null => {
    const trimmedName = inviteName.trim();
    const trimmedEmail = inviteEmail.trim().toLowerCase();
    const trimmedMessage = inviteMessage.trim();
    const includeEmailInputs = mode === 'any';

    const commonFields = {
      role: inviteRole,
      jobTitle: inviteJob || undefined,
      message: trimmedMessage ? trimmedMessage : undefined,
    };

    if (mode === 'textOnly' && inputMode !== 'text') {
      return null;
    }

    if (selectedCandidateId && includeEmailInputs) {
      const candidate = manageableUsers.find((user) => user.id === selectedCandidateId);
      const candidateEmail = candidate?.email?.trim().toLowerCase();
      if (candidateEmail) {
        return {
          ...commonFields,
          email: candidateEmail,
        };
      }
    }

    if (selectedCollaboratorId) {
      const collaborator = collaborators.find((collab) => collab.id === selectedCollaboratorId);
      if (collaborator) {
        const collaboratorEmail = collaborator.email?.trim().toLowerCase();
        const collaboratorName = collaborator.name?.trim();
        if (collaboratorEmail && includeEmailInputs) {
          return {
            ...commonFields,
            email: collaboratorEmail,
          };
        }
        if (collaboratorName) {
          return {
            ...commonFields,
            displayName: collaboratorName,
          };
        }
      }
    }

    if (includeEmailInputs && inputMode === 'email' && trimmedEmail) {
      return {
        ...commonFields,
        email: trimmedEmail,
      };
    }

    if (inputMode === 'text' && trimmedName) {
      return {
        ...commonFields,
        displayName: trimmedName,
      };
    }

    return null;
  };

  const submitMemberInvite = async (projectId: string, input: ProjectMemberInput) => {
    const token = await getAuthToken();
    const response = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(token),
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      let message = 'メンバーの追加に失敗しました';
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch {
        try {
          const text = await response.text();
          if (text) message = text;
        } catch {
          // ignore
        }
      }
      throw new Error(message);
    }

    const members = await listProjectMembers(projectId);
    setProjectMembers(members);
    broadcastMemberUpdate(projectId, members);
    await Promise.all([loadManageableUsers(true), loadCollaborators(true)]);
  };

  const tryAddPendingTextCollaborator = async (projectId: string) => {
    if (!showInviteForm) return;
    const memberInput = buildMemberInputFromState('textOnly');
    if (!memberInput) return;

    try {
      await submitMemberInvite(projectId, memberInput);
      toast.success('協力者をメンバーとして追加しました');
      resetInviteForm();
    } catch (error) {
      console.error('[ProjectEditDialog] Failed to auto-add collaborator:', error);
      toast.error(error instanceof Error ? error.message : '協力者の追加に失敗しました');
    }
  };

  const handleCandidateSelect = (candidate: ManageableUserSummary) => {
    if (selectedCandidateId === candidate.id) {
      setSelectedCandidateId('');
    } else {
      setSelectedCandidateId(candidate.id);
      setInviteEmail(candidate.email?.trim() || '');
      setInviteName('');
      setInputMode('email');
      setSelectedCollaboratorId('');
    }
  };

  const handleCollaboratorSelect = (collaborator: Collaborator) => {
    if (selectedCollaboratorId === collaborator.id) {
      setSelectedCollaboratorId('');
    } else {
      setSelectedCollaboratorId(collaborator.id);
      const trimmedEmail = collaborator.email?.trim();
      const trimmedName = collaborator.name?.trim() || '';
      if (trimmedEmail) {
        setInviteEmail(trimmedEmail);
        setInviteName('');
        setInputMode('email');
      } else {
        setInviteEmail('');
        setInviteName(trimmedName);
        setInputMode('text');
      }
      setSelectedCandidateId('');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!project?.id) {
      setError('プロジェクトを保存してからメンバーを追加してください');
      return;
    }

    setError(null);
    const memberInput = buildMemberInputFromState('any');
    if (!memberInput) {
      setError('追加するメンバー情報を入力してください');
      return;
    }

    const previousMembers = projectMembers;
    let optimisticApplied = false;

    try {
      setSubmitting(true);
      const nowIso = new Date().toISOString();
      const tempUserId = `temp-${Date.now()}`;
      const optimisticMember: ProjectMember = {
        id: `${project.id}_${tempUserId}`,
        projectId: project.id,
        userId: tempUserId,
        email: memberInput.email ?? '',
        displayName: memberInput.displayName ?? memberInput.email ?? '招待中',
        orgId: currentUserOrgId ?? '',
        orgName: '',
        role: memberInput.role,
        jobTitle: memberInput.jobTitle || undefined,
        permissions: DEFAULT_MEMBER_PERMISSIONS,
        invitedBy: '',
        invitedAt: nowIso,
        status: 'invited',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const optimisticMembers = [...previousMembers, optimisticMember];
      optimisticApplied = true;
      setProjectMembers(optimisticMembers);
      broadcastMemberUpdate(project.id, optimisticMembers);

      await submitMemberInvite(project.id, memberInput);
      const successMessage = memberInput.displayName && !memberInput.email
        ? '協力者をメンバーとして追加しました'
        : 'メンバーを追加しました';
      toast.success(successMessage);
      setSuccess('メンバーを追加しました');
      resetInviteForm();
    } catch (err: any) {
      console.error('Error inviting member:', err);
      if (optimisticApplied && project?.id) {
        setProjectMembers(previousMembers);
        broadcastMemberUpdate(project.id, previousMembers);
      }
      setError(err instanceof Error ? err.message : 'メンバーの追加に失敗しました');
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
        const members = await listProjectMembers(project.id);
        setProjectMembers(members);
        broadcastMemberUpdate(project.id, members);
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

    // 楽観的更新: 先にUIを更新
    const previousMembers = [...projectMembers];
    const optimisticMembers = projectMembers.map(m =>
      m.userId === userId ? { ...m, role: newRole } : m
    );
    setProjectMembers(optimisticMembers);
    broadcastMemberUpdate(project.id, optimisticMembers);

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

      // APIから最新のメンバー情報を取得して確認
      const members = await listProjectMembers(project.id);
      // 外部組織のメンバーを除外
      const filteredMembers = currentUserOrgId
        ? members.filter(m => m.orgId === currentUserOrgId || m.memberType === 'external')
        : members;
      setProjectMembers(filteredMembers);
      broadcastMemberUpdate(project.id, filteredMembers);
    } catch (err) {
      // 失敗したら楽観的更新を取り消し
      console.error('Error updating member:', err);
      setProjectMembers(previousMembers);
      broadcastMemberUpdate(project.id, previousMembers);
      setError('メンバーの更新に失敗しました');
    }
  };

  const handleUpdateJobType = async (userId: string, newJobType: JobTitleType | '') => {
    if (!project?.id) return;

    // 楽観的更新: 先にUIを更新
    const previousMembers = [...projectMembers];
    const optimisticMembers = projectMembers.map(m =>
      m.userId === userId ? { ...m, jobTitle: newJobType || undefined } : m
    );
    setProjectMembers(optimisticMembers);
    broadcastMemberUpdate(project.id, optimisticMembers);

    try {
      const token = await getAuthToken();
      const response = await fetch(`${BASE_URL}/projects/${project.id}/members/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
        body: JSON.stringify({ jobTitle: newJobType || null }),
      });

      if (!response.ok) throw new Error('Failed to update member');

      // APIから最新のメンバー情報を取得して確認
      const members = await listProjectMembers(project.id);
      // 外部組織のメンバーを除外
      const filteredMembers = currentUserOrgId
        ? members.filter(m => m.orgId === currentUserOrgId || m.memberType === 'external')
        : members;
      setProjectMembers(filteredMembers);
      broadcastMemberUpdate(project.id, filteredMembers);
    } catch (err) {
      // 失敗したら楽観的更新を取り消し
      console.error('Error updating member job type:', err);
      setProjectMembers(previousMembers);
      broadcastMemberUpdate(project.id, previousMembers);
      setError('職種の更新に失敗しました');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const updatedProject = formData as Project;
    const prevProject = project; // 元のプロジェクトを保存（ロールバック用）
    let opId: string | null = null; // pendingOverlay用のオペレーションID

    try {
      // 楽観的更新: 先にローカルstateを更新
      if (onSaveLocal && project?.id) {
        // pendingOverlayに変更を登録（サーバーリロードで上書きされないように保護）
        opId = addPendingProject(project.id, updatedProject);
        onSaveLocal(updatedProject);
      }

      const effectiveProjectId = project?.id || formData.id;
      if (effectiveProjectId) {
        await tryAddPendingTextCollaborator(effectiveProjectId);
      }

      // ダイアログを閉じる
      onClose();

      // APIを呼び出し
      if (project?.id) {
        // 編集モード: 楽観的更新パターン
        try {
          await updateProject(project.id, updatedProject);
          // API成功: pendingはすぐに解除せず、Firestoreの伝播を待つために遅延させる
          // これにより、スナップショットリロードで古いデータに上書きされるのを防ぐ
          if (opId) {
            const projectId = project.id;
            const currentOpId = opId;
            setTimeout(() => {
              ackPendingProject(projectId, currentOpId);
            }, 5000); // 5秒後に解除
          }
          toast.success('プロジェクトを保存しました');
        } catch (apiError) {
          console.error('[ProjectEditDialog] API保存エラー:', apiError);
          toast.error('プロジェクトの保存に失敗しました');
          // ロールバック: pendingを解除して元に戻す
          if (project?.id) {
            rollbackPendingProject(project.id);
          }
          if (onRollback && prevProject) {
            onRollback(project.id, prevProject);
          }
          return;
        }
      } else {
        // 新規作成モード: 従来通りの処理
        const createdProjectId = await onSave(updatedProject);
        toast.success('プロジェクトを作成しました');

        // 初期メンバー一括追加
        if (createdProjectId && initialMembers.length > 0) {
          console.log('[ProjectEditDialog] Adding initial members:', initialMembers.length);
          try {
            const memberPromises = initialMembers.map((member) =>
              addProjectMember(createdProjectId, {
                userId: member.userId,
                email: member.email,
                displayName: member.displayName,
                role: member.role,
                jobTitle: member.jobTitle || undefined,
              })
            );
            await Promise.all(memberPromises);
            console.log('[ProjectEditDialog] Successfully added', initialMembers.length, 'members');
            toast.success(`${initialMembers.length}名のメンバーを追加しました`);
          } catch (memberError) {
            console.error('[ProjectEditDialog] Failed to add members:', memberError);
            toast.error('メンバーの追加に失敗しました');
          }
        }
      }

    } catch (error) {
      console.error('プロジェクトの保存に失敗しました:', error);
      toast.error('保存に失敗しました');
    } finally {
      setSaving(false);
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

  // 工程管理のハンドラ
  const handleStageCreate = () => {
    setEditingStage(null);
    setStageName('');
    setStageStartDate('');
    setStageEndDate('');
    setShowStageForm(true);
  };

  const handleStageEdit = (stage: Task) => {
    setEditingStage(stage);
    setStageName(stage.タスク名);
    setStageStartDate(stage.予定開始日 || '');
    setStageEndDate(stage.期限 || '');
    setShowStageForm(true);
  };

  const handleStageSave = async () => {
    if (!project?.id || !stageName.trim()) return;

    const stageData = {
      タスク名: stageName.trim(),
      予定開始日: stageStartDate || null,
      期限: stageEndDate || null,
    };

    try {
      setStageSaving(true);
      setError(null);

      setHasLocalStageChanges(true); // 楽観的更新フラグを立てる

      if (editingStage) {
        // 楽観的更新：先にUIを更新
        setStages(stages.map(s =>
          s.id === editingStage.id
            ? { ...s, ...stageData, 予定開始日: stageData.予定開始日 || undefined, 期限: stageData.期限 || undefined }
            : s
        ));

        // バックグラウンドで保存
        updateStage(editingStage.id, stageData)
          .then(() => {
            // 保存成功後、App.tsxのtasksを更新してpropsStagesと同期
            return onStagesChanged?.();
          })
          .then(() => {
            // 同期完了後、フラグを下ろす
            setHasLocalStageChanges(false);
          })
          .catch(err => {
            console.error('Failed to update stage:', err);
            setError(err.message || '工程の更新に失敗しました');
            setHasLocalStageChanges(false);
          });
      } else {
        // 新規作成は一時IDでUIに即座に追加
        const tempId = `temp-stage-${Date.now()}`;
        const newStage: any = {
          id: tempId,
          projectId: project.id,
          type: 'stage',
          ...stageData,
        };
        console.log('[ProjectEditDialog] Creating new stage with temp data:', newStage);
        setStages([...stages, newStage]);

        // バックグラウンドで保存し、実際のIDで置き換え
        createStage(project.id, stageData)
          .then(response => {
            console.log('[ProjectEditDialog] Stage created successfully, response:', response);
            const newId = response.id;
            setStages(prev => prev.map(s =>
              s.id === tempId ? { ...s, id: String(newId) } : s
            ));
            // 保存成功後、App.tsxのtasksを更新してpropsStagesと同期
            console.log('[ProjectEditDialog] Calling onStagesChanged to reload tasks...');
            return onStagesChanged?.();
          })
          .then(() => {
            // 同期完了後、フラグを下ろす
            console.log('[ProjectEditDialog] Tasks reloaded, setting hasLocalStageChanges to false');
            setHasLocalStageChanges(false);
          })
          .catch(err => {
            console.error('Failed to create stage:', err);
            setError(err.message || '工程の追加に失敗しました');
            // エラー時は一時工程を削除
            setStages(prev => prev.filter(s => s.id !== tempId));
            setHasLocalStageChanges(false);
          });
      }

      setShowStageForm(false);
      setStageName('');
      setStageStartDate('');
      setStageEndDate('');
      setEditingStage(null);
      setSuccess(editingStage ? '工程を更新しました' : '工程を追加しました');
    } catch (err: any) {
      console.error('Failed to save stage:', err);
      setError(err.message || '工程の保存に失敗しました');
    } finally {
      setStageSaving(false);
    }
  };

  const handleStageDelete = async (stageId: string) => {
    if (!confirm('この工程を削除しますか？\n配下のタスクは未割り当てに戻ります。')) return;

    try {
      setError(null);
      setHasLocalStageChanges(true); // 楽観的更新フラグを立てる

      // 楽観的更新：先にUIから削除
      const deletedStage = stages.find(s => s.id === stageId);
      setStages(stages.filter(s => s.id !== stageId));

      // バックグラウンドで削除
      deleteStage(stageId)
        .then(() => {
          // App.tsx の tasks を更新（バックグラウンド）
          return onStagesChanged?.();
        })
        .then(() => {
          // 同期完了後、フラグを下ろす
          setHasLocalStageChanges(false);
        })
        .catch(err => {
          console.error('Failed to delete stage:', err);
          setError('工程の削除に失敗しました');
          // エラー時は元に戻す
          if (deletedStage) {
            setStages(prev => [...prev, deletedStage]);
          }
          setHasLocalStageChanges(false);
        });

      setSuccess('工程を削除しました');
    } catch (err: any) {
      console.error('Failed to delete stage:', err);
      setError('工程の削除に失敗しました');
      setHasLocalStageChanges(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 lg:p-4">
      <div className="w-full h-full lg:h-auto lg:max-w-2xl lg:max-h-[90vh] lg:rounded-2xl bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {project ? 'プロジェクト編集' : 'プロジェクト作成'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition hover:bg-slate-100"
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
                {/* 自動計算されたステータスを表示 */}
                <div className="mt-1 flex items-center gap-2">
                  <span className={`px-3 py-2 rounded-lg text-sm font-medium ${getStatusColor(calculateProjectStatus(formData as Project))}`}>
                    {calculateProjectStatus(formData as Project)}
                  </span>
                  <span className="text-xs text-slate-500">（マイルストーンから自動計算）</span>
                </div>
                {/* 手動オーバーライド用 */}
                <select
                  value={formData.ステータス === '保留' || formData.ステータス === '失注' ? formData.ステータス : ''}
                  onChange={(e) => setFormData({ ...formData, ステータス: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {MANUAL_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status || '自動（マイルストーンから計算）'}
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
                {renderDateMeta(formData.開始日)}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">現地調査日</label>
                <input
                  type="date"
                  value={formData.現地調査日 || ''}
                  onChange={(e) => setFormData({ ...formData, 現地調査日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {renderDateMeta(formData.現地調査日)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">レイアウト確定日</label>
                <input
                  type="date"
                  value={formData.レイアウト確定日 || ''}
                  onChange={(e) => setFormData({ ...formData, レイアウト確定日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {renderDateMeta(formData.レイアウト確定日)}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">基本設計完了日</label>
                <input
                  type="date"
                  value={formData.基本設計完了日 || ''}
                  onChange={(e) => setFormData({ ...formData, 基本設計完了日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {renderDateMeta(formData.基本設計完了日)}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">設計施工現調日</label>
                <input
                  type="date"
                  value={formData.設計施工現調日 || ''}
                  onChange={(e) => setFormData({ ...formData, 設計施工現調日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {renderDateMeta(formData.設計施工現調日)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">見積確定日</label>
                <input
                  type="date"
                  value={formData.見積確定日 || ''}
                  onChange={(e) => setFormData({ ...formData, 見積確定日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {renderDateMeta(formData.見積確定日)}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">着工日</label>
                <input
                  type="date"
                  value={formData.着工日 || ''}
                  onChange={(e) => setFormData({ ...formData, 着工日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {renderDateMeta(formData.着工日)}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">中間検査日</label>
                <input
                  type="date"
                  value={formData.中間検査日 || ''}
                  onChange={(e) => setFormData({ ...formData, 中間検査日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {renderDateMeta(formData.中間検査日)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">竣工予定日</label>
                <input
                  type="date"
                  value={formData.竣工予定日 || ''}
                  onChange={(e) => setFormData({ ...formData, 竣工予定日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {renderDateMeta(formData.竣工予定日)}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">引渡し予定日</label>
                <input
                  type="date"
                  value={formData.引渡し予定日 || ''}
                  onChange={(e) => setFormData({ ...formData, 引渡し予定日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {renderDateMeta(formData.引渡し予定日)}
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

            {/* 初期メンバー設定（作成モード時のみ） */}
            {mode === 'create' && (
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Users className="inline h-4 w-4" />
                    プロジェクトメンバー
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowInitialMembersSection(!showInitialMembersSection)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showInitialMembersSection ? '閉じる' : '+ メンバーを追加'}
                  </button>
                </div>

                {showInitialMembersSection && (
                  <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                    {manageableLoading ? (
                      <p className="text-sm text-slate-500 text-center py-4">読み込み中...</p>
                    ) : manageableUsers.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {manageableUsers.map((user) => {
                          const isSelected = initialMembers.some(m => m.userId === user.id);
                          const member = initialMembers.find(m => m.userId === user.id);

                          return (
                            <div key={user.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setInitialMembers([...initialMembers, {
                                      userId: user.id,
                                      displayName: user.displayName,
                                      email: user.email,
                                      role: 'member' as ProjectRole,
                                      jobTitle: '' as JobTitleType | '',
                                    }]);
                                  } else {
                                    setInitialMembers(initialMembers.filter(m => m.userId !== user.id));
                                  }
                                }}
                                className="h-4 w-4 text-blue-600"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">{user.displayName}</p>
                                <p className="text-xs text-slate-500 truncate">{user.email}</p>
                              </div>
                              {isSelected && (
                                <div className="flex gap-2">
                                  <select
                                    value={member?.role || 'member'}
                                    onChange={(e) => {
                                      setInitialMembers(initialMembers.map(m =>
                                        m.userId === user.id ? { ...m, role: e.target.value as ProjectRole } : m
                                      ));
                                    }}
                                    className="text-xs px-2 py-1 border border-slate-300 rounded"
                                  >
                                    {Object.entries(PROJECT_ROLE_LABELS).map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={member?.jobTitle || ''}
                                    onChange={(e) => {
                                      setInitialMembers(initialMembers.map(m =>
                                        m.userId === user.id ? { ...m, jobTitle: e.target.value as JobTitleType | '' } : m
                                      ));
                                    }}
                                    className="text-xs px-2 py-1 border border-slate-300 rounded"
                                  >
                                    {JOB_TYPE_OPTIONS.map((job) => (
                                      <option key={job || 'none'} value={job}>{job || '未設定'}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 text-center py-4">
                        追加可能なメンバーがいません
                      </p>
                    )}
                    {initialMembers.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-xs text-slate-600">
                          選択中: {initialMembers.length}名
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* タスク追加（編集モード時のみ） */}
            {project && project.id && onOpenTaskModal && (
              <div className="border-t border-slate-200 pt-4">
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  <Plus className="inline h-4 w-4 mr-1" />
                  タスク追加
                </label>
                <button
                  type="button"
                  onClick={() => onOpenTaskModal({ projectId: project.id })}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all"
                >
                  <Plus className="h-4 w-4" />
                  新しいタスクを作成
                </button>
              </div>
            )}

            {/* 工程管理（編集モード時のみ） */}
            {project && project.id && (
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">
                    <Plus className="inline h-4 w-4 mr-1" />
                    工程管理
                  </label>
                  {!showStageForm && (
                    <button
                      type="button"
                      onClick={handleStageCreate}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + 新しい工程
                    </button>
                  )}
                </div>

                {/* 工程追加/編集フォーム */}
                {showStageForm && (
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white mb-3">
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">
                        工程名 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={stageName}
                        onChange={(e) => setStageName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="例: 基本設計"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">予定開始日</label>
                        <input
                          type="date"
                          value={stageStartDate}
                          onChange={(e) => setStageStartDate(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">期限</label>
                        <input
                          type="date"
                          value={stageEndDate}
                          onChange={(e) => setStageEndDate(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowStageForm(false);
                          setStageName('');
                          setStageStartDate('');
                          setStageEndDate('');
                          setEditingStage(null);
                        }}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-2xl hover:bg-slate-50 transition-colors"
                        disabled={stageSaving}
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={handleStageSave}
                        disabled={!stageName.trim() || stageSaving}
                        className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-2xl hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {stageSaving ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 工程一覧 */}
                {stages.length > 0 ? (
                  <div className="space-y-2">
                    {stages.map((stage) => (
                      <div
                        key={stage.id}
                        className="p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm text-slate-700">{stage.タスク名}</div>
                            <div className="text-xs text-slate-500 mt-1">
                              {stage.予定開始日 && <span>開始: {stage.予定開始日}</span>}
                              {stage.予定開始日 && stage.期限 && <span className="mx-2">〜</span>}
                              {stage.期限 && <span>期限: {stage.期限}</span>}
                              {!stage.予定開始日 && !stage.期限 && <span className="text-slate-400">日付未設定</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStageEdit(stage)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="編集"
                            >
                              <Plus className="w-4 h-4 rotate-45" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStageDelete(stage.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 text-center py-4 border border-slate-200 rounded-lg">
                    工程がまだ登録されていません
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

                {/* メンバー追加フォーム */}
                {showInviteForm && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900">メンバーを追加</h4>

                    {/* 入力モード選択 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-2">追加方法</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="inputMode"
                            value="email"
                            checked={inputMode === 'email'}
                            onChange={() => setInputMode('email')}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-xs text-gray-700">システムユーザー/メールで招待</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="inputMode"
                            value="text"
                            checked={inputMode === 'text'}
                            onChange={() => setInputMode('text')}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-xs text-gray-700">テキストで名前を入力</span>
                        </label>
                      </div>
                    </div>

                    {inputMode === 'email' && (
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
                        ) : manageableUsers.length === 0 && collaborators.length === 0 ? (
                          <p className="text-xs text-gray-500 py-2">追加可能なメンバーが見つかりません。メールアドレスを直接入力してください。</p>
                        ) : (
                          <div className="space-y-3">
                            {manageableUsers.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-gray-700 mb-1">社内メンバー</p>
                                <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-40 overflow-y-auto bg-white">
                                  {manageableUsers.map(user => {
                                    const isSelected = selectedCandidateId === user.id;
                                    return (
                                      <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => handleCandidateSelect(user)}
                                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50'}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="truncate">
                                            <p className="font-medium text-gray-900 truncate">{user.displayName}</p>
                                            <p className="text-gray-500 truncate">{user.email}</p>
                                          </div>
                                          {isSelected && <span className="text-blue-600 font-semibold text-xs">✓</span>}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {collaborators.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-gray-700 mb-1">協力者</p>
                                <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-40 overflow-y-auto bg-white">
                                  {collaborators.map(collaborator => {
                                    const isSelected = selectedCollaboratorId === collaborator.id;
                                    return (
                                      <button
                                        key={collaborator.id}
                                        type="button"
                                        onClick={() => handleCollaboratorSelect(collaborator)}
                                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${isSelected ? 'bg-gray-50 border-l-4 border-gray-600' : 'hover:bg-gray-50'}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="truncate">
                                            <p className="font-medium text-gray-900 truncate">{collaborator.name}</p>
                                          </div>
                                          {isSelected && <span className="text-xs text-gray-600 font-semibold">✓</span>}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        <p className="mt-2 text-xs text-gray-500">候補を選択すると自動入力されます。外部ユーザーを追加する場合は直接入力してください。</p>
                      </div>
                    )}

                    {inputMode === 'text' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">名前 *</label>
                        <input
                          type="text"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="例: 山田太郎"
                          required
                        />
                        <p className="mt-1 text-xs text-gray-500">システムに登録されていない人（外部協力会社など）の名前を入力できます</p>
                      </div>
                    )}

                    {(selectedCandidateId || selectedCollaboratorId || (inputMode === 'text' && inviteName)) && (
                      <>
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
                                onChange={(e) => setInviteJob(e.target.value as JobTitleType | '')}
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              >
                                {JOB_TYPE_OPTIONS.map((job) => (
                                  <option key={job || 'none'} value={job}>{job || '未設定'}</option>
                                ))}
                              </select>
                            </div>
                          </div>
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
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              handleInvite(e as any);
                            }}
                            disabled={submitting}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {submitting ? '処理中...' : '追加'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* メンバー一覧 */}
                {projectMembers.length > 0 ? (
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
                              {/* 協力者（emailなし）の場合は固定表示 */}
                              {!member.email || member.email === '' ? (
                                <div className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded border border-gray-300">
                                  協力者
                                </div>
                              ) : (
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
                              )}
                              <select
                                value={member.jobTitle || ''}
                                onChange={(e) => handleUpdateJobType(member.userId, e.target.value as JobTitleType | '')}
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
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                    <History className="inline h-4 w-4" />
                    編集履歴
                  </label>
                  <button
                    type="button"
                    onClick={() => setLogsExpanded(prev => !prev)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    {logsExpanded ? '閉じる' : '表示'}
                  </button>
                </div>
                {!logsExpanded ? (
                  <div className="text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg px-3 py-2">
                    「表示」を押すと直近20件の編集履歴を読み込みます。
                  </div>
                ) : logsLoading ? (
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
