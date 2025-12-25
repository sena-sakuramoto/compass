import React, { useState, useEffect, useMemo } from 'react';
import { Users, Building2, Link as LinkIcon, Copy, Check, Trash2, CreditCard } from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  listOrgBilling,
  updateOrgBilling,
  searchStripeCustomer,
  ApiError,
  sendStripeWelcomeEmails,
  type OrgBillingRecord,
  type StripeCustomerAdminRecord,
  type StripeCustomerSearchResult,
  type StripeLiveSubscription,
  type StripeWelcomeBulkResult,
  listStripeLiveSubscriptions,
} from '../lib/api';
import { resolveApiBase } from '../lib/apiBase';

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
  const [activeTab, setActiveTab] = useState<'invitations' | 'organizations' | 'billing' | 'migration'>('invitations');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [migrating, setMigrating] = useState(false);
  const [taskTypeMigrationResult, setTaskTypeMigrationResult] = useState<any>(null);
  const [migratingTaskTypes, setMigratingTaskTypes] = useState(false);
  const [stageTypeFixResult, setStageTypeFixResult] = useState<any>(null);
  const [fixingStageTypes, setFixingStageTypes] = useState(false);
  const [billingRecords, setBillingRecords] = useState<OrgBillingRecord[]>([]);
  const [stripeCustomers, setStripeCustomers] = useState<StripeCustomerAdminRecord[]>([]);
  const [billingForms, setBillingForms] = useState<Record<string, { planType: string; stripeCustomerId: string; notes: string }>>({});
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSaving, setBillingSaving] = useState<Record<string, boolean>>({});
  const [billingSearch, setBillingSearch] = useState('');
  const [stripeCustomerSearch, setStripeCustomerSearch] = useState('');
  const [stripeLiveSubs, setStripeLiveSubs] = useState<StripeLiveSubscription[]>([]);
  const [stripeLiveLoading, setStripeLiveLoading] = useState(false);
  const [stripeLiveError, setStripeLiveError] = useState<string | null>(null);
  const [stripeLookup, setStripeLookup] = useState({ customerId: '', discordId: '', email: '' });
  const [stripeLookupResult, setStripeLookupResult] = useState<StripeCustomerSearchResult | null>(null);
  const [stripeLookupLoading, setStripeLookupLoading] = useState(false);
  const [stripeLookupError, setStripeLookupError] = useState<string | null>(null);
  const [welcomeLimit, setWelcomeLimit] = useState(50);
  const [welcomeResend, setWelcomeResend] = useState(false);
  const [welcomeSending, setWelcomeSending] = useState(false);
  const [welcomeResult, setWelcomeResult] = useState<StripeWelcomeBulkResult | null>(null);
  const [welcomeError, setWelcomeError] = useState<string | null>(null);

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

  useEffect(() => {
    if (isSuperAdmin && activeTab === 'billing') {
      loadBillingRecords();
    }
  }, [isSuperAdmin, activeTab]);

  const loadInvitations = async () => {
    try {
      const token = await user?.getIdToken();
      const apiUrl = `${resolveApiBase()}/org-invitations`;
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

  const loadBillingRecords = async () => {
    try {
      setBillingLoading(true);
      const data = await listOrgBilling();
      setBillingRecords(data.records);
      setStripeCustomers(data.stripeCustomers ?? []);
      const initialForms: Record<string, { planType: string; stripeCustomerId: string; notes: string }> = {};
      data.records.forEach((record) => {
        initialForms[record.orgId] = {
          planType: record.planType || 'stripe',
          stripeCustomerId: record.stripeCustomerId ?? '',
          notes: record.notes ?? '',
        };
      });
      setBillingForms(initialForms);
    } catch (error) {
      console.error('[AdminPage] 課金情報の読み込みに失敗しました:', error);
    } finally {
      setBillingLoading(false);
    }
  };

  const handleBillingFormChange = (orgId: string, field: 'planType' | 'stripeCustomerId' | 'notes', value: string) => {
    setBillingForms((prev) => ({
      ...prev,
      [orgId]: {
        planType: prev[orgId]?.planType ?? 'stripe',
        stripeCustomerId: prev[orgId]?.stripeCustomerId ?? '',
        notes: prev[orgId]?.notes ?? '',
        [field]: value,
      },
    }));
  };

  const handleBillingSave = async (orgId: string) => {
    const form = billingForms[orgId];
    if (!form) return;

    if (form.planType === 'stripe' && !form.stripeCustomerId.trim()) {
      alert('Stripe カスタマーIDを入力してください');
      return;
    }

    setBillingSaving((prev) => ({ ...prev, [orgId]: true }));
    try {
      await updateOrgBilling(orgId, {
        planType: form.planType,
        stripeCustomerId: form.planType === 'stripe' ? form.stripeCustomerId.trim() : null,
        notes: form.notes?.trim() || null,
      });
      await loadBillingRecords();
      alert('課金情報を更新しました');
    } catch (error) {
      console.error('[AdminPage] 課金情報の更新に失敗しました:', error);
      alert('課金情報の更新に失敗しました');
    } finally {
      setBillingSaving((prev) => ({ ...prev, [orgId]: false }));
    }
  };

  const handleStripeLookupSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!stripeLookup.customerId && !stripeLookup.discordId && !stripeLookup.email) {
      setStripeLookupError('Customer ID / Discord ID / Email のいずれかを入力してください');
      setStripeLookupResult(null);
      return;
    }
    setStripeLookupLoading(true);
    setStripeLookupError(null);
    try {
      const result = await searchStripeCustomer({
        customerId: stripeLookup.customerId || undefined,
        discordId: stripeLookup.discordId || undefined,
        email: stripeLookup.email || undefined,
      });
      setStripeLookupResult(result);
    } catch (error) {
      console.error('[AdminPage] Stripe検索に失敗しました:', error);
      if (error instanceof ApiError) {
        setStripeLookupError(error.message);
      } else if (error instanceof Error) {
        setStripeLookupError(error.message);
      } else {
        setStripeLookupError('検索に失敗しました');
      }
      setStripeLookupResult(null);
    } finally {
      setStripeLookupLoading(false);
    }
  };

  const handleLoadStripeLiveSubs = async () => {
    setStripeLiveLoading(true);
    setStripeLiveError(null);
    try {
      const { subscriptions } = await listStripeLiveSubscriptions();
      setStripeLiveSubs(subscriptions);
    } catch (error) {
      console.error('[AdminPage] Stripe live subscriptions fetch failed:', error);
      if (error instanceof ApiError) {
        setStripeLiveError(error.message);
      } else if (error instanceof Error) {
        setStripeLiveError(error.message);
      } else {
        setStripeLiveError('取得に失敗しました');
      }
    } finally {
      setStripeLiveLoading(false);
    }
  };

  const handleSendWelcomeEmails = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setWelcomeSending(true);
    setWelcomeError(null);
    try {
      const result = await sendStripeWelcomeEmails({
        limit: welcomeLimit || 50,
        resend: welcomeResend,
      });
      setWelcomeResult(result);
    } catch (error) {
      console.error('[AdminPage] Bulk welcome email failed', error);
      if (error instanceof ApiError) {
        setWelcomeError(error.message);
      } else if (error instanceof Error) {
        setWelcomeError(error.message);
      } else {
        setWelcomeError('送信に失敗しました');
      }
    } finally {
      setWelcomeSending(false);
    }
  };

  const handleUseStripeEmailForInvite = (emailParam?: string) => {
    const resolvedEmail =
      emailParam ||
      stripeLookupResult?.stripeCustomer.emails?.[0] ||
      stripeLookupResult?.stripeCustomer.email;

    if (!resolvedEmail) {
      alert('Stripeに利用可能なメールアドレスが見つかりません');
      return;
    }

    setInviteForm((prev) => ({
      ...prev,
      email: resolvedEmail,
      orgId: stripeLookupResult?.billingRecord?.orgId || prev.orgId,
    }));
    setActiveTab('invitations');
    alert('招待フォームにメールアドレスをセットしました');
  };

  const loadOrganizations = async () => {
    try {
      const token = await user?.getIdToken();
      const apiUrl = `${resolveApiBase()}/organizations`;
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
        `${resolveApiBase()}/org-invitations`,
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
        `${resolveApiBase()}/organizations`,
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

  const handleMigrateTaskTypes = async () => {
    if (!confirm('タスクのtypeフィールドを移行しますか？type未設定のタスクに type=\'task\' を設定します。')) {
      return;
    }

    setMigratingTaskTypes(true);
    setTaskTypeMigrationResult(null);

    try {
      const token = await user?.getIdToken();
      const response = await fetch(
        `${resolveApiBase()}/admin/migrate-task-types`,
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
        setTaskTypeMigrationResult(result);
        alert(`移行完了！更新: ${result.stats.tasksUpdated}件`);
      } else {
        const error = await response.json();
        alert(`エラー: ${error.error || '移行に失敗しました'}`);
      }
    } catch (error) {
      console.error('Failed to migrate task types:', error);
      alert('移行に失敗しました');
    } finally {
      setMigratingTaskTypes(false);
    }
  };

  const handleFixStageTypes = async () => {
    if (!confirm('工程のtypeフィールドを修正しますか？子タスクから参照されているタスクを type=\'stage\' に更新します。')) {
      return;
    }

    setFixingStageTypes(true);
    setStageTypeFixResult(null);

    try {
      const token = await user?.getIdToken();
      const response = await fetch(
        `${resolveApiBase()}/admin/fix-stage-types`,
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
        setStageTypeFixResult(result);
        alert(`修正完了！修正: ${result.stats.stagesFixed}件`);
      } else {
        const error = await response.json();
        alert(`エラー: ${error.error || '修正に失敗しました'}`);
      }
    } catch (error) {
      console.error('Failed to fix stage types:', error);
      alert('修正に失敗しました');
    } finally {
      setFixingStageTypes(false);
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
        `${resolveApiBase()}/admin/migrate-clients`,
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
        `${resolveApiBase()}/org-invitations/${invitationId}`,
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

  const formatStripePeriod = (value?: number | null) => {
    if (!value) return '未設定';
    try {
      return new Date(value).toLocaleString('ja-JP');
    } catch (_error) {
      return String(value);
    }
  };

  const filteredBillingRecords = useMemo(() => {
    const keyword = billingSearch.trim().toLowerCase();
    if (!keyword) {
      return billingRecords;
    }
    return billingRecords.filter((record) => {
      const values = [
        record.orgId,
        record.orgName ?? '',
        record.stripeCustomerId ?? '',
        record.notes ?? '',
        record.planType ?? '',
        record.subscriptionStatus ?? '',
      ];
      return values.some((value) => value.toLowerCase().includes(keyword));
    });
  }, [billingRecords, billingSearch]);

  const filteredStripeCustomers = useMemo(() => {
    const keyword = stripeCustomerSearch.trim().toLowerCase();
    if (!keyword) {
      return stripeCustomers;
    }
    return stripeCustomers.filter((customer) => {
      const values = [
        customer.id,
        customer.email ?? '',
        ...(customer.emails ?? []),
        customer.discordId ?? '',
        customer.discordUserId ?? '',
        customer.discordAccounts?.join(' ') ?? '',
        customer.status ?? '',
        customer.linkedOrgId ?? '',
        customer.linkedOrgName ?? '',
        customer.productNames?.join(' ') ?? '',
      ];
      return values.some((value) => value.toLowerCase().includes(keyword));
    });
  }, [stripeCustomers, stripeCustomerSearch]);

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
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('billing')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'billing'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
            >
              <CreditCard className="inline-block h-4 w-4 mr-2" />
              課金プラン
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

        {activeTab === 'billing' && isSuperAdmin && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-2">課金プラン管理</h2>
                <p className="text-sm text-slate-600">
                  Stripeサブスクと法人プランの設定を管理します。planTypeが「stripe」の場合は Customer ID が必須です。
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  org_billing が未設定の組織は初期値として planType=Stripe で一覧表示されます。実際の運用プランに合わせて保存してください。
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <p className="text-xs text-slate-500">
                  組織名 / ID / Customer ID / メモで絞り込めます。未登録の組織もここから直接設定できます。
                </p>
                <div className="w-full sm:w-64">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">組織フィルタ</label>
                  <input
                    type="text"
                    value={billingSearch}
                    onChange={(event) => setBillingSearch(event.target.value)}
                    placeholder="例: archi / cus_1234"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">既存Stripeサブスク利用者</h3>
                  <p className="text-sm text-slate-600">
                    stripe_customers に保存されている既存の課金ユーザーです。org_billing への紐付け有無を確認できます。
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">サブスクユーザーフィルタ</label>
                  <input
                    type="text"
                    value={stripeCustomerSearch}
                    onChange={(event) => setStripeCustomerSearch(event.target.value)}
                    placeholder="email / cus_ / discord"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">組織作成案内メールの一斉送信</p>
                    <p className="text-xs text-slate-600">
                      active / trialing / entitled の Stripe 顧客に送信。既送信（welcomeEmailSentAtあり）は既定でスキップします。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <label className="flex items-center gap-1">
                      <span>最大件数</span>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={welcomeLimit}
                        onChange={(e) => setWelcomeLimit(Number(e.target.value) || 50)}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={welcomeResend}
                        onChange={(e) => setWelcomeResend(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span>既送信にも再送</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleSendWelcomeEmails}
                      disabled={welcomeSending}
                      className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {welcomeSending ? '送信中…' : '一斉送信'}
                    </button>
                  </div>
                </div>
                {welcomeError && <p className="text-xs text-rose-600">{welcomeError}</p>}
                {welcomeResult && (
                  <div className="text-xs text-slate-700 space-y-1">
                    <p>候補: {welcomeResult.totalCandidates} / 送信試行: {welcomeResult.attempted} / 成功: {welcomeResult.sent}</p>
                    <p>メールなしスキップ: {welcomeResult.skippedNoEmail} / 既送信スキップ: {welcomeResult.skippedAlreadySent}</p>
                    {welcomeResult.failures.length > 0 && (
                      <div className="text-rose-600">
                        失敗: {welcomeResult.failures.map((f) => `${f.customerId}: ${f.reason}`).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <button
                  type="button"
                  onClick={handleLoadStripeLiveSubs}
                  disabled={stripeLiveLoading}
                  className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-50"
                >
                  {stripeLiveLoading ? 'Stripeから取得中…' : 'Stripe本番から再取得'}
                </button>
                <span>※ 上のリストは Firestore のキャッシュ。Stripe本番を直接見る場合はボタンを押してください。</span>
                {stripeLiveError && <span className="text-rose-600">{stripeLiveError}</span>}
                {stripeLiveSubs.length > 0 && (
                  <span className="text-emerald-700 font-semibold">
                    Stripe本番: {stripeLiveSubs.length}件
                  </span>
                )}
              </div>
              {billingLoading ? (
                <p className="text-sm text-slate-500">Stripe利用者を読み込み中です…</p>
              ) : stripeCustomers.length === 0 ? (
                <p className="text-sm text-slate-500">既存サブスク利用者のデータが見つかりません。</p>
              ) : filteredStripeCustomers.length === 0 ? (
                <p className="text-sm text-amber-600">該当するサブスク利用者が見つかりません。</p>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto">
                  {filteredStripeCustomers.map((customer) => (
                    <div key={customer.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {customer.email || customer.emails?.[0] || 'メール未登録'}
                          </p>
                          <p className="text-xs font-mono text-slate-600">{customer.id}</p>
                          <p className="text-[11px] text-slate-500">
                            紐付け: {customer.linkedOrgName ? `${customer.linkedOrgName} (${customer.linkedOrgId})` : '未連携'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-semibold text-slate-800">
                            {customer.status || 'unknown'}
                          </span>
                          {customer.entitled ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                              entitled
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(customer.id)}
                            className="inline-flex items-center rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-white"
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            IDコピー
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-600">
                        <div>
                          <p className="font-semibold text-slate-700">メール候補</p>
                          <p className="text-slate-700">
                            {customer.emails && customer.emails.length > 0 ? customer.emails.join(', ') : '未登録'}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-700">Discord</p>
                          <p className="text-slate-700">
                            {customer.discordId ||
                              customer.discordUserId ||
                              (customer.discordAccounts?.length ? customer.discordAccounts.join(', ') : '未登録')}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-700">次回更新予定</p>
                          <p className="text-slate-700">{formatStripePeriod(customer.currentPeriodEnd)}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-700">商品</p>
                          <p className="text-slate-700">
                            {customer.productNames && customer.productNames.length > 0 ? customer.productNames.join(', ') : '未取得'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {stripeLiveSubs.length > 0 && (
                <div className="space-y-3 max-h-[420px] overflow-y-auto">
                  {stripeLiveSubs.map((sub) => (
                    <div key={sub.id} className="rounded-lg border border-indigo-200 bg-white p-4 space-y-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {sub.customer.email || sub.customer.name || sub.customer.id}
                        </p>
                        <p className="text-xs text-slate-500">
                          Status: {sub.status} / Customer: {sub.customer.id}
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-600">
                        <div>
                          <p className="font-semibold text-slate-700">名前</p>
                          <p className="text-slate-700">{sub.customer.name || '未登録'}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-700">商品</p>
                          <p className="text-slate-700">
                            {sub.productNames.length ? sub.productNames.join(', ') : '未取得'}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-700">次回更新</p>
                          <p className="text-slate-700">{formatStripePeriod(sub.currentPeriodEnd || undefined)}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-700">解約予定</p>
                          <p className="text-slate-700">
                            {sub.cancelAtPeriodEnd ? 'はい' : 'いいえ'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Stripe / Discord ユーザー検索</h3>
                <p className="text-sm text-slate-600">
                  Discord ID または Stripe Customer ID / Email から課金情報を検索し、メールアドレスの再登録や組織との紐付けに活用できます。
                </p>
              </div>
              <form onSubmit={handleStripeLookupSubmit} className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Stripe Customer ID</label>
                  <input
                    type="text"
                    value={stripeLookup.customerId}
                    onChange={(e) => setStripeLookup((prev) => ({ ...prev, customerId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="cus_XXXX"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Discord ID</label>
                  <input
                    type="text"
                    value={stripeLookup.discordId}
                    onChange={(e) => setStripeLookup((prev) => ({ ...prev, discordId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="123456789012345678"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={stripeLookup.email}
                    onChange={(e) => setStripeLookup((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="user@example.com"
                  />
                </div>
                <div className="md:col-span-3 flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={stripeLookupLoading}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {stripeLookupLoading ? '検索中...' : '検索する'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStripeLookup({ customerId: '', discordId: '', email: '' });
                      setStripeLookupResult(null);
                      setStripeLookupError(null);
                    }}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    条件をクリア
                  </button>
                  {stripeLookupError && <p className="text-sm text-rose-600">{stripeLookupError}</p>}
                </div>
              </form>
              {stripeLookupResult && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-sm text-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer ID</span>
                    <code className="rounded-md bg-white px-2 py-1 text-xs font-mono">{stripeLookupResult.stripeCustomer.id}</code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(stripeLookupResult.stripeCustomer.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-white"
                    >
                      <Copy className="h-3 w-3" />
                      コピー
                    </button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-500">メールアドレス</p>
                      <p className="font-medium">{stripeLookupResult.stripeCustomer.email || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Discord ID</p>
                      <p className="font-medium">
                        {stripeLookupResult.stripeCustomer.discordId || stripeLookupResult.stripeCustomer.discordUserId || '未登録'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">ステータス</p>
                      <p className="font-medium">{stripeLookupResult.stripeCustomer.status || 'unknown'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">次回更新予定</p>
                      <p className="font-medium">{formatStripePeriod(stripeLookupResult.stripeCustomer.currentPeriodEnd)}</p>
                    </div>
                  </div>
                  {(() => {
                    const emails =
                      stripeLookupResult.stripeCustomer.emails.length > 0
                        ? stripeLookupResult.stripeCustomer.emails
                        : stripeLookupResult.stripeCustomer.email
                          ? [stripeLookupResult.stripeCustomer.email]
                          : [];
                    return emails.length ? (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">登録メール候補</p>
                        <div className="flex flex-wrap gap-2">
                          {emails.map((email) => (
                            <div
                              key={email}
                              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs shadow-sm border border-slate-200"
                            >
                              <span className="font-medium text-slate-800">{email}</span>
                              <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(email)}
                                className="text-slate-500 hover:text-slate-900"
                                title="コピー"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUseStripeEmailForInvite(email)}
                                className="text-emerald-600 hover:text-emerald-700 font-semibold"
                              >
                                招待に使用
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {stripeLookupResult.stripeCustomer.discordAccounts.length > 1 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Discord候補</p>
                      <p className="text-xs text-slate-600">
                        {stripeLookupResult.stripeCustomer.discordAccounts.join(', ')}
                      </p>
                    </div>
                  )}
                  {stripeLookupResult.billingRecord ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <p className="text-xs font-semibold text-slate-500 mb-1">紐付いている組織</p>
                      <p className="font-medium">{stripeLookupResult.billingRecord.orgId}</p>
                      <p className="text-xs text-slate-500">
                        プラン: {stripeLookupResult.billingRecord.planType} / ステータス: {stripeLookupResult.billingRecord.subscriptionStatus || '未連携'}
                      </p>
                      {stripeLookupResult.organization && (
                        <p className="text-xs text-slate-500">組織名: {stripeLookupResult.organization.name || stripeLookupResult.billingRecord.orgId}</p>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-amber-600">
                      このCustomer IDはまだ org_billing に紐付いていません。該当組織のプランで Customer ID を設定してください。
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleUseStripeEmailForInvite()}
                      className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-slate-800"
                    >
                      招待フォームにメールをセット
                    </button>
                    {stripeLookupResult.stripeCustomer.email && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(stripeLookupResult.stripeCustomer.email || '')}
                        className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                      >
                        メールをコピー
                      </button>
                    )}
                  </div>
                </div>
              )}
              {stripeLookupResult && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Compass内のユーザー候補</p>
                    {stripeLookupResult.matchingUsers.length === 0 ? (
                      <p className="text-sm text-slate-500 mt-2">
                        同じメールアドレスで登録されたユーザーはまだ存在しません。
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {stripeLookupResult.matchingUsers.map((match) => (
                          <div key={match.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-900">{match.displayName || '（名前未設定）'}</span>
                              <span className="text-slate-500">{match.role || 'role不明'}</span>
                            </div>
                            <p className="font-mono text-slate-700">{match.email}</p>
                            <p className="text-slate-500">組織: {match.orgId}</p>
                            <p className="text-slate-500">
                              状態: {match.isActive ? '有効' : '無効'} / 種別: {match.memberType || '未設定'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {billingLoading ? (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 text-center text-sm text-slate-500">
                課金情報を読み込み中です…
              </div>
            ) : billingRecords.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 text-center text-sm text-slate-500">
                課金情報がまだ登録されていません
              </div>
            ) : filteredBillingRecords.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-amber-200 p-6 text-center text-sm text-amber-700">
                該当する組織が見つかりません。キーワードを変更するかクリアしてください。
              </div>
            ) : (
              <div className="space-y-4">
                {filteredBillingRecords.map((record) => {
                  const form = billingForms[record.orgId] || {
                    planType: record.planType || 'stripe',
                    stripeCustomerId: record.stripeCustomerId ?? '',
                    notes: record.notes ?? '',
                  };
                  return (
                    <div key={record.orgId} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-0.5">
                          <p className="text-base font-semibold text-slate-900">{record.orgName || '名称未設定の組織'}</p>
                          <p className="text-xs font-mono text-slate-500">{record.orgId}</p>
                          <p className="text-xs text-slate-500">
                            ステータス: {record.subscriptionStatus || '未連携'}
                            {record.planType ? ` / プラン: ${record.planType}` : null}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${record.hasBillingRecord
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                              }`}
                          >
                            {record.hasBillingRecord ? '登録済み' : '未設定'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleBillingSave(record.orgId)}
                            disabled={billingSaving[record.orgId]}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-50"
                          >
                            {billingSaving[record.orgId] ? '更新中...' : '保存'}
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">プラン種別</label>
                          <select
                            value={form.planType}
                            onChange={(e) => handleBillingFormChange(record.orgId, 'planType', e.target.value)}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="stripe">Stripeサブスク</option>
                            <option value="enterprise_manual">法人契約（請求書）</option>
                            <option value="special_admin">特例(管理者手動)</option>
                            <option value="inactive">停止</option>
                          </select>
                        </div>
                        {form.planType === 'stripe' && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Stripe Customer ID</label>
                            <input
                              type="text"
                              value={form.stripeCustomerId}
                              onChange={(e) => handleBillingFormChange(record.orgId, 'stripeCustomerId', e.target.value)}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="cus_XXXX"
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">メモ</label>
                        <textarea
                          value={form.notes}
                          onChange={(e) => handleBillingFormChange(record.orgId, 'notes', e.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="社内メモ、請求条件など"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 text-xs text-slate-500">
                        <div>
                          <p className="font-semibold text-slate-600">最終同期</p>
                          <p>{record.lastStripeSyncAt ? new Date(record.lastStripeSyncAt).toLocaleString('ja-JP') : '未同期'}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-600">プラン詳細</p>
                          {record.stripeSnapshot?.productNames?.length ? (
                            <p>{record.stripeSnapshot.productNames.join(', ')}</p>
                          ) : (
                            <p>取得できていません</p>
                          )}
                        </div>
                      </div>
                      {record.stripeCustomerId && (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>現在のCustomer ID:</span>
                            <span className="font-mono text-slate-900">{record.stripeCustomerId}</span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard.writeText(record.stripeCustomerId || '')}
                              className="inline-flex items-center rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-white"
                            >
                              コピー
                            </button>
                          </div>
                          <p className="mt-1 text-slate-500">
                            同期結果: {record.subscriptionStatus || '未取得'} / entitled:{' '}
                            {typeof record.entitled === 'boolean' ? (record.entitled ? 'true' : 'false') : 'unknown'}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'migration' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* タスクタイプ移行 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">タスクタイプ移行</h2>
              <p className="text-sm text-slate-600 mb-6">
                type フィールドが未設定のタスクに <code className="bg-slate-100 px-1 rounded">type='task'</code> を設定します。
                工程表（ガントチャート）の正常動作に必要です。
              </p>

              <button
                onClick={handleMigrateTaskTypes}
                disabled={migratingTaskTypes}
                className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {migratingTaskTypes ? '移行中...' : 'タスクタイプを移行する'}
              </button>

              {taskTypeMigrationResult && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-800">移行完了</p>
                  <div className="text-sm text-green-700 mt-2 space-y-1">
                    <p>総タスク数: {taskTypeMigrationResult.stats.total}件</p>
                    <p>更新: {taskTypeMigrationResult.stats.tasksUpdated}件</p>
                    {taskTypeMigrationResult.typeCounts && (
                      <div className="mt-2 pt-2 border-t border-green-200">
                        <p className="font-medium">タイプ分布:</p>
                        {Object.entries(taskTypeMigrationResult.typeCounts).map(([type, count]) => (
                          <p key={type}>{type}: {count as number}件</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 工程タイプ修正 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">工程タイプ修正</h2>
              <p className="text-sm text-slate-600 mb-6">
                子タスクから参照されているタスクを <code className="bg-slate-100 px-1 rounded">type='stage'</code> に更新します。
                工程がタスクとして表示されてしまう問題を修正します。
              </p>

              <button
                onClick={handleFixStageTypes}
                disabled={fixingStageTypes}
                className="w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fixingStageTypes ? '修正中...' : '工程タイプを修正する'}
              </button>

              {stageTypeFixResult && (
                <div className="mt-6 p-4 bg-violet-50 border border-violet-200 rounded-lg">
                  <p className="text-sm font-medium text-violet-800">修正完了</p>
                  <div className="text-sm text-violet-700 mt-2 space-y-1">
                    <p>総タスク数: {stageTypeFixResult.stats.total}件</p>
                    <p>修正: {stageTypeFixResult.stats.stagesFixed}件</p>
                    <p>既に工程: {stageTypeFixResult.stats.alreadyStages}件</p>
                    {stageTypeFixResult.typeCounts && (
                      <div className="mt-2 pt-2 border-t border-violet-200">
                        <p className="font-medium">タイプ分布:</p>
                        {Object.entries(stageTypeFixResult.typeCounts).map(([type, count]) => (
                          <p key={type}>{type}: {count as number}件</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* クライアントデータ移行 */}
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
