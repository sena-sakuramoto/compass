import { useState, useEffect } from 'react';
import { listUsers, updateUser, deactivateUser, activateUser, deleteUser, type User, listClients, createClient, updateClient, deleteClient, type Client, listCollaborators, createCollaborator, updateCollaborator, deleteCollaborator, type Collaborator } from '../lib/api';
import { ROLE_LABELS } from '../lib/auth-types';
import { OrgMemberInvitationModal } from './OrgMemberInvitationModal';
import { UserEditModal } from './UserEditModal';
import type { Project } from '../lib/types';
import { Building2, Plus, Trash2, Check, X, Users, Pencil } from 'lucide-react';

interface UserManagementProps {
  projects?: Project[];
}

export function UserManagement({ projects = [] }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [collaboratorError, setCollaboratorError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [invitationModalOpen, setInvitationModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingClientName, setEditingClientName] = useState('');
  const [newCollaboratorName, setNewCollaboratorName] = useState('');
  const [showCollaboratorForm, setShowCollaboratorForm] = useState(false);
  const [editingCollaboratorId, setEditingCollaboratorId] = useState<string | null>(null);
  const [editingCollaboratorName, setEditingCollaboratorName] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
    loadClients();
    loadCollaborators();
    loadCurrentUser();
  }, []);

  async function loadCurrentUser() {
    try {
      const { getAuth } = await import('firebase/auth');
      const { getApp } = await import('firebase/app');
      const app = getApp();
      const auth = getAuth(app);
      const currentUser = auth.currentUser;

      if (currentUser) {
        const token = localStorage.getItem('apdw_id_token');
        const response = await fetch(`/api/users/${currentUser.uid}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setCurrentUserRole(userData.role);
        }
      }
    } catch (err) {
      console.error('Failed to load current user:', err);
    }
  }

  // 編集モード外クリックで編集終了
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      // 編集中の入力フィールドやボタン以外をクリックしたら編集終了
      if (editingClientId && !target.closest('input') && !target.closest('button')) {
        handleCancelEditClient();
      }
      if (editingCollaboratorId && !target.closest('input') && !target.closest('button')) {
        handleCancelEditCollaborator();
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [editingClientId, editingCollaboratorId]);

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

  async function loadClients() {
    try {
      setClientsLoading(true);
      setClientError(null);
      const data = await listClients();
      setClients(data.clients || []);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'クライアントの読み込みに失敗しました');
      console.error('Failed to load clients:', err);
    } finally {
      setClientsLoading(false);
    }
  }

  async function loadCollaborators() {
    try {
      setCollaboratorsLoading(true);
      setCollaboratorError(null);
      const data = await listCollaborators();
      setCollaborators(data.collaborators || []);
    } catch (err) {
      setCollaboratorError(err instanceof Error ? err.message : '協力者の読み込みに失敗しました');
      console.error('Failed to load collaborators:', err);
    } finally {
      setCollaboratorsLoading(false);
    }
  }

  async function handleCreateInvitation(data: {
    email: string;
    displayName?: string;
    role: string;
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

  async function handleDeleteUser(userId: string) {
    // モーダルから呼ばれるため、確認ダイアログはモーダル側で表示済みと想定、
    // またはここで再度確認してもよいが、モーダル側でconfirmしているのでここは削除のみ実行
    try {
      await deleteUser(userId);
      await loadUsers();
      setEditModalOpen(false);
      setEditingUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ユーザーの削除に失敗しました');
      console.error('Failed to delete user:', err);
    }
  }

  async function handleCreateClient() {
    if (!newClientName.trim()) return;

    try {
      setClientError(null);
      await createClient(newClientName.trim());
      await loadClients();
      setNewClientName('');
      setShowClientForm(false);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'クライアントの作成に失敗しました');
      console.error('Failed to create client:', err);
    }
  }

  async function handleUpdateClient(clientId: string) {
    if (!editingClientName.trim()) return;

    try {
      setClientError(null);
      await updateClient(clientId, editingClientName.trim());
      await loadClients();
      setEditingClientId(null);
      setEditingClientName('');
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'クライアントの更新に失敗しました');
      console.error('Failed to update client:', err);
    }
  }

  async function handleDeleteClient(clientId: string, clientName: string) {
    if (!confirm(`クライアント「${clientName}」を削除してもよろしいですか？`)) {
      return;
    }

    try {
      setClientError(null);
      await deleteClient(clientId);
      await loadClients();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'クライアントの削除に失敗しました');
      console.error('Failed to delete client:', err);
    }
  }

  function handleStartEditClient(client: Client) {
    setEditingClientId(client.id);
    setEditingClientName(client.name);
  }

  function handleCancelEditClient() {
    setEditingClientId(null);
    setEditingClientName('');
  }

  async function handleCreateCollaborator() {
    if (!newCollaboratorName.trim()) return;

    try {
      setCollaboratorError(null);
      await createCollaborator(newCollaboratorName.trim());
      await loadCollaborators();
      setNewCollaboratorName('');
      setShowCollaboratorForm(false);
    } catch (err) {
      setCollaboratorError(err instanceof Error ? err.message : '協力者の作成に失敗しました');
      console.error('Failed to create collaborator:', err);
    }
  }

  async function handleUpdateCollaborator(collaboratorId: string) {
    if (!editingCollaboratorName.trim()) return;

    try {
      setCollaboratorError(null);
      await updateCollaborator(collaboratorId, editingCollaboratorName.trim());
      await loadCollaborators();
      setEditingCollaboratorId(null);
      setEditingCollaboratorName('');
    } catch (err) {
      setCollaboratorError(err instanceof Error ? err.message : '協力者の更新に失敗しました');
      console.error('Failed to update collaborator:', err);
    }
  }

  async function handleDeleteCollaborator(collaboratorId: string, collaboratorName: string) {
    if (!confirm(`協力者「${collaboratorName}」を削除してもよろしいですか？`)) {
      return;
    }

    try {
      setCollaboratorError(null);
      await deleteCollaborator(collaboratorId);
      await loadCollaborators();
    } catch (err) {
      setCollaboratorError(err instanceof Error ? err.message : '協力者の削除に失敗しました');
      console.error('Failed to delete collaborator:', err);
    }
  }

  function handleStartEditCollaborator(collaborator: Collaborator) {
    setEditingCollaboratorId(collaborator.id);
    setEditingCollaboratorName(collaborator.name);
  }

  function handleCancelEditCollaborator() {
    setEditingCollaboratorId(null);
    setEditingCollaboratorName('');
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
          メンバーを招待
        </button>
      </div>

      {/* ユーザー一覧 */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">名前</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">メール</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">役割</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">部署</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">組織</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">ステータス</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map((user) => (
              <tr
                key={user.id}
                className="hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => {
                  setEditingUser(user);
                  setEditModalOpen(true);
                }}
              >
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
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${user.role === 'super_admin'
                      ? 'bg-rose-100 text-rose-800'
                      : user.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : user.role === 'project_manager'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                  >
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.department || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{(user as any).orgName || user.orgId}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleActive(user);
                    }}
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${user.isActive
                      ? 'bg-teal-100 text-teal-800 hover:bg-teal-200'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                  >
                    {user.isActive ? 'アクティブ' : '非アクティブ'}
                  </button>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* クライアント管理セクション */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">クライアント管理</h2>
          <button
            onClick={() => setShowClientForm(!showClientForm)}
            className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            {showClientForm ? 'キャンセル' : 'クライアントを追加'}
          </button>
        </div>

        {/* 新規クライアント追加フォーム */}
        {showClientForm && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="flex gap-2 items-center">
              <Building2 className="w-5 h-5 text-slate-600" />
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateClient();
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder="クライアント名を入力"
                autoFocus
              />
              <button
                onClick={handleCreateClient}
                disabled={!newClientName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* クライアントエラー表示 */}
        {clientError && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
            <div className="text-rose-800 font-medium">エラー</div>
            <div className="text-rose-600 text-sm mt-1">{clientError}</div>
          </div>
        )}

        {/* クライアント一覧 */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {clientsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-slate-500">読み込み中...</div>
            </div>
          ) : clients.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-slate-500">クライアントが登録されていません</div>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">クライアント名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">登録日</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {editingClientId === client.id ? (
                        <div className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-slate-600" />
                          <input
                            type="text"
                            value={editingClientName}
                            onChange={(e) => setEditingClientName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleUpdateClient(client.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEditClient();
                              }
                            }}
                            className="flex-1 px-2 py-1 text-sm border border-slate-400 rounded focus:outline-none focus:ring-1 focus:ring-slate-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateClient(client.id)}
                            disabled={!editingClientName.trim()}
                            className="p-1 text-teal-600 hover:bg-teal-50 rounded transition-colors disabled:opacity-50"
                            title="保存"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancelEditClient}
                            className="p-1 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                            title="キャンセル"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 rounded px-2 py-1 -mx-2 -my-1 transition-colors"
                          onClick={() => handleStartEditClient(client)}
                        >
                          <Building2 className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                          <div className="text-sm font-medium text-slate-900 group-hover:text-slate-600 transition-colors flex-1">
                            {client.name}
                          </div>
                          <Pencil className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {client.createdAt?.toDate ? new Date(client.createdAt.toDate()).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteClient(client.id, client.name)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 協力者管理セクション */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">協力者管理</h2>
          <button
            onClick={() => setShowCollaboratorForm(!showCollaboratorForm)}
            className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            {showCollaboratorForm ? 'キャンセル' : '協力者を追加'}
          </button>
        </div>

        {/* 新規協力者追加フォーム */}
        {showCollaboratorForm && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex gap-2 items-center">
              <Users className="w-5 h-5 text-gray-600" />
              <input
                type="text"
                value={newCollaboratorName}
                onChange={(e) => setNewCollaboratorName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateCollaborator();
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                placeholder="協力者名を入力"
                autoFocus
              />
              <button
                onClick={handleCreateCollaborator}
                disabled={!newCollaboratorName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* 協力者エラー表示 */}
        {collaboratorError && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
            <div className="text-rose-800 font-medium">エラー</div>
            <div className="text-rose-600 text-sm mt-1">{collaboratorError}</div>
          </div>
        )}

        {/* 協力者一覧 */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {collaboratorsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-slate-500">読み込み中...</div>
            </div>
          ) : collaborators.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-slate-500">協力者が登録されていません</div>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">協力者名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">登録日</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {collaborators.map((collaborator) => (
                  <tr key={collaborator.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {editingCollaboratorId === collaborator.id ? (
                        <div className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-gray-600" />
                          <input
                            type="text"
                            value={editingCollaboratorName}
                            onChange={(e) => setEditingCollaboratorName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleUpdateCollaborator(collaborator.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEditCollaborator();
                              }
                            }}
                            className="flex-1 px-2 py-1 text-sm border border-gray-400 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateCollaborator(collaborator.id)}
                            disabled={!editingCollaboratorName.trim()}
                            className="p-1 text-teal-600 hover:bg-teal-50 rounded transition-colors disabled:opacity-50"
                            title="保存"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancelEditCollaborator}
                            className="p-1 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                            title="キャンセル"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 rounded px-2 py-1 -mx-2 -my-1 transition-colors"
                          onClick={() => handleStartEditCollaborator(collaborator)}
                        >
                          <Users className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                          <div className="text-sm font-medium text-slate-900 group-hover:text-slate-600 transition-colors flex-1">
                            {collaborator.name}
                          </div>
                          <Pencil className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {collaborator.createdAt?.toDate ? new Date(collaborator.createdAt.toDate()).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteCollaborator(collaborator.id, collaborator.name)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 招待モーダル */}
      <OrgMemberInvitationModal
        open={invitationModalOpen}
        onClose={() => setInvitationModalOpen(false)}
        onSubmit={handleCreateInvitation}
        currentMemberCount={users.filter(u => u.isActive).length}
        currentUserRole={currentUserRole || undefined}
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
        onDelete={handleDeleteUser}
      />
    </div >
  );
}
