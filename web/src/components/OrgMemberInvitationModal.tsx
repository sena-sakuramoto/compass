// 組織メンバー招待モーダル

import React, { useState, useEffect } from 'react';
import { X, Mail, UserPlus, Users, Info } from 'lucide-react';

type Role = 'admin' | 'project_manager' | 'sales' | 'designer' | 'site_manager' | 'worker' | 'viewer';

interface MemberStats {
  members: {
    current: number;
    max: number;
    available: number;
  };
}

interface OrgMemberInvitationModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    email: string;
    displayName?: string;
    role: Role;
    message?: string;
  }) => Promise<void>;
  currentMemberCount?: number;
  currentUserRole?: string;
}

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'admin', label: '組織管理者', description: '組織全体を管理し、メンバーを招待できます' },
  { value: 'project_manager', label: 'プロジェクトマネージャー', description: 'プロジェクトを管理し、タスクを作成できます' },
  { value: 'sales', label: '営業', description: 'プロジェクトとタスクを管理できます' },
  { value: 'designer', label: '設計', description: 'タスクを作成・編集できます' },
  { value: 'site_manager', label: '施工管理', description: 'タスクを作成・編集できます' },
  { value: 'worker', label: '職人', description: '自分のタスクのみ編集できます' },
  { value: 'viewer', label: '閲覧者', description: 'プロジェクトとタスクを閲覧できます' },
];

export function OrgMemberInvitationModal({
  open,
  onClose,
  onSubmit,
  currentMemberCount = 0,
  currentUserRole
}: OrgMemberInvitationModalProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<MemberStats | null>(null);

  // 招待者のロールに応じてロール選択肢をフィルタリング
  const availableRoleOptions = ROLE_OPTIONS.filter(option => {
    // admin は admin や super_admin を招待できない
    if (currentUserRole === 'admin') {
      return option.value !== 'admin';
    }
    // それ以外（super_admin や project_manager）は全て招待可能
    return true;
  });

  useEffect(() => {
    if (open) {
      loadStats();
    }
  }, [open]);

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('apdw_id_token');
      const response = await fetch('/api/org-invitations/stats', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('メールアドレスを入力してください');
      return;
    }

    // 人数制限チェック
    if (stats && stats.members.available <= 0) {
      setError(`メンバー数が上限（${stats.members.max}人）に達しています`);
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        email,
        displayName: displayName || undefined,
        role,
        message: message || undefined,
      });

      // Reset form
      setEmail('');
      setDisplayName('');
      setRole('viewer');
      setMessage('');
      onClose();
      await loadStats(); // 統計を更新
    } catch (err: any) {
      setError(err.message || '招待の作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const selectedRole = availableRoleOptions.find(r => r.value === role);

  // 表示用の残り人数を計算
  const displayStats = stats ? {
    members: {
      ...stats.members,
      current: currentMemberCount,
      available: Math.max(0, stats.members.max - currentMemberCount)
    }
  } : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-teal-100 p-2">
              <UserPlus className="h-5 w-5 text-teal-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">メンバーを招待</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 現在の人数表示 */}
        {displayStats && (
          <div className="bg-slate-50 p-4 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-slate-600" />
              <span className="text-sm font-medium text-slate-700">現在の人数</span>
            </div>
            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <div className="text-xs text-slate-600 mb-1">メンバー</div>
              <div className="text-lg font-semibold text-slate-900">
                {displayStats.members.current} / {displayStats.members.max}人
              </div>
              <div className="text-xs text-slate-500 mt-1">
                残り {displayStats.members.available}人
              </div>
            </div>
          </div>
        )}

        {/* コンテンツ */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-5">
            {/* メールアドレス */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                メールアドレス <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@company.com"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
                  required
                />
              </div>
            </div>

            {/* 表示名 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                表示名
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="山田太郎"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
              />
            </div>

            {/* 役職選択 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                役職 <span className="text-red-500">*</span>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
                required
              >
                {availableRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {selectedRole && (
                <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded p-2">
                  {selectedRole.description}
                </p>
              )}
            </div>

            {/* メッセージ（任意） */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                メッセージ（任意）
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="招待に添えるメッセージを入力してください"
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
              />
            </div>
          </div>

          {/* フッター */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? '送信中...' : '招待を送信'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
