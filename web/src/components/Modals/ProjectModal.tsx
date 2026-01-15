import React, { useState, useEffect } from 'react';
import { Modal, ModalProps } from './Modal';
import type { ToastMessage } from '../ToastStack';

type ToastInput = {
  tone: ToastMessage['tone'];
  title: string;
  description?: string;
  duration?: number;
};

export interface ProjectModalProps extends ModalProps {
  onSubmit(payload: {
    物件名: string;
    開始日?: string;
    予定完了日?: string;
    現地調査日?: string;
    着工日?: string;
    竣工予定日?: string;
    ステータス: string;
    優先度: string;
  }): Promise<void>;
  onNotify?(message: ToastInput): void;
}

export function ProjectModal({ open, onOpenChange, onSubmit, onNotify }: ProjectModalProps) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [surveyDate, setSurveyDate] = useState('');
  const [constructionStart, setConstructionStart] = useState('');
  const [completionDate, setCompletionDate] = useState('');
  const [status, setStatus] = useState('計画中');
  const [priority, setPriority] = useState('中');

  useEffect(() => {
    if (!open) return;
    setName('');
    setStart('');
    setDue('');
    setSurveyDate('');
    setConstructionStart('');
    setCompletionDate('');
    setStatus('計画中');
    setPriority('中');
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit({
        物件名: name,
        開始日: start,
        予定完了日: due,
        現地調査日: surveyDate,
        着工日: constructionStart,
        竣工予定日: completionDate,
        ステータス: status,
        優先度: priority,
      });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      onNotify?.({ tone: 'error', title: 'プロジェクトの追加に失敗しました' });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="プロジェクト追加">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-xs text-slate-500">物件名</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700">スケジュール</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">開始日</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">予定完了日</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>
          <div className="text-sm font-semibold text-slate-700 pt-2">マイルストーン</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">現地調査日</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={surveyDate}
                onChange={(e) => setSurveyDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">着工日</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={constructionStart}
                onChange={(e) => setConstructionStart(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">竣工予定日</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">ステータス</label>
            <select
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="計画中">計画中</option>
              <option value="設計中">設計中</option>
              <option value="見積">見積</option>
              <option value="実施中">実施中</option>
              <option value="完了">完了</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">優先度</label>
            <select
              className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </div>
        </div>
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
