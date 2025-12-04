import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Stage } from '../lib/types';
import type { StageInput } from '../lib/api';

interface StageDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: StageInput) => Promise<void>;
  stage?: Stage | null;
  projectId: string;
}

export function StageDialog({ open, onClose, onSave, stage }: StageDialogProps) {
  const [タスク名, setタスク名] = useState('');
  const [予定開始日, set予定開始日] = useState('');
  const [期限, set期限] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && stage) {
      setタスク名(stage.タスク名 || '');
      set予定開始日(stage.予定開始日 || '');
      set期限(stage.期限 || '');
    } else if (open) {
      setタスク名('');
      set予定開始日('');
      set期限('');
    }
    setError(null);
  }, [open, stage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!タスク名.trim()) {
      setError('工程名を入力してください');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave({
        タスク名: タスク名.trim(),
        予定開始日: 予定開始日 || null,
        期限: 期限 || null,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {stage ? '工程を編集' : '工程を追加'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              工程名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={タスク名}
              onChange={(e) => setタスク名(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="例: 基本設計"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              予定開始日
            </label>
            <input
              type="date"
              value={予定開始日}
              onChange={(e) => set予定開始日(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              期限
            </label>
            <input
              type="date"
              value={期限}
              onChange={(e) => set期限(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={saving}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
