import React, { useState, useEffect } from 'react';
import { Modal, ModalProps } from './Modal';
import type { ToastMessage } from '../ToastStack';

type ToastInput = {
  tone: ToastMessage['tone'];
  title: string;
  description?: string;
  duration?: number;
};

export interface PersonModalProps extends ModalProps {
  onSubmit(payload: {
    type?: 'person' | 'client';
    氏名: string;
    役割?: string;
    部署?: string;
    会社名?: string;
    メール?: string;
    電話?: string;
    '稼働時間/日(h)'?: number;
  }): Promise<void>;
  onNotify?(message: ToastInput): void;
}

export function PersonModal({ open, onOpenChange, onSubmit, onNotify }: PersonModalProps) {
  const [personType, setPersonType] = useState<'person' | 'client'>('person');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [workingHours, setWorkingHours] = useState<number | ''>('');

  useEffect(() => {
    if (open) {
      setPersonType('person');
      setName('');
      setRole('');
      setDepartment('');
      setCompanyName('');
      setEmail('');
      setPhone('');
      setWorkingHours('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        type: personType,
        氏名: name,
        役割: role || undefined,
        部署: personType === 'person' ? (department || undefined) : undefined,
        会社名: personType === 'client' ? (companyName || undefined) : undefined,
        メール: email || undefined,
        電話: phone || undefined,
        '稼働時間/日(h)': personType === 'person' && workingHours ? Number(workingHours) : undefined,
      };
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      onNotify?.({ tone: 'error', title: `${personType === 'client' ? 'クライアント' : '担当者'}の追加に失敗しました` });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={personType === 'client' ? 'クライアント追加' : '担当者追加'}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-2 block text-xs text-slate-500">タイプ *</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="personType"
                value="person"
                checked={personType === 'person'}
                onChange={() => setPersonType('person')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-slate-700">担当者</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="personType"
                value="client"
                checked={personType === 'client'}
                onChange={() => setPersonType('client')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-slate-700">クライアント</span>
            </label>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">氏名 *</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="氏名"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">役割</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="役割"
          />
        </div>
        {personType === 'person' && (
          <div>
            <label className="mb-1 block text-xs text-slate-500">部署</label>
            <input
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="部署"
            />
          </div>
        )}
        {personType === 'client' && (
          <div>
            <label className="mb-1 block text-xs text-slate-500">会社名</label>
            <input
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="例: 株式会社〇〇"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-slate-500">メール</label>
          <input
            type="email"
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">電話</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="電話番号"
          />
        </div>
        {personType === 'person' && (
          <div>
            <label className="mb-1 block text-xs text-slate-500">稼働時間/日(h)</label>
            <input
              type="number"
              step="0.5"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value ? Number(e.target.value) : '')}
              placeholder="8"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="rounded-2xl border px-3 py-2" onClick={() => onOpenChange(false)}>
            キャンセル
          </button>
          <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            追加
          </button>
        </div>
      </form>
    </Modal>
  );
}
