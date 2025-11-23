import { useState, useEffect } from 'react';
import { listUsers, updateUser, deactivateUser, activateUser, deleteUser, type User } from '../lib/api';
import { OrgMemberInvitationModal } from './OrgMemberInvitationModal';
import { UserEditModal } from './UserEditModal';
import type { Project } from '../lib/types';

interface UserManagementProps {
  projects?: Project[];
}

export function UserManagement({ projects = [] }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [invitationModalOpen, setInvitationModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

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

  async function handleCreateInvitation(data: {
    email: string;
    displayName?: string;
    role: string;
    memberType: 'member' | 'guest';
    message?: string;
  }) {
    const token = localStorage.getItem('apdw_id_token');
    const response = await fetch('/api/org-invitations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '招待の作成に失敗しました');
    }

    await loadUsers();
  }

  async function handleUpdateUser(userId: string, updates: Partial<User>) {
    try {
      await updateUser(userId, updates);
      await loadUsers();
      setEditingUser(null);
      setEditModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
      console.error('Failed to update user:', err);
      throw err; // Re-throw for modal to handle
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

  async function handleDeleteUser(user: User) {
    if (!confirm(`${user.displayName} を完全に削除しますか？この操作は取り消せません。`)) {
      return;
    }

    try {
      await deleteUser(user.id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ユーザーの削除に失敗しました');
      console.error('Failed to delete user:', err);
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
        <button
          onClick={() => setInvitationModalOpen(true)}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
        >
          メンバー/ゲストを招待
        </button>
      </div>

      {/* ユーザー一覧 */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">名前</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">メール</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">種別</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">役割</th>
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
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      (user.memberType || 'guest') === 'member'
                        ? 'bg-teal-100 text-teal-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {(user.memberType || 'guest') === 'member' ? 'メンバー' : 'ゲスト'}
                  </span>
                </td>
                <td className="px-4 py-3">
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
                </td>
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingUser(user);
                        setEditModalOpen(true);
                      }}
                      className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user)}
                      className="px-2 py-1 text-xs text-rose-600 hover:text-rose-800 hover:underline"
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 招待モーダル */}
      <OrgMemberInvitationModal
        open={invitationModalOpen}
        onClose={() => setInvitationModalOpen(false)}
        onSubmit={handleCreateInvitation}
      />

      {/* 編集モーダル */}
      <UserEditModal
        open={editModalOpen}
        user={editingUser}
        onClose={() => {
          setEditModalOpen(false);
          setEditingUser(null);
        }}
        onSubmit={handleUpdateUser}
      />
    </div>
  );
}
