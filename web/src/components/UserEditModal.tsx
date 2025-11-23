import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { User } from '../lib/api';

interface UserEditModalProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onSubmit: (userId: string, updates: Partial<User>) => Promise<void>;
}

export function UserEditModal({ open, user, onClose, onSubmit }: UserEditModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    displayName: '',
    role: 'viewer' as User['role'],
    memberType: 'member' as 'member' | 'guest',
    部署: '',
    職種: '',
    電話番号: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && open) {
      setFormData({
        email: user.email,
        displayName: user.displayName || '',
        role: user.role || 'viewer',
        memberType: (user.memberType as 'member' | 'guest') || 'member',
        部署: user.部署 || '',
        職種: user.職種 || '',
        電話番号: user.電話番号 || '',
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                メンバー種別 <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, memberType: 'member' })}
                  className={`rounded-lg border-2 p-3 text-sm font-medium transition ${
                    formData.memberType === 'member'
                      ? 'border-teal-600 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  メンバー
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, memberType: 'guest' })}
                  className={`rounded-lg border-2 p-3 text-sm font-medium transition ${
                    formData.memberType === 'guest'
                      ? 'border-purple-600 bg-purple-50 text-purple-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  ゲスト
                </button>
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
                <option value="admin">組織管理者</option>
                <option value="project_manager">プロジェクトマネージャー</option>
                <option value="viewer">閲覧者</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                部署
              </label>
              <input
                type="text"
                value={formData.部署}
                onChange={(e) => setFormData({ ...formData, 部署: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                職種
              </label>
              <input
                type="text"
                value={formData.職種}
                onChange={(e) => setFormData({ ...formData, 職種: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                電話番号
              </label>
              <input
                type="tel"
                value={formData.電話番号}
                onChange={(e) => setFormData({ ...formData, 電話番号: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
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
        </form>
      </div>
    </div>
  );
}
