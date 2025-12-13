// プロジェクト招待モーダル

import React, { useState } from 'react';
import { X, Mail, UserPlus } from 'lucide-react';
import type { Project } from '../lib/types';

interface InvitationModalProps {
  open: boolean;
  projects: Project[];
  onClose: () => void;
  onSubmit: (data: { email: string; projectId: string; role: 'member' | 'guest'; message?: string }) => Promise<void>;
}

export function InvitationModal({ open, projects, onClose, onSubmit }: InvitationModalProps) {
  const [email, setEmail] = useState('');
  const [projectId, setProjectId] = useState('');
  const [role, setRole] = useState<'member' | 'guest'>('guest');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !projectId) {
      setError('メールアドレスとプロジェクトを選択してください');
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        email,
        projectId,
        role,
        message: message || undefined,
      });

      // Reset form
      setEmail('');
      setProjectId('');
      setRole('guest');
      setMessage('');
      onClose();
    } catch (err: any) {
      setError(err.message || '招待の作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-teal-100 p-2">
              <UserPlus className="h-5 w-5 text-teal-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">外部協力者を招待</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-4">
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
              <p className="mt-1 text-xs text-slate-500">
                招待先のメールアドレスを入力してください
              </p>
            </div>

            {/* プロジェクト選択 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                プロジェクト <span className="text-red-500">*</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
                required
              >
                <option value="">選択してください</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.物件名}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                招待するプロジェクトを選択してください
              </p>
            </div>

            {/* 権限選択 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                権限
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="radio"
                    name="role"
                    value="guest"
                    checked={role === 'guest'}
                    onChange={(e) => setRole(e.target.value as 'guest')}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">ゲスト（推奨）</div>
                    <div className="text-xs text-slate-500">
                      プロジェクトの閲覧と自分のタスク編集のみ可能
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="radio"
                    name="role"
                    value="member"
                    checked={role === 'member'}
                    onChange={(e) => setRole(e.target.value as 'member')}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">メンバー</div>
                    <div className="text-xs text-slate-500">
                      プロジェクトの編集と自分のタスク編集が可能
                    </div>
                  </div>
                </label>
              </div>
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
