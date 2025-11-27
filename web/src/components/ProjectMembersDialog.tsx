import { useState, useEffect } from 'react';
import { X, UserPlus, Mail, Shield, Trash2, Check, Clock, AlertCircle } from 'lucide-react';
import { ProjectMember, ProjectMemberInput, PROJECT_ROLE_LABELS, ProjectRole, ROLE_LABELS } from '../lib/auth-types';
import { Project, ManageableUserSummary } from '../lib/types';
import { buildAuthHeaders, listManageableProjectUsers } from '../lib/api';

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api';

interface ProjectMembersDialogProps {
  project: Project;
  onClose: () => void;
}

export default function ProjectMembersDialog({ project, onClose }: ProjectMembersDialogProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('member');
  const [inviteMessage, setInviteMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [manageableUsers, setManageableUsers] = useState<ManageableUserSummary[]>([]);
  const [manageableLoading, setManageableLoading] = useState(false);
  const [manageableLoaded, setManageableLoaded] = useState(false);
  const [manageableError, setManageableError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');

  useEffect(() => {
    loadMembers();
  }, [project.id]);

  useEffect(() => {
    if (showInviteForm) {
      loadManageableUsers().catch(() => {
        /* errors handled inside */
      });
    }
  }, [showInviteForm]);

  const loadManageableUsers = async (force = false): Promise<void> => {
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
      setInviteEmail(candidate.email);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteEmail) {
      setError('メールアドレスを入力してください');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const input: ProjectMemberInput = {
        email: inviteEmail,
        role: inviteRole,
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

      await loadMembers();
      await loadManageableUsers(true);

      setSuccess('メンバーを追加/招待しました');
      setInviteEmail('');
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
    if (!confirm('このメンバーをプロジェクトから削除しますか？')) return;

    try {
      const token = await getAuthToken();
      const response = await fetch(`${BASE_URL}/projects/${project.id}/members/${userId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(token),
      });

      if (!response.ok) throw new Error('Failed to remove member');

      await loadMembers();
      await loadManageableUsers(true);
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

      setSuccess('メンバーのロールを更新しました');
      loadMembers();
    } catch (err) {
      console.error('Error updating member:', err);
      setError('メンバーの更新に失敗しました');
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
          {!showInviteForm && (
            <button
              onClick={() => setShowInviteForm(true)}
              className="mb-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              メンバーを追加/招待
            </button>
          )}

          {/* 招待フォーム */}
          {showInviteForm && (
            <form onSubmit={handleInvite} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-lg font-semibold mb-4">メンバーを追加/招待</h3>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      社内メンバーから選択
                    </label>
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
                    <p className="text-sm text-red-600">{manageableError}</p>
                  ) : manageableLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span>読み込み中...</span>
                    </div>
                  ) : manageableUsers.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      追加可能なユーザーが見つかりません。メールアドレスを直接入力してください。
                    </p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-52 overflow-y-auto bg-white">
                      {manageableUsers.map(user => {
                        const isSelected = selectedCandidateId === user.id;
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleCandidateSelect(user)}
                            className={`w-full text-left px-3 py-2 transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50'}`}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="font-medium text-gray-900 truncate">{user.displayName}</p>
                                <p className="text-xs text-gray-500 truncate">{user.email}</p>
                              </div>
                              <div className="text-xs text-gray-500 text-right min-w-[120px]">
                                <span>{ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}</span>
                                {(user.部署 || user.職種) && (
                                  <p className="mt-0.5 text-gray-400 truncate">
                                    {[user.部署, user.職種].filter(Boolean).join(' / ')}
                                  </p>
                                )}
                                {isSelected && <span className="block text-blue-600 font-semibold">選択中</span>}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    候補を選択するとメールアドレス欄に自動入力されます。外部ユーザーを追加する場合はメールアドレスを直接入力してください。
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    メールアドレス *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => {
                        const value = e.target.value;
                        setInviteEmail(value);
                        if (selectedCandidateId) {
                          const selected = manageableUsers.find(user => user.id === selectedCandidateId);
                          if (!selected || selected.email !== value) {
                            setSelectedCandidateId('');
                          }
                        }
                      }}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="user@example.com"
                      required
                    />
                  </div>
                </div>

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
                    メッセージ（オプション）
                  </label>
                  <textarea
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="メッセージを入力..."
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? '処理中...' : '追加/招待'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteForm(false);
                      setInviteEmail('');
                      setInviteMessage('');
                      setSelectedCandidateId('');
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </form>
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
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-medium text-gray-900">{member.displayName}</h4>
                        {getStatusBadge(member.status)}
                      </div>
                      <p className="text-sm text-gray-600">{member.email}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span>{member.orgName}</span>
                        {member.職種 && <span>• {member.職種}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
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

