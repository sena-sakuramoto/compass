import { useState, useEffect } from 'react';
import { listUsers, updateUser, deactivateUser, activateUser, type User } from '../lib/api';
import { listInvitations, createInvitation, deleteInvitation, type ProjectInvitation } from '../lib/invitations';
import { InvitationModal } from './InvitationModal';
import { InvitationList } from './InvitationList';
import type { Project } from '../lib/types';

interface UserManagementProps {
  projects?: Project[];
}

export function UserManagement({ projects = [] }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [invitationModalOpen, setInvitationModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    // 招待機能を一時的に無効化
    await loadUsers();
    // await Promise.all([loadUsers(), loadInvitations()]);
  }

  async function loadUsers() {
    try {
      setLoading(true);
      setError(null);
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadInvitations() {
    try {
      const data = await listInvitations();
      setInvitations(data);
    } catch (err) {
      console.error('Failed to load invitations:', err);
      // エラーの場合は空配列を設定して続行
      setInvitations([]);
    }
  }

  async function handleCreateInvitation(data: { email: string; projectId: string; role: 'member' | 'guest'; message?: string }) {
    await createInvitation(data);
    await loadInvitations();
  }

  async function handleDeleteInvitation(invitationId: string) {
    if (!confirm('この招待を取り消しますか？')) return;
    try {
      await deleteInvitation(invitationId);
      await loadInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
      console.error('Failed to delete invitation:', err);
    }
  }

  async function handleUpdateUser(userId: string, updates: Partial<User>) {
    try {
      await updateUser(userId, updates);
      await loadUsers();
      setEditingUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
      console.error('Failed to update user:', err);
    }
  }

  async function handleToggleActive(user: User) {
    try {
      if (user.isActive) {
        await deactivateUser(user.id);
      } else {
        await activateUser(user.id);
      }
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ステータスの変更に失敗しました');
      console.error('Failed to toggle user status:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
        <div className="text-rose-800 font-medium">エラー</div>
        <div className="text-rose-600 text-sm mt-1">{error}</div>
        <button
          onClick={() => loadUsers()}
          className="mt-3 text-sm text-rose-700 hover:text-rose-900 underline"
        >
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">人員管理</h2>
        {/* 招待機能を一時的に無効化
        <button
          onClick={() => setInvitationModalOpen(true)}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
        >
          外部協力者を招待
        </button>
        */}
      </div>

      {/* タブ - 招待機能を一時的に無効化 */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`border-b-2 px-1 pb-3 text-sm font-medium transition ${
              activeTab === 'users'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            ユーザー ({users.length})
          </button>
          {/* 招待タブを一時的に非表示
          <button
            onClick={() => setActiveTab('invitations')}
            className={`border-b-2 px-1 pb-3 text-sm font-medium transition ${
              activeTab === 'invitations'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            招待 ({invitations.length})
          </button>
          */}
        </nav>
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'users' ? (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">名前</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">メール</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">役割</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">組織</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">部署</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">ステータス</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {user.photoURL && (
                      <img
                        src={user.photoURL}
                        alt={user.displayName}
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <div className="text-sm font-medium text-slate-900">
                      {user.displayName}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                <td className="px-4 py-3">
                  {editingUser?.id === user.id ? (
                    <select
                      value={editingUser.role}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          role: e.target.value as User['role'],
                        })
                      }
                      className="text-xs border border-slate-300 rounded px-2 py-1"
                    >
                      <option value="admin">管理者</option>
                      <option value="project_manager">プロジェクトマネージャー</option>
                      <option value="viewer">閲覧者</option>
                    </select>
                  ) : (
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : user.role === 'project_manager'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {user.role === 'admin'
                        ? '管理者'
                        : user.role === 'project_manager'
                        ? 'PM'
                        : '閲覧者'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.orgId}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.部署 || '-'}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(user)}
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      user.isActive
                        ? 'bg-teal-100 text-teal-800 hover:bg-teal-200'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {user.isActive ? 'アクティブ' : '非アクティブ'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  {editingUser?.id === user.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          handleUpdateUser(user.id, {
                            role: editingUser.role,
                          })
                        }
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingUser(null)}
                        className="px-2 py-1 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                      >
                        キャンセル
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingUser(user)}
                      className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      編集
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
        <InvitationList
          invitations={invitations}
          onDelete={handleDeleteInvitation}
        />
      )}

      {/* 招待モーダル */}
      <InvitationModal
        open={invitationModalOpen}
        projects={projects}
        onClose={() => setInvitationModalOpen(false)}
        onSubmit={handleCreateInvitation}
      />
    </div>
  );
}
