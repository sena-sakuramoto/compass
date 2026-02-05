import React, { useState, useEffect } from 'react';
import { Modal, ModalProps } from './Modal';
import type { ToastMessage } from '../ToastStack';
import type { Task } from '../../lib/types';

type ToastInput = {
  tone: ToastMessage['tone'];
  title: string;
  description?: string;
  duration?: number;
};

export interface StageEditModalProps extends ModalProps {
  stage: Task | null;
  onUpdate(stageId: string, updates: { タスク名?: string }): Promise<void>;
  onDelete(stageId: string): Promise<void>;
  onAddTask(stage: Task): void;
  onNotify?(message: ToastInput): void;
}

export function StageEditModal({
  open,
  onOpenChange,
  stage,
  onUpdate,
  onDelete,
  onAddTask,
  onNotify,
}: StageEditModalProps) {
  const [name, setName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && stage) {
      setName(stage.タスク名 || '');
      setIsDeleting(false);
      setIsSaving(false);
    }
  }, [open, stage]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stage) return;

    setIsSaving(true);
    try {
      await onUpdate(stage.id, { タスク名: name });
      onOpenChange(false);
      onNotify?.({ tone: 'success', title: '工程を更新しました' });
    } catch (err) {
      console.error(err);
      onNotify?.({ tone: 'error', title: '工程の更新に失敗しました' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!stage) return;
    if (!confirm(`工程「${stage.タスク名}」を削除しますか？\n\nこの工程に含まれるタスクは「未割り当て」になります。`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(stage.id);
      onOpenChange(false);
      onNotify?.({ tone: 'success', title: '工程を削除しました' });
    } catch (err) {
      console.error(err);
      onNotify?.({ tone: 'error', title: '工程の削除に失敗しました' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddTask = () => {
    if (!stage) return;
    onOpenChange(false);
    onAddTask(stage);
  };

  if (!stage) return null;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="工程の編集">
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">工程名</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={handleAddTask}
            className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          >
            + この工程にタスクを追加
          </button>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isDeleting ? '削除中...' : '削除'}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-2xl border px-4 py-2 text-sm"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
