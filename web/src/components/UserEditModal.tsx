import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { User } from '../lib/api';
import { ROLE_LABELS } from '../lib/auth-types';

interface UserEditModalProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onSubmit: (userId: string, updates: Partial<User>) => Promise<void>;
  onDelete?: (userId: string) => Promise<void> | void;
}

export function UserEditModal({ open, user, onClose, onSubmit, onDelete }: UserEditModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    displayName: '',
    role: 'viewer' as User['role'],
    department: '',
    jobTitle: '',
    phoneNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && open) {
      setFormData({
        email: user.email,
        displayName: user.displayName || '',
        role: user.role || 'viewer',
        department: user.department || '',
        jobTitle: user.jobTitle || '',
        phoneNumber: user.phoneNumber || '',
      });
      setError(null);
    }
  }, [user, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      await onSubmit(user.id, formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 transition hover:bg-slate-100"
          aria-label="閉じる"
        >
          <X size={20} className="text-slate-600" />
        </button>

        <h2 className="mb-6 text-xl font-bold text-slate-900">ユーザー編集</h2>

        {error && (
          <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3">
            <div className="text-sm text-rose-800">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                メールアドレス <span className="text-rose-600">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                表示名
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              役割 <span className="text-rose-600">*</span>
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as User['role'] })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              required
            >
              {Object.entries(ROLE_LABELS)
                .filter(([role]) => role !== 'super_admin') // スーパー管理者は除外
                .map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                部署
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                職種
              </label>
              <input
                type="text"
                value={formData.jobTitle}
                onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                電話番号
              </label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-200">
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('このユーザーを削除しますか？この操作は取り消せません。')) {
                    onDelete(user.id);
                  }
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 transition"
              >
                削除
              </button>
            )}
            <div className="flex gap-3 ml-auto">
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
                {loading ? '更新中...' : '更新'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
