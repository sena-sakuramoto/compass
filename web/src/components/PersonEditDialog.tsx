import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Person } from '../lib/types';

interface PersonEditDialogProps {
  person: Person | null;
  onClose: () => void;
  onSave: (person: Person) => Promise<void>;
}

export function PersonEditDialog({ person, onClose, onSave }: PersonEditDialogProps) {
  const [formData, setFormData] = useState<Partial<Person>>({
    type: 'person',
    氏名: '',
    メール: '',
    役割: '',
    部署: '',
    会社名: '',
    電話: '',
    '稼働時間/日(h)': undefined,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (person) {
      setFormData({
        ...person,
        type: person.type || 'person', // デフォルトは担当者
      });
    } else {
      setFormData({
        type: 'person',
        氏名: '',
        メール: '',
        役割: '',
        部署: '',
        会社名: '',
        電話: '',
        '稼働時間/日(h)': undefined,
      });
    }
  }, [person]);

  const handleSave = async () => {
    if (!person || !formData.氏名?.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...person, ...formData } as Person);
      onClose();
    } catch (error) {
      console.error('Failed to save person:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!person) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">
            {formData.type === 'client' ? 'クライアント編集' : '担当者編集'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="space-y-4">
          {/* タイプ選択 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">タイプ *</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="personType"
                  value="person"
                  checked={formData.type === 'person'}
                  onChange={() => setFormData({ ...formData, type: 'person' })}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-slate-700">担当者</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="personType"
                  value="client"
                  checked={formData.type === 'client'}
                  onChange={() => setFormData({ ...formData, type: 'client' })}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-slate-700">クライアント</span>
              </label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">氏名 *</label>
            <input
              type="text"
              value={formData.氏名 || ''}
              onChange={(e) => setFormData({ ...formData, 氏名: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">メール</label>
            <input
              type="email"
              value={formData.メール || ''}
              onChange={(e) => setFormData({ ...formData, メール: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">役割</label>
            <input
              type="text"
              value={formData.役割 || ''}
              onChange={(e) => setFormData({ ...formData, 役割: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {formData.type === 'person' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">部署</label>
              <input
                type="text"
                value={formData.部署 || ''}
                onChange={(e) => setFormData({ ...formData, 部署: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {formData.type === 'client' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">会社名</label>
              <input
                type="text"
                value={formData.会社名 || ''}
                onChange={(e) => setFormData({ ...formData, 会社名: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                placeholder="例: 株式会社〇〇"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">電話</label>
            <input
              type="tel"
              value={formData.電話 || ''}
              onChange={(e) => setFormData({ ...formData, 電話: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {formData.type === 'person' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">稼働時間/日(h)</label>
              <input
                type="number"
                step="0.5"
                value={formData['稼働時間/日(h)'] || ''}
                onChange={(e) => setFormData({ ...formData, '稼働時間/日(h)': e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formData.氏名?.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

