import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, UserPlus, Mail, Shield, Trash2, Check, Clock, AlertCircle, Briefcase, Building2, Users, Building, CheckSquare, Square } from 'lucide-react';
import { ProjectMember, ProjectMemberInput, PROJECT_ROLE_LABELS, ProjectRole, ROLE_LABELS, JobTitleType } from '../lib/auth-types';
import { Project, ManageableUserSummary } from '../lib/types';
import { buildAuthHeaders, type Collaborator, listAvailableOrganizations, previewOrgInvite, inviteOrganization, type AvailableOrganization, type OrgInvitePreview, addProjectMembersBatch, type BatchAddMembersPayload } from '../lib/api';
import { getOrgKey, getOrgLabel } from '../lib/org-utils';
import { useManageableUsers, useCollaborators, useInvalidateProjectMembers } from '../hooks/useProjectMembers';

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

import { resolveApiBase } from '../lib/apiBase';

const BASE_URL = resolveApiBase();

interface ProjectMembersDialogProps {
  project: Project;
  onClose: () => void;
}

export default function ProjectMembersDialog({ project, onClose }: ProjectMembersDialogProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inputMode, setInputMode] = useState<'email' | 'text'>('email'); // 入力モード
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState(''); // テキスト入力用の名前
  const [inviteRole, setInviteRole] = useState<ProjectRole>('member');
  const [inviteJob, setInviteJob] = useState<JobTitleType | ''>('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState('');
  const [candidateType, setCandidateType] = useState<'user' | 'collaborator'>('user');
  const [orgFilter, setOrgFilter] = useState('');

  // 複数選択用の状態（ID → 役割と職種のMap）
  type MemberSelection = { role: ProjectRole; jobTitle?: string };
  const [selectedCandidates, setSelectedCandidates] = useState<Map<string, MemberSelection>>(new Map());
  const [selectedCollaborators, setSelectedCollaborators] = useState<Map<string, MemberSelection>>(new Map());
  const [defaultInviteRole, setDefaultInviteRole] = useState<ProjectRole>('member');

  // 組織一括招待関連の状態
  const [showOrgInviteForm, setShowOrgInviteForm] = useState(false);
  const [availableOrgs, setAvailableOrgs] = useState<AvailableOrganization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [orgPreview, setOrgPreview] = useState<OrgInvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [invitingOrg, setInvitingOrg] = useState(false);

  // React Query でキャッシュ（5分間有効、API呼び出し90%削減）
  const {
    data: manageableUsers = [],
    isLoading: manageableLoading,
    error: manageableQueryError,
    refetch: refetchManageableUsers,
  } = useManageableUsers(project.id, showInviteForm);

  const {
    data: collaborators = [],
    isLoading: collaboratorsLoading,
    refetch: refetchCollaborators,
  } = useCollaborators(showInviteForm);

  const { invalidateAll } = useInvalidateProjectMembers();

  const manageableError = manageableQueryError
    ? manageableQueryError instanceof Error && manageableQueryError.message.toLowerCase().includes('forbidden')
      ? 'このプロジェクトのメンバーを管理する権限がありません。'
      : '候補の取得に失敗しました。'
    : null;
  const broadcastMemberUpdate = useCallback((members: ProjectMember[]) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('project-members:updated', { detail: { projectId: project.id, members } }));
  }, [project.id]);


  useEffect(() => {
    loadMembers();
  }, [project.id]);

  const loadMembers = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      const response = await fetch(`${BASE_URL}/projects/${project.id}/members`, {
        headers: buildAuthHeaders(token),
      });

      if (!response.ok) throw new Error('Failed to load members');

      const data = await response.json();
      setMembers(data);
      broadcastMemberUpdate(data);
    } catch (err) {
      console.error('Error loading members:', err);
      setError('メンバー一覧の読み込みに失敗しました');
    } finally {
      setLoading(false);
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
      setCandidateType('user');
    }
  };

  const handleCollaboratorSelect = (collaborator: Collaborator) => {
    if (selectedCollaboratorId === collaborator.id) {
      setSelectedCollaboratorId('');
    } else {
      setSelectedCollaboratorId(collaborator.id);
      setSelectedCandidateId('');
      setCandidateType('collaborator');

      // メールアドレスがあればemailモード、なければtextモード
      const trimmedEmail = collaborator.email?.trim();
      const trimmedName = collaborator.name?.trim() || '';
      if (trimmedEmail) {
        setInputMode('email');
        setInviteEmail(trimmedEmail);
        setInviteName('');
      } else {
        setInputMode('text');
        setInviteName(trimmedName);
        setInviteEmail('');
      }
    }
  };

  // 複数選択用のハンドラー
  const toggleCandidateSelection = (candidateId: string) => {
    setSelectedCandidates(prev => {
      const newMap = new Map(prev);
      if (newMap.has(candidateId)) {
        newMap.delete(candidateId);
      } else {
        newMap.set(candidateId, { role: defaultInviteRole });
      }
      return newMap;
    });
  };

  const toggleCollaboratorSelection = (collaboratorId: string) => {
    setSelectedCollaborators(prev => {
      const newMap = new Map(prev);
      if (newMap.has(collaboratorId)) {
        newMap.delete(collaboratorId);
      } else {
        newMap.set(collaboratorId, { role: defaultInviteRole });
      }
      return newMap;
    });
  };

  const updateCandidateRole = (candidateId: string, role: ProjectRole) => {
    setSelectedCandidates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(candidateId);
      newMap.set(candidateId, { ...current, role });
      return newMap;
    });
  };

  const updateCandidateJobTitle = (candidateId: string, jobTitle: string) => {
    setSelectedCandidates(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(candidateId);
      newMap.set(candidateId, { ...current, role: current?.role || 'member', jobTitle: jobTitle || undefined });
      return newMap;
    });
  };

  const updateCollaboratorRole = (collaboratorId: string, role: ProjectRole) => {
    setSelectedCollaborators(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(collaboratorId);
      newMap.set(collaboratorId, { ...current, role });
      return newMap;
    });
  };

  const updateCollaboratorJobTitle = (collaboratorId: string, jobTitle: string) => {
    setSelectedCollaborators(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(collaboratorId);
      newMap.set(collaboratorId, { ...current, role: current?.role || 'member', jobTitle: jobTitle || undefined });
      return newMap;
    });
  };

  const selectAllCandidates = (users: ManageableUserSummary[]) => {
    const newMap = new Map<string, MemberSelection>();
    users.forEach(u => newMap.set(u.id, { role: defaultInviteRole }));
    setSelectedCandidates(newMap);
  };

  const clearAllSelections = () => {
    setSelectedCandidates(new Map());
    setSelectedCollaborators(new Map());
  };

  const totalSelectedCount = selectedCandidates.size + selectedCollaborators.size;

  // 一括招待のハンドラー
  const handleBulkInvite = async () => {
    if (totalSelectedCount === 0) {
      setError('メンバーを選択してください');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const membersToAdd: BatchAddMembersPayload[] = [];

      // 選択されたユーザー候補を追加（個別の役割と職種を使用）
      selectedCandidates.forEach((selection, id) => {
        const user = manageableUsers.find(u => u.id === id);
        if (user?.email) {
          membersToAdd.push({
            email: user.email.trim(),
            role: selection.role,
            jobTitle: selection.jobTitle || undefined,
          });
        }
      });

      // 選択された協力者を追加（個別の役割と職種を使用）
      selectedCollaborators.forEach((selection, id) => {
        const collaborator = collaborators.find(c => c.id === id);
        if (collaborator) {
          const trimmedEmail = collaborator.email?.trim();
          if (trimmedEmail) {
            membersToAdd.push({
              email: trimmedEmail,
              role: selection.role,
              jobTitle: selection.jobTitle || undefined,
            });
          } else if (collaborator.name?.trim()) {
            membersToAdd.push({
              displayName: collaborator.name.trim(),
              role: selection.role,
              jobTitle: selection.jobTitle || undefined,
            });
          }
        }
      });

      if (membersToAdd.length === 0) {
        setError('有効なメンバーが選択されていません');
        setSubmitting(false);
        return;
      }

      const result = await addProjectMembersBatch(project.id, membersToAdd);

      // 追加されたメンバーをstateに反映
      if (result.added && result.added.length > 0) {
        setMembers(prev => {
          const next = [...prev, ...result.added];
          broadcastMemberUpdate(next);
          return next;
        });
      }

      // キャッシュを更新
      invalidateAll(project.id);

      // 成功メッセージ
      let message = `${result.addedCount}人のメンバーを追加しました`;
      if (result.skippedCount > 0) {
        message += `（${result.skippedCount}人は既に参加中）`;
      }
      setSuccess(message);

      // フォームをリセット
      clearAllSelections();
      setDefaultInviteRole('member');
      setShowInviteForm(false);
    } catch (err: any) {
      console.error('Error bulk inviting members:', err);
      setError(err.message || '一括追加に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setSubmitting(true);
      setError(null);

      const input: ProjectMemberInput = {
        role: inviteRole,
        jobTitle: inviteJob || undefined,
        message: inviteMessage || undefined,
      };

      // 優先順位:
      // 1. ユーザー候補が選択されている場合
      if (selectedCandidateId) {
        const selectedUser = manageableUsers.find(u => u.id === selectedCandidateId);
        if (selectedUser?.email) {
          const trimmedEmail = selectedUser.email.trim();
          if (trimmedEmail) {
            input.email = trimmedEmail;
          }
        }
        if (!input.email) {
          setError('選択したユーザーのメールアドレスを取得できませんでした');
          setSubmitting(false);
          return;
        }
      }
      // 2. 協力者が選択されている場合
      else if (selectedCollaboratorId) {
        const selectedCollab = collaborators.find(c => c.id === selectedCollaboratorId);
        if (selectedCollab) {
          const trimmedEmail = selectedCollab.email?.trim();
          if (trimmedEmail) {
            input.email = trimmedEmail;
          } else {
            const trimmedName = selectedCollab.name?.trim();
            if (trimmedName) {
              input.displayName = trimmedName;
            }
          }
        }
        if (!input.email && !input.displayName) {
          setError('協力者の情報に名前がありません。名前を入力してください');
          setSubmitting(false);
          return;
        }
      }
      // 3. 手動入力の場合
      else {
        if (inputMode === 'email') {
          if (!inviteEmail || !inviteEmail.trim()) {
            setError('メールアドレスを入力してください');
            setSubmitting(false);
            return;
          }
          input.email = inviteEmail.trim();
        } else {
          if (!inviteName || !inviteName.trim()) {
            setError('名前を入力してください');
            setSubmitting(false);
            return;
          }
          input.displayName = inviteName.trim();
        }
      }

      // emailもdisplayNameもない場合はエラー
      if (!input.email && !input.displayName) {
        setError('メールアドレスまたは名前を入力してください');
        setSubmitting(false);
        return;
      }

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

      const newMember: ProjectMember = await response.json();

      // 【改善】APIレスポンスから直接stateに追加（再取得不要）
      setMembers(prev => {
        const next = [...prev, newMember];
        broadcastMemberUpdate(next);
        return next;
      });

      // キャッシュを更新
      invalidateAll(project.id);

      setSuccess('メンバーを追加/招待しました');
      setInviteEmail('');
      setInviteName('');
      setInviteMessage('');
      setSelectedCandidateId('');
      setSelectedCollaboratorId('');
      setInputMode('email');
      setShowInviteForm(false);
    } catch (err: any) {
      console.error('Error inviting member:', err);
      setError(err.message || 'メンバーの追加/招待に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('このメンバーをプロジェクトから削除しますか？')) return;

    try {
      const token = await getAuthToken();
      const response = await fetch(`${BASE_URL}/projects/${project.id}/members/${userId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(token),
      });

      if (!response.ok) throw new Error('Failed to remove member');

      // 【改善】stateから直接削除（再取得不要）
      setMembers(prev => {
        const next = prev.filter(m => m.userId !== userId);
        broadcastMemberUpdate(next);
        return next;
      });

      invalidateAll(project.id);
      setSuccess('メンバーを削除しました');
    } catch (err) {
      console.error('Error removing member:', err);
      setError('メンバーの削除に失敗しました');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: ProjectRole) => {
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

      const updatedMember: ProjectMember = await response.json();

      // 【改善】APIレスポンスから直接stateを更新（再取得不要）
      setMembers(prev => {
        const next = prev.map(m => (m.userId === userId ? updatedMember : m));
        broadcastMemberUpdate(next);
        return next;
      });

      setSuccess('メンバーのロールを更新しました');
    } catch (err) {
      console.error('Error updating member:', err);
      setError('メンバーの更新に失敗しました');
    }
  };

  const handleUpdateJobType = async (userId: string, newJobType: JobTitleType | '') => {
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

      const updatedMember: ProjectMember = await response.json();

      // 【改善】APIレスポンスから直接stateを更新（再取得不要）
      setMembers(prev => {
        const next = prev.map(m => (m.userId === userId ? updatedMember : m));
        broadcastMemberUpdate(next);
        return next;
      });

      setSuccess('メンバーの職種を更新しました');
    } catch (err) {
      console.error('Error updating member job type:', err);
      setError('職種の更新に失敗しました');
    }
  };

  const getAuthToken = async () => {
    // Firebase Authからトークンを取得
    const { getAuth } = await import('firebase/auth');
    const { getApp } = await import('firebase/app');
    const app = getApp();
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken(true); // Force refresh token
  };

  const orgFilterOptions = useMemo(() => {
    const options = new Map<string, string>();
    manageableUsers.forEach((user) => {
      const key = getOrgKey(user.orgId, user.orgName);
      options.set(key, getOrgLabel(user.orgId, user.orgName));
    });
    collaborators
      .filter((collaborator) => collaborator.linkedUser)
      .forEach((collaborator) => {
        const key = getOrgKey(collaborator.linkedUser?.orgId, collaborator.linkedUser?.orgName);
        options.set(key, getOrgLabel(collaborator.linkedUser?.orgId, collaborator.linkedUser?.orgName));
      });
    const sorted = Array.from(options.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ja'));
    return [{ value: '', label: 'すべての組織' }, ...sorted.map(([value, label]) => ({ value, label }))];
  }, [manageableUsers, collaborators]);

  const filteredManageableUsers = useMemo(() => {
    if (!orgFilter) return manageableUsers;
    return manageableUsers.filter((user) => getOrgKey(user.orgId, user.orgName) === orgFilter);
  }, [manageableUsers, orgFilter]);

  const groupedManageableUsers = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; users: ManageableUserSummary[] }>();
    filteredManageableUsers.forEach((user) => {
      const key = getOrgKey(user.orgId, user.orgName);
      const label = getOrgLabel(user.orgId, user.orgName);
      const group = groups.get(key) ?? { key, label, users: [] };
      group.users.push(user);
      groups.set(key, group);
    });
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [filteredManageableUsers]);

  // manageableUsersのメールアドレスセットを作成（重複排除用）
  // 注意: 名前だけでの重複チェックは同姓同名の別人を誤って除外するリスクがあるため行わない
  const manageableUserEmails = useMemo(() => {
    const emails = new Set<string>();
    manageableUsers.forEach((user) => {
      if (user.email) {
        emails.add(user.email.toLowerCase());
      }
    });
    return emails;
  }, [manageableUsers]);

  // 協力者のうち、manageableUsersと重複しないものだけを抽出
  const deduplicatedCollaborators = useMemo(() => {
    return collaborators.filter((collaborator) => {
      // メールアドレスがある場合のみ、manageableUsersと重複していないかチェック
      if (collaborator.email && manageableUserEmails.has(collaborator.email.toLowerCase())) {
        return false; // 重複しているので除外
      }
      // linkedUserにメールがある場合も確認
      if (collaborator.linkedUser?.email && manageableUserEmails.has(collaborator.linkedUser.email.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [collaborators, manageableUserEmails]);

  const linkedCollaborators = useMemo(
    () => deduplicatedCollaborators.filter((collaborator) => collaborator.linkedUser),
    [deduplicatedCollaborators]
  );
  const externalCollaborators = useMemo(
    () => deduplicatedCollaborators.filter((collaborator) => !collaborator.linkedUser),
    [deduplicatedCollaborators]
  );

  const filteredLinkedCollaborators = useMemo(() => {
    if (!orgFilter) return linkedCollaborators;
    return linkedCollaborators.filter(
      (collaborator) => getOrgKey(collaborator.linkedUser?.orgId, collaborator.linkedUser?.orgName) === orgFilter
    );
  }, [linkedCollaborators, orgFilter]);

  const groupedLinkedCollaborators = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; collaborators: Collaborator[] }>();
    filteredLinkedCollaborators.forEach((collaborator) => {
      const key = getOrgKey(collaborator.linkedUser?.orgId, collaborator.linkedUser?.orgName);
      const label = getOrgLabel(collaborator.linkedUser?.orgId, collaborator.linkedUser?.orgName);
      const group = groups.get(key) ?? { key, label, collaborators: [] };
      group.collaborators.push(collaborator);
      groups.set(key, group);
    });
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [filteredLinkedCollaborators]);

  const filteredExternalCollaborators = useMemo(() => {
    if (orgFilter) return [];
    return externalCollaborators;
  }, [externalCollaborators, orgFilter]);

  // 組織一括招待フォームを開いた時に組織一覧を取得
  const loadAvailableOrgs = useCallback(async () => {
    setLoadingOrgs(true);
    try {
      const orgs = await listAvailableOrganizations();
      setAvailableOrgs(orgs);
    } catch (err) {
      console.error('Failed to load organizations:', err);
      setError('組織一覧の取得に失敗しました');
    } finally {
      setLoadingOrgs(false);
    }
  }, []);

  // 組織を選択した時にプレビューを取得
  const loadOrgPreview = useCallback(async (orgId: string) => {
    if (!orgId) {
      setOrgPreview(null);
      return;
    }
    setLoadingPreview(true);
    try {
      const preview = await previewOrgInvite(project.id, orgId);
      setOrgPreview(preview);
    } catch (err: any) {
      console.error('Failed to load org preview:', err);
      setError(err.message || '組織のプレビュー取得に失敗しました');
      setOrgPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [project.id]);

  // 組織選択時のハンドラ
  const handleOrgSelect = useCallback((orgId: string) => {
    setSelectedOrgId(orgId);
    loadOrgPreview(orgId);
  }, [loadOrgPreview]);

  // 組織一括招待の実行
  const handleOrgInvite = useCallback(async () => {
    if (!selectedOrgId || !orgPreview || orgPreview.toBeInvited === 0) return;

    setInvitingOrg(true);
    setError(null);
    try {
      const result = await inviteOrganization(project.id, selectedOrgId);
      setSuccess(`${result.invitedCount}人のメンバーを招待しました`);

      // メンバー一覧を再読み込み
      loadMembers();
      invalidateAll(project.id);

      // フォームをリセット
      setShowOrgInviteForm(false);
      setSelectedOrgId('');
      setOrgPreview(null);
    } catch (err: any) {
      console.error('Failed to invite organization:', err);
      setError(err.message || '組織の招待に失敗しました');
    } finally {
      setInvitingOrg(false);
    }
  }, [project.id, selectedOrgId, orgPreview, invalidateAll, loadMembers]);

  const getStatusBadge = (status: ProjectMember['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
            <Check className="w-3 h-3" />
            アクティブ
          </span>
        );
      case 'invited':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3" />
            招待中
          </span>
        );
      case 'inactive':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
            非アクティブ
          </span>
        );
    }
  };

  const getMemberTypeBadge = (memberType: ProjectMember['memberType']) => {
    switch (memberType) {
      case 'external':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 border border-gray-300">
            <Users className="w-3 h-3" />
            外部協力者
          </span>
        );
      case 'internal':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 border border-blue-300">
            <Building2 className="w-3 h-3" />
            Compassユーザー
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">プロジェクトメンバー</h2>
            <p className="text-sm text-gray-600 mt-1">{project.物件名}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* エラー・成功メッセージ */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-green-800">{success}</p>
              </div>
              <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 招待ボタン */}
          {!showInviteForm && !showOrgInviteForm && (
            <div className="mb-6">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowInviteForm(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <UserPlus className="w-4 h-4" />
                  メンバーを追加
                </button>
                <button
                  onClick={() => {
                    setShowOrgInviteForm(true);
                    loadAvailableOrgs();
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <Building className="w-4 h-4" />
                  組織を一括招待
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                個別にメンバーを追加するか、協力会社の組織全体をまとめて招待できます。
              </p>
            </div>
          )}

          {/* 招待フォーム */}
          {showInviteForm && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">メンバーを追加/招待</h3>
                {totalSelectedCount > 0 && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                    {totalSelectedCount}人選択中
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {/* 入力モード選択 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    追加方法
                  </label>
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
                      <span className="text-sm text-gray-700">システムユーザー/メールで招待（複数選択可）</span>
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
                      <span className="text-sm text-gray-700">テキストで名前を入力</span>
                    </label>
                  </div>
                </div>

                {inputMode === 'email' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        メンバーを選択（複数選択可）
                      </label>
                      <div className="flex items-center gap-2">
                        {totalSelectedCount > 0 && (
                          <button
                            type="button"
                            onClick={clearAllSelections}
                            className="text-xs text-gray-600 hover:text-gray-800"
                          >
                            選択をクリア
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            refetchManageableUsers();
                            refetchCollaborators();
                          }}
                          disabled={manageableLoading || collaboratorsLoading}
                          className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          再読み込み
                        </button>
                      </div>
                    </div>
                    {manageableError ? (
                      <p className="text-sm text-red-600">{manageableError}</p>
                    ) : manageableLoading ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span>読み込み中...</span>
                      </div>
                    ) : groupedManageableUsers.length === 0 && groupedLinkedCollaborators.length === 0 && filteredExternalCollaborators.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        追加可能なユーザーが見つかりません。メールアドレスを直接入力してください。
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {orgFilterOptions.length > 1 && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-600">組織で絞り込み</label>
                            <select
                              value={orgFilter}
                              onChange={(e) => setOrgFilter(e.target.value)}
                              className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {orgFilterOptions.map((option) => (
                                <option key={option.value || 'all'} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {groupedManageableUsers.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-medium text-gray-700">社内メンバー</p>
                              <button
                                type="button"
                                onClick={() => selectAllCandidates(filteredManageableUsers)}
                                className="text-xs text-blue-600 hover:text-blue-700"
                              >
                                すべて選択
                              </button>
                            </div>
                            <div className="space-y-2">
                              {groupedManageableUsers.map((group) => (
                                <div key={group.key}>
                                  <div className="mb-1 text-xs font-semibold text-gray-500">{group.label}</div>
                                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-48 overflow-y-auto bg-white">
                                    {group.users.map(user => {
                                      const isSelected = selectedCandidates.has(user.id);
                                      return (
                                        <label
                                          key={user.id}
                                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleCandidateSelection(user.id)}
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 truncate">{user.displayName}</p>
                                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                          </div>
                                          <div className="text-xs text-gray-500 text-right">
                                            <span>{ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}</span>
                                            {(user.department || user.jobTitle) && (
                                              <p className="mt-0.5 text-gray-400 truncate">
                                                {[user.department, user.jobTitle].filter(Boolean).join(' / ')}
                                              </p>
                                            )}
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {groupedLinkedCollaborators.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-700 mb-1">協力業者（Compassユーザー）</p>
                            <div className="space-y-2">
                              {groupedLinkedCollaborators.map((group) => (
                                <div key={group.key}>
                                  <div className="mb-1 text-xs font-semibold text-gray-500">{group.label}</div>
                                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-48 overflow-y-auto bg-white">
                                    {group.collaborators.map(collaborator => {
                                      const isSelected = selectedCollaborators.has(collaborator.id);
                                      return (
                                        <label
                                          key={collaborator.id}
                                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleCollaboratorSelection(collaborator.id)}
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 truncate">{collaborator.name}</p>
                                            {collaborator.email && (
                                              <p className="text-xs text-gray-500 truncate">{collaborator.email}</p>
                                            )}
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {filteredExternalCollaborators.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-700 mb-1">協力者</p>
                            <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-48 overflow-y-auto bg-white">
                              {filteredExternalCollaborators.map(collaborator => {
                                const isSelected = selectedCollaborators.has(collaborator.id);
                                return (
                                  <label
                                    key={collaborator.id}
                                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleCollaboratorSelection(collaborator.id)}
                                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-gray-900 truncate">{collaborator.name}</p>
                                      {collaborator.email && (
                                        <p className="text-xs text-gray-500 truncate">{collaborator.email}</p>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 選択されたメンバー一覧と個別の役割設定 */}
                    {totalSelectedCount > 0 && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-blue-800">
                            追加するメンバー（{totalSelectedCount}人）
                          </p>
                          <button
                            type="button"
                            onClick={clearAllSelections}
                            className="text-xs text-blue-600 hover:text-blue-700"
                          >
                            選択をクリア
                          </button>
                        </div>

                        {/* 選択されたメンバーの一覧 */}
                        <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                          {/* 選択されたユーザー候補 */}
                          {Array.from(selectedCandidates.entries()).map(([id, selection]) => {
                            const user = manageableUsers.find(u => u.id === id);
                            if (!user) return null;
                            return (
                              <div key={id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{user.displayName}</p>
                                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                </div>
                                <select
                                  value={selection.role}
                                  onChange={(e) => updateCandidateRole(id, e.target.value as ProjectRole)}
                                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  {Object.entries(PROJECT_ROLE_LABELS)
                                    .filter(([value]) => value !== 'owner')
                                    .map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                                <select
                                  value={selection.jobTitle || ''}
                                  onChange={(e) => updateCandidateJobTitle(id, e.target.value)}
                                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  {JOB_TYPE_OPTIONS.map((job) => (
                                    <option key={job || 'none'} value={job}>
                                      {job || '職種未設定'}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => toggleCandidateSelection(id)}
                                  className="p-1 text-gray-400 hover:text-red-500"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}

                          {/* 選択された協力者 */}
                          {Array.from(selectedCollaborators.entries()).map(([id, selection]) => {
                            const collaborator = collaborators.find(c => c.id === id);
                            if (!collaborator) return null;
                            return (
                              <div key={id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{collaborator.name}</p>
                                  {collaborator.email && (
                                    <p className="text-xs text-gray-500 truncate">{collaborator.email}</p>
                                  )}
                                </div>
                                <select
                                  value={selection.role}
                                  onChange={(e) => updateCollaboratorRole(id, e.target.value as ProjectRole)}
                                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  {Object.entries(PROJECT_ROLE_LABELS)
                                    .filter(([value]) => value !== 'owner')
                                    .map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                                <select
                                  value={selection.jobTitle || ''}
                                  onChange={(e) => updateCollaboratorJobTitle(id, e.target.value)}
                                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  {JOB_TYPE_OPTIONS.map((job) => (
                                    <option key={job || 'none'} value={job}>
                                      {job || '職種未設定'}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => toggleCollaboratorSelection(id)}
                                  className="p-1 text-gray-400 hover:text-red-500"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={handleBulkInvite}
                          disabled={submitting}
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {submitting ? '追加中...' : `${totalSelectedCount}人を追加`}
                        </button>
                      </div>
                    )}

                    <p className="mt-2 text-xs text-gray-500">
                      メンバーを選択後、それぞれに役割を設定して一括で追加できます。
                    </p>
                  </div>
                )}

                {inputMode === 'text' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      名前 *
                    </label>
                    <input
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="例: 山田太郎"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      システムに登録されていない外部協力者を名前のみで追加できます
                    </p>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ロール *
                        </label>
                        <div className="relative">
                          <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as ProjectRole)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                          >
                            {Object.entries(PROJECT_ROLE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          職種
                        </label>
                        <div className="relative">
                          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <select
                            value={inviteJob}
                            onChange={(e) => setInviteJob(e.target.value as JobTitleType | '')}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                          >
                            {JOB_TYPE_OPTIONS.map((job) => (
                              <option key={job || 'none'} value={job}>
                                {job || '未設定'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleInvite}
                      disabled={submitting || !inviteName.trim()}
                      className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? '処理中...' : '追加'}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gray-200 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteForm(false);
                      setShowOrgInviteForm(true);
                      loadAvailableOrgs();
                      clearAllSelections();
                    }}
                    className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700"
                  >
                    <Building className="w-4 h-4" />
                    組織をまとめて招待する
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteForm(false);
                      setInviteEmail('');
                      setInviteName('');
                      setInviteJob('');
                      setInviteMessage('');
                      setSelectedCandidateId('');
                      setSelectedCollaboratorId('');
                      clearAllSelections();
                      setDefaultInviteRole('member');
                      setInputMode('email');
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 組織一括招待フォーム */}
          {showOrgInviteForm && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building className="w-5 h-5 text-green-600" />
                組織を一括招待
              </h3>

              <div className="space-y-4">
                {/* 組織選択 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    招待する組織を選択
                  </label>
                  {loadingOrgs ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                      <span>組織一覧を読み込み中...</span>
                    </div>
                  ) : availableOrgs.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      招待可能な組織がありません。
                    </p>
                  ) : (
                    <select
                      value={selectedOrgId}
                      onChange={(e) => handleOrgSelect(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">組織を選択してください</option>
                      {availableOrgs.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* プレビュー */}
                {loadingPreview && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                    <span>メンバー情報を確認中...</span>
                  </div>
                )}

                {orgPreview && !loadingPreview && (
                  <div className="p-4 bg-white rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-3">
                      {orgPreview.targetOrgName} の招待プレビュー
                    </h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="text-center p-2 bg-gray-50 rounded">
                        <p className="text-2xl font-bold text-gray-900">{orgPreview.totalMembers}</p>
                        <p className="text-gray-500">総メンバー数</p>
                      </div>
                      <div className="text-center p-2 bg-yellow-50 rounded">
                        <p className="text-2xl font-bold text-yellow-600">{orgPreview.alreadyInProject}</p>
                        <p className="text-gray-500">既に参加中</p>
                      </div>
                      <div className="text-center p-2 bg-green-50 rounded">
                        <p className="text-2xl font-bold text-green-600">{orgPreview.toBeInvited}</p>
                        <p className="text-gray-500">新規招待</p>
                      </div>
                    </div>

                    {orgPreview.toBeInvited > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">招待されるメンバー:</p>
                        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-200">
                          {orgPreview.members.map((member) => (
                            <div key={member.id} className="px-3 py-2 text-sm">
                              <p className="font-medium text-gray-900">{member.displayName}</p>
                              <p className="text-xs text-gray-500">{member.email}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {orgPreview.toBeInvited === 0 && (
                      <p className="mt-4 text-sm text-yellow-600">
                        この組織のメンバーは全員既にプロジェクトに参加しています。
                      </p>
                    )}
                  </div>
                )}

                {/* アクションボタン */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleOrgInvite}
                    disabled={invitingOrg || !orgPreview || orgPreview.toBeInvited === 0}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {invitingOrg ? '招待中...' : orgPreview ? `${orgPreview.toBeInvited}人を招待` : '招待'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOrgInviteForm(false);
                      setSelectedOrgId('');
                      setOrgPreview(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* メンバー一覧 */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">読み込み中...</p>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12">
              <UserPlus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">まだメンバーがいません</p>
              <p className="text-sm text-gray-500 mt-1">メンバーを追加してプロジェクトを共有しましょう</p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.userId}
                  className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h4 className="font-medium text-gray-900">{member.displayName}</h4>
                        {getStatusBadge(member.status)}
                        {getMemberTypeBadge(member.memberType)}
                      </div>
                      <p className="text-sm text-gray-600">{member.email}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        {member.memberType !== 'external' && member.orgName && (
                          <span>{member.orgName}</span>
                        )}
                        {member.jobTitle && (
                          <>
                            {member.memberType !== 'external' && member.orgName && <span>•</span>}
                            <span>{member.jobTitle}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-2">
                        <select
                          value={member.role}
                          onChange={(e) => handleUpdateRole(member.userId, e.target.value as ProjectRole)}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={member.role === 'owner'}
                        >
                          {Object.entries(PROJECT_ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <select
                          value={member.jobTitle || ''}
                          onChange={(e) => handleUpdateJobType(member.userId, e.target.value as JobTitleType | '')}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {JOB_TYPE_OPTIONS.map((job) => (
                            <option key={job || 'none'} value={job}>
                              {job || '未設定'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {member.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(member.userId)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
          )}
        </div>

        {/* フッター */}
        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <span>合計 {members.length} 人のメンバー</span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

