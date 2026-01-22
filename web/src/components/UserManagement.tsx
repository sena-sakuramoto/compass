import { useState, useEffect } from 'react';
import { listUsers, updateUser, deactivateUser, activateUser, deleteUser, type User, listClients, createClient, updateClient, deleteClient, type Client, listCollaborators, createCollaborator, updateCollaborator, deleteCollaborator, type Collaborator, getSeatUsage, createBillingPortalSession, type SeatUsageInfo } from '../lib/api';
import { ROLE_LABELS } from '../lib/auth-types';
import { OrgMemberInvitationModal } from './OrgMemberInvitationModal';
import { UserEditModal } from './UserEditModal';
import type { Project } from '../lib/types';
import { Building2, Plus, Trash2, Check, X, Users, Pencil, Mail, UserPlus, ExternalLink, AlertCircle, Clock } from 'lucide-react';

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
  const [newCollaboratorEmail, setNewCollaboratorEmail] = useState('');
  const [showCollaboratorForm, setShowCollaboratorForm] = useState(false);
  const [editingCollaboratorId, setEditingCollaboratorId] = useState<string | null>(null);
  const [editingCollaboratorName, setEditingCollaboratorName] = useState('');
  const [editingCollaboratorEmail, setEditingCollaboratorEmail] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // 席数関連
  const [seatUsage, setSeatUsage] = useState<SeatUsageInfo | null>(null);
  const [seatLoading, setSeatLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    loadUsers();
    loadClients();
    loadCollaborators();
    loadCurrentUser();
    loadSeatUsage();
  }, []);

  useEffect(() => {
    console.log('[DEBUG] editingCollaboratorId changed:', editingCollaboratorId);
  }, [editingCollaboratorId]);

  useEffect(() => {
    console.log('[DEBUG] editingClientId changed:', editingClientId);
  }, [editingClientId]);

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

  async function loadSeatUsage() {
    try {
      setSeatLoading(true);
      const data = await getSeatUsage();
      setSeatUsage(data);
    } catch (err) {
      console.error('Failed to load seat usage:', err);
    } finally {
      setSeatLoading(false);
    }
  }

  async function handleOpenBillingPortal() {
    try {
      setPortalLoading(true);
      const result = await createBillingPortalSession(window.location.href);
      if (result.url) {
        window.open(result.url, '_blank');
      }
    } catch (err) {
      console.error('Failed to open billing portal:', err);
      setError('Stripeポータルを開けませんでした。管理者にお問い合わせください。');
    } finally {
      setPortalLoading(false);
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
    console.log('[DEBUG] loadCollaborators called', new Error().stack);
    try {
      setCollaboratorsLoading(true);
      setCollaboratorError(null);
      const data = await listCollaborators();
      console.log('[DEBUG] loadCollaborators response:', data);
      console.log('[DEBUG] collaborators array:', data.collaborators);
      if (data.collaborators && data.collaborators.length > 0) {
        console.log('[DEBUG] First collaborator sample:', data.collaborators[0]);
      }
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

    const tempId = `temp-${Date.now()}`;
    const optimisticClient: Client = {
      id: tempId,
      name: newClientName.trim(),
      createdAt: new Date(),
      createdBy: '',
      updatedAt: new Date(),
    };

    try {
      setClientError(null);
      // 楽観的更新: 先にUIを更新
      setClients(prev => [...prev, optimisticClient]);
      setNewClientName('');
      setShowClientForm(false);

      // APIを呼び出し
      const result = await createClient(newClientName.trim());

      // 一時IDを実際のIDに置き換え
      setClients(prev => prev.map(c => c.id === tempId ? result : c));
    } catch (err) {
      // 失敗したら楽観的更新を取り消し
      setClients(prev => prev.filter(c => c.id !== tempId));
      setClientError(err instanceof Error ? err.message : 'クライアントの作成に失敗しました');
      console.error('Failed to create client:', err);
      setShowClientForm(true);
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
    console.log('[DEBUG] handleStartEditClient called', client);
    setEditingClientId(client.id);
    setEditingClientName(client.name);
  }

  function handleCancelEditClient() {
    console.log('[DEBUG] handleCancelEditClient called - WHO CALLED ME?', new Error().stack);
    setEditingClientId(null);
    setEditingClientName('');
  }

  async function handleCreateCollaborator() {
    if (!newCollaboratorName.trim()) return;

    try {
      setCollaboratorError(null);
      const payload: any = {
        name: newCollaboratorName.trim(),
      };
      // メールアドレスが入力されている場合のみ送信
      if (newCollaboratorEmail.trim()) {
        payload.email = newCollaboratorEmail.trim();
      }
      await createCollaborator(payload);
      await loadCollaborators();
      setNewCollaboratorName('');
      setNewCollaboratorEmail('');
      setShowCollaboratorForm(false);
    } catch (err) {
      setCollaboratorError(err instanceof Error ? err.message : '協力者の作成に失敗しました');
      console.error('Failed to create collaborator:', err);
    }
  }

  async function handleUpdateCollaborator(collaboratorId: string) {
    console.log('[DEBUG] handleUpdateCollaborator called', collaboratorId, editingCollaboratorName, editingCollaboratorEmail);
    if (!editingCollaboratorName.trim()) {
      console.log('[DEBUG] handleUpdateCollaborator - name is empty, returning');
      return;
    }

    try {
      setCollaboratorError(null);
      console.log('[DEBUG] Calling API updateCollaborator...');
      const payload: any = {
        name: editingCollaboratorName.trim(),
      };
      // 更新時は常にemailフィールドを送信（クリアも可能にするため）
      payload.email = editingCollaboratorEmail.trim();
      console.log('[DEBUG] Update payload:', payload);
      await updateCollaborator(collaboratorId, payload);
      console.log('[DEBUG] API updateCollaborator succeeded');
      await loadCollaborators();
      setEditingCollaboratorId(null);
      setEditingCollaboratorName('');
      setEditingCollaboratorEmail('');
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
    console.log('[DEBUG] handleStartEditCollaborator called', collaborator);
    setEditingCollaboratorId(collaborator.id);
    setEditingCollaboratorName(collaborator.name);
    setEditingCollaboratorEmail(collaborator.email || '');
  }

  function handleCancelEditCollaborator() {
    console.log('[DEBUG] handleCancelEditCollaborator called - WHO CALLED ME?', new Error().stack);
    setEditingCollaboratorId(null);
    setEditingCollaboratorName('');
    setEditingCollaboratorEmail('');
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

      {/* 席数情報 */}
      {!seatLoading && seatUsage && (
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">契約席数</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${seatUsage.remaining <= 0 ? 'text-rose-600' : seatUsage.remaining <= 2 ? 'text-amber-600' : 'text-slate-900'}`}>
                  {seatUsage.current}
                </span>
                <span className="text-slate-500">/</span>
                <span className="text-xl font-semibold text-slate-700">{seatUsage.max}</span>
                <span className="text-sm text-slate-500 ml-1">席</span>
              </div>
              {seatUsage.remaining <= 0 && (
                <div className="flex items-center gap-1 text-rose-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>上限に達しています</span>
                </div>
              )}
              {seatUsage.remaining > 0 && seatUsage.remaining <= 2 && (
                <div className="flex items-center gap-1 text-amber-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>残り{seatUsage.remaining}席</span>
                </div>
              )}
              {seatUsage.seatInfo.isCircleMember && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  サークル会員（特典{seatUsage.seatInfo.circleBaseSeats}席）
                </span>
              )}
              {seatUsage.isTrialing && seatUsage.trialDaysRemaining !== null && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  <Clock className="w-3 h-3" />
                  トライアル残り{seatUsage.trialDaysRemaining}日
                </span>
              )}
            </div>
            {seatUsage.canManageSeats && (
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={handleOpenBillingPortal}
                  disabled={portalLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  {portalLoading ? '読込中...' : '席を追加'}
                  <ExternalLink className="w-3 h-3" />
                </button>
                <span className="text-xs text-slate-500">追加分は日割りで即時課金されます</span>
              </div>
            )}
          </div>
          {seatUsage.seatInfo.source === 'circle' && seatUsage.seatInfo.additionalSeats > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              内訳: サークル特典 {seatUsage.seatInfo.circleBaseSeats}席 + 追加購入 {seatUsage.seatInfo.additionalSeats}席
            </div>
          )}
        </div>
      )}

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
                    <td
                      className="px-4 py-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('[DEBUG] Client cell clicked', client.id, 'editing:', editingClientId);
                        if (editingClientId !== client.id) {
                          handleStartEditClient(client);
                        }
                      }}
                    >
                      {editingClientId === client.id ? (
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
                          className="w-full px-2 py-1 text-sm border border-slate-400 rounded focus:outline-none focus:ring-1 focus:ring-slate-500"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="text-sm font-medium text-slate-900">
                          {client.name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {client.createdAt?.toDate ? new Date(client.createdAt.toDate()).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {editingClientId === client.id ? (
                        <div className="flex items-center gap-2">
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
                        <button
                          onClick={() => handleDeleteClient(client.id, client.name)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <Users className="w-5 h-5 text-gray-600" />
                <input
                  type="text"
                  value={newCollaboratorName}
                  onChange={(e) => setNewCollaboratorName(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  placeholder="協力者名を入力 (必須)"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 items-center">
                <Mail className="w-5 h-5 text-gray-600" />
                <input
                  type="email"
                  value={newCollaboratorEmail}
                  onChange={(e) => setNewCollaboratorEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateCollaborator();
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  placeholder="メールアドレス (任意)"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCreateCollaborator}
                  disabled={!newCollaboratorName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  追加
                </button>
              </div>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">メールアドレス</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">登録日</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {collaborators.map((collaborator) => (
                  <tr key={collaborator.id} className="hover:bg-slate-50">
                    <td
                      className="px-4 py-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('[DEBUG] Collaborator cell clicked', collaborator.id, 'editing:', editingCollaboratorId);
                        if (editingCollaboratorId !== collaborator.id) {
                          handleStartEditCollaborator(collaborator);
                        }
                      }}
                    >
                      {editingCollaboratorId === collaborator.id ? (
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
                          className="w-full px-2 py-1 text-sm border border-gray-400 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="text-sm font-medium text-slate-900">
                          {collaborator.name}
                        </div>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('[DEBUG] Collaborator cell clicked', collaborator.id, 'editing:', editingCollaboratorId);
                        if (editingCollaboratorId !== collaborator.id) {
                          handleStartEditCollaborator(collaborator);
                        }
                      }}
                    >
                      {editingCollaboratorId === collaborator.id ? (
                        <input
                          type="email"
                          value={editingCollaboratorEmail}
                          onChange={(e) => setEditingCollaboratorEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleUpdateCollaborator(collaborator.id);
                            } else if (e.key === 'Escape') {
                              handleCancelEditCollaborator();
                            }
                          }}
                          className="w-full px-2 py-1 text-sm border border-gray-400 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                          placeholder="メールアドレス (任意)"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="text-sm text-slate-600">
                          {collaborator.email || '-'}
                          {collaborator.linkedUser && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              <Building2 className="w-3 h-3" />
                              {collaborator.linkedUser.orgName}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {collaborator.createdAt?.toDate ? new Date(collaborator.createdAt.toDate()).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {editingCollaboratorId === collaborator.id ? (
                        <div className="flex items-center gap-2">
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
                        <button
                          onClick={() => handleDeleteCollaborator(collaborator.id, collaborator.name)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
