import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface Project {
  id: string;
  物件名: string;
  クライアント?: string;
  LS担当者?: string;
  自社PM?: string;
  ステータス: string;
  優先度?: string;
  開始日?: string;
  予定完了日?: string;
  '所在地/現地'?: string;
  '所在地_現地'?: string;
  'フォルダURL'?: string;
  備考?: string;
}

interface ProjectEditDialogProps {
  project: Project | null;
  onClose: () => void;
  onSave: (project: Project) => Promise<void>;
}

const STATUS_OPTIONS = ['未着手', '進行中', '確認待ち', '保留', '完了', '計画中', '見積', '実施中', '設計中'];
const PRIORITY_OPTIONS = ['高', '中', '低'];

export function ProjectEditDialog({ project, onClose, onSave }: ProjectEditDialogProps) {
  const [formData, setFormData] = useState<Project>({
    id: '',
    物件名: '',
    クライアント: '',
    LS担当者: '',
    自社PM: '',
    ステータス: '未着手',
    優先度: '中',
    開始日: '',
    予定完了日: '',
    '所在地/現地': '',
    '所在地_現地': '',
    'フォルダURL': '',
    備考: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setFormData(project);
    }
  }, [project]);

  if (!project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('プロジェクトの保存に失敗しました:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">プロジェクト編集</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 transition hover:bg-slate-100"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                プロジェクト名 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.物件名}
                onChange={(e) => setFormData({ ...formData, 物件名: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">ステータス</label>
                <select
                  value={formData.ステータス}
                  onChange={(e) => setFormData({ ...formData, ステータス: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">優先度</label>
                <select
                  value={formData.優先度 || '中'}
                  onChange={(e) => setFormData({ ...formData, 優先度: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">開始日</label>
                <input
                  type="date"
                  value={formData.開始日 || ''}
                  onChange={(e) => setFormData({ ...formData, 開始日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">予定完了日</label>
                <input
                  type="date"
                  value={formData.予定完了日 || ''}
                  onChange={(e) => setFormData({ ...formData, 予定完了日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">クライアント</label>
                <input
                  type="text"
                  value={formData.クライアント || ''}
                  onChange={(e) => setFormData({ ...formData, クライアント: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">LS担当者</label>
                <input
                  type="text"
                  value={formData.LS担当者 || ''}
                  onChange={(e) => setFormData({ ...formData, LS担当者: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">自社PM</label>
                <input
                  type="text"
                  value={formData.自社PM || ''}
                  onChange={(e) => setFormData({ ...formData, 自社PM: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">所在地/現地</label>
                <input
                  type="text"
                  value={formData['所在地/現地'] || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({
                      ...formData,
                      '所在地/現地': value,
                      '所在地_現地': value,
                    });
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">フォルダURL</label>
                <input
                  type="url"
                  value={formData['フォルダURL'] || ''}
                  onChange={(e) => setFormData({ ...formData, 'フォルダURL': e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">備考</label>
              <textarea
                value={formData.備考 || ''}
                onChange={(e) => setFormData({ ...formData, 備考: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              disabled={saving}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
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

