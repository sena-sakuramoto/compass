import React, { useState, useEffect } from 'react';
import { Users, Building2, Link as LinkIcon, Copy, Check, Trash2 } from 'lucide-react';
import type { User } from 'firebase/auth';

interface AdminPageProps {
  user: User | null;
  currentUserRole?: string;
}

interface Invitation {
  id: string;
  email: string;
  displayName?: string;
  orgId: string;
  role: string;
  invitedByName: string;
  invitedAt: any;
  expiresAt: any;
  status: string;
  inviteLink?: string;
}

interface Organization {
  id: string;
  name: string;
  ownerId: string;
  createdAt: any;
}

export function AdminPage({ user, currentUserRole }: AdminPageProps) {
  const [activeTab, setActiveTab] = useState<'invitations' | 'organizations' | 'migration'>('invitations');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [migrating, setMigrating] = useState(false);

  // 招待フォームの状態
  const [inviteForm, setInviteForm] = useState({
    email: '',
    displayName: '',
    orgId: '',
    role: 'admin',
    message: '',
    expiresInDays: 7,
  });

  // 組織作成フォームの状態
  const [orgForm, setOrgForm] = useState({
    id: '',
    name: '',
  });

  const isSuperAdmin = currentUserRole === 'super_admin';
  const canManage = isSuperAdmin;

  // デバッグログ
  console.log('========== AdminPage デバッグ情報 ==========');
  console.log('currentUserRole:', currentUserRole);
  console.log('isSuperAdmin:', isSuperAdmin);
  console.log('canManage:', canManage);
  console.log('user:', user);
  console.log('==========================================');

  useEffect(() => {
    if (canManage) {
      console.log('[AdminPage] 招待リストを読み込み中...');
      loadInvitations();
      // 組織リストは招待フォームで使用するため、常に読み込む
      console.log('[AdminPage] 組織リストを読み込み中...');
      loadOrganizations();
    } else {
      console.warn('[AdminPage] canManage=false のため、データを読み込みません');
    }
  }, [canManage]);

  const loadInvitations = async () => {
    try {
      const token = await user?.getIdToken();
      const apiUrl = `${import.meta.env.VITE_API_BASE_URL || 'https://api-g3xwwspyla-an.a.run.app'}/api/org-invitations`;
      console.log('[AdminPage] 招待リスト取得 URL:', apiUrl);

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('[AdminPage] 招待リスト取得 Response:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('[AdminPage] 招待リスト取得成功:', data);
        setInvitations(data);
      } else {
        const errorText = await response.text();
        console.error('[AdminPage] 招待リスト取得失敗:', response.status, errorText);
      }
    } catch (error) {
      console.error('[AdminPage] 招待リスト取得エラー:', error);
    }
  };

  const loadOrganizations = async () => {
    try {
      const token = await user?.getIdToken();
      const apiUrl = `${import.meta.env.VITE_API_BASE_URL || 'https://api-g3xwwspyla-an.a.run.app'}/api/organizations`;
      console.log('[AdminPage] 組織リスト取得 URL:', apiUrl);

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('[AdminPage] 組織リスト取得 Response:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('[AdminPage] 組織リスト取得成功:', data);
        setOrganizations(data);
      } else {
        const errorText = await response.text();
        console.error('[AdminPage] 組織リスト取得失敗:', response.status, errorText);
      }
    } catch (error) {
      console.error('[AdminPage] 組織リスト取得エラー:', error);
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = await user?.getIdToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'https://api-g3xwwspyla-an.a.run.app'}/api/org-invitations`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(inviteForm),
        }
      );

      if (response.ok) {
        const newInvitation = await response.json();
        setInvitations([newInvitation, ...invitations]);
        setInviteForm({
          email: '',
          displayName: '',
          orgId: '',
          role: 'admin',
          message: '',
          expiresInDays: 7,
        });
        alert('招待リンクを作成しました！');
      } else {
        const error = await response.json();
        alert(`エラー: ${error.message || error.error}`);
      }
    } catch (error) {
      console.error('Failed to create invitation:', error);
      alert('招待リンクの作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = await user?.getIdToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'https://api-g3xwwspyla-an.a.run.app'}/api/organizations`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(orgForm),
        }
      );

      if (response.ok) {
        const newOrg = await response.json();
        setOrganizations([...organizations, newOrg]);
        setOrgForm({ id: '', name: '' });
        alert('組織を作成しました！');
      } else {
        const error = await response.json();
        alert(`エラー: ${error.message || error.error}`);
      }
    } catch (error) {
      console.error('Failed to create organization:', error);
      alert('組織の作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateClients = async () => {
    if (!confirm('クライアントデータを移行しますか？この操作は元に戻せません。')) {
      return;
    }

    setMigrating(true);
    setMigrationResult(null);

    try {
      const token = await user?.getIdToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'https://api-g3xwwspyla-an.a.run.app'}/api/admin/migrate-clients`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        setMigrationResult(result);
        alert(`移行完了！移行: ${result.stats.migrated}件、スキップ: ${result.stats.skipped}件`);
      } else {
        const error = await response.json();
        alert(`エラー: ${error.error || '移行に失敗しました'}`);
      }
    } catch (error) {
      console.error('Failed to migrate clients:', error);
      alert('移行に失敗しました');
    } finally {
      setMigrating(false);
    }
  };

  const copyInviteLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleDeleteInvitation = async (invitationId: string) => {
    if (!confirm('この招待を削除しますか？')) {
      return;
    }

    try {
      const token = await user?.getIdToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'https://api-g3xwwspyla-an.a.run.app'}/api/org-invitations/${invitationId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        setInvitations(invitations.filter(inv => inv.id !== invitationId));
        alert('招待を削除しました');
      } else {
        const error = await response.json();
        alert(`エラー: ${error.error || '削除に失敗しました'}`);
      }
    } catch (error) {
      console.error('Failed to delete invitation:', error);
      alert('削除に失敗しました');
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('ja-JP');
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      super_admin: 'スーパー管理者',
      admin: '組織管理者',
      project_manager: 'プロジェクトマネージャー',
      sales: '営業',
      designer: '設計',
      site_manager: '施工管理',
      worker: '職人',
      viewer: '閲覧者',
    };
    return labels[role] || role;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: '招待中',
      accepted: '受け入れ済み',
      expired: '期限切れ',
      revoked: '取り消し済み',
    };
    return labels[status] || status;
  };

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">アクセス権限がありません</h2>
          <p className="text-slate-600">管理者のみがこのページにアクセスできます。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-slate-900">管理画面</h1>
        <p className="text-sm text-slate-600 mt-1">
          {isSuperAdmin ? 'スーパー管理者として全ての管理機能にアクセスできます' : '組織管理者として招待リンクを作成できます'}
        </p>
      </div>

      {/* タブ */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('invitations')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'invitations'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <Users className="inline-block h-4 w-4 mr-2" />
            招待管理
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('organizations')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'organizations'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
            >
              <Building2 className="inline-block h-4 w-4 mr-2" />
              組織管理
            </button>
          )}
          <button
            onClick={() => setActiveTab('migration')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'migration'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            データ移行
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'invitations' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 招待フォーム */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">新規招待</h2>
              <form onSubmit={handleCreateInvitation} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    メールアドレス <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">表示名</label>
                  <input
                    type="text"
                    value={inviteForm.displayName}
                    onChange={(e) => setInviteForm({ ...inviteForm, displayName: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="山田太郎"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    組織 <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={inviteForm.orgId}
                    onChange={(e) => setInviteForm({ ...inviteForm, orgId: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  >
                    <option value="">組織を選択してください</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    ロール <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="admin">組織管理者</option>
                    <option value="project_manager">プロジェクトマネージャー</option>
                    <option value="sales">営業</option>
                    <option value="designer">設計</option>
                    <option value="site_manager">施工管理</option>
                    <option value="worker">職人</option>
                    <option value="viewer">閲覧者</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">有効期限（日数）</label>
                  <input
                    type="number"
                    value={inviteForm.expiresInDays}
                    onChange={(e) => setInviteForm({ ...inviteForm, expiresInDays: parseInt(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    min="1"
                    max="30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">メッセージ</label>
                  <textarea
                    value={inviteForm.message}
                    onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="招待メッセージ（任意）"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? '作成中...' : '招待リンクを作成'}
                </button>
              </form>
            </div>

            {/* 招待リスト */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">招待リスト</h2>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {invitations.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">招待がありません</p>
                ) : (
                  invitations.map((invitation) => (
                    <div key={invitation.id} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-slate-900">{invitation.displayName || invitation.email}</p>
                          <p className="text-xs text-slate-500">{invitation.email}</p>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${invitation.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : invitation.status === 'accepted'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-slate-100 text-slate-800'
                            }`}
                        >
                          {getStatusLabel(invitation.status)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-3">
                        <div>組織: {invitation.orgId}</div>
                        <div>ロール: {getRoleLabel(invitation.role)}</div>
                        <div>招待者: {invitation.invitedByName}</div>
                        <div>期限: {formatDate(invitation.expiresAt)}</div>
                      </div>
                      {invitation.status === 'pending' && (
                        <div className="flex gap-2">
                          {invitation.inviteLink && (
                            <button
                              onClick={() => copyInviteLink(invitation.inviteLink!, invitation.id)}
                              className="flex-1 flex items-center justify-center gap-2 rounded bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                            >
                              {copiedLink === invitation.id ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  コピーしました
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  招待リンクをコピー
                                </>
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteInvitation(invitation.id)}
                            className="flex items-center justify-center gap-2 rounded bg-red-100 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-200"
                          >
                            <Trash2 className="h-3 w-3" />
                            削除
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'organizations' && isSuperAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 組織作成フォーム */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">新規組織</h2>
              <form onSubmit={handleCreateOrganization} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    組織ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgForm.id}
                    onChange={(e) => setOrgForm({ ...orgForm, id: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="company-name"
                    pattern="[a-z0-9-]+"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">小文字英数字とハイフンのみ使用可能</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    組織名 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgForm.name}
                    onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="株式会社〇〇"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? '作成中...' : '組織を作成'}
                </button>
              </form>
            </div>

            {/* 組織リスト */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">組織リスト</h2>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {organizations.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">組織がありません</p>
                ) : (
                  organizations.map((org) => (
                    <div key={org.id} className="border border-slate-200 rounded-lg p-4">
                      <p className="font-medium text-slate-900">{org.name}</p>
                      <p className="text-xs text-slate-500 mt-1">ID: {org.id}</p>
                      <p className="text-xs text-slate-500">作成日: {formatDate(org.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'migration' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">クライアントデータ移行</h2>
              <p className="text-sm text-slate-600 mb-6">
                既存の `/api/clients` に保存されているクライアントデータを、新しい People 管理システム（type='client'）に移行します。
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-800 font-medium">注意事項：</p>
                <ul className="text-sm text-amber-700 mt-2 space-y-1 list-disc list-inside">
                  <li>この操作は元に戻せません</li>
                  <li>既に移行済みのクライアントはスキップされます</li>
                  <li>元のデータは削除されず、保持されます</li>
                </ul>
              </div>

              <button
                onClick={handleMigrateClients}
                disabled={migrating}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {migrating ? '移行中...' : 'クライアントデータを移行する'}
              </button>

              {migrationResult && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-800">✅ 移行完了</p>
                  <div className="text-sm text-green-700 mt-2 space-y-1">
                    <p>総数: {migrationResult.stats.total}件</p>
                    <p>移行: {migrationResult.stats.migrated}件</p>
                    <p>スキップ: {migrationResult.stats.skipped}件</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
