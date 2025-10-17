// タスク詳細ダイアログ

import React, { useState } from 'react';
import { X, Calendar, Bell, User, Clock, CheckCircle2 } from 'lucide-react';
import type { Task, TaskNotificationSettings } from '../lib/types';

interface TaskDetailDialogProps {
  task: Task;
  onClose: () => void;
  onUpdate: (updates: Partial<Task>) => Promise<void>;
  onCalendarSync?: () => Promise<void>;
  onSeedReminders?: () => Promise<void>;
}

export function TaskDetailDialog({
  task,
  onClose,
  onUpdate,
  onCalendarSync,
  onSeedReminders,
}: TaskDetailDialogProps) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    タスク名: task.タスク名,
    担当者: task.担当者 || '',
    担当者メール: task.担当者メール || '',
    予定開始日: task.予定開始日 || '',
    期限: task.期限 || '',
    ステータス: task.ステータス,
    優先度: task.優先度 || '',
    '工数見積(h)': task['工数見積(h)'] || 0,
    '工数実績(h)': task['工数実績(h)'] || 0,
  });

  const [notificationSettings, setNotificationSettings] = useState<TaskNotificationSettings>(
    task['通知設定'] || {
      開始日: true,
      期限前日: true,
      期限当日: true,
      超過: true,
    }
  );

  const handleSave = async () => {
    await onUpdate({
      ...formData,
      '通知設定': notificationSettings,
    });
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900">タスク詳細</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {/* タスク基本情報 */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">タスク名</label>
              {editing ? (
                <input
                  type="text"
                  value={formData.タスク名}
                  onChange={(e) => setFormData({ ...formData, タスク名: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                />
              ) : (
                <p className="text-slate-900">{task.タスク名}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">担当者</label>
                {editing ? (
                  <input
                    type="text"
                    value={formData.担当者}
                    onChange={(e) => setFormData({ ...formData, 担当者: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                  />
                ) : (
                  <p className="flex items-center gap-2 text-slate-900">
                    <User className="h-4 w-4 text-slate-400" />
                    {task.担当者 || '未設定'}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">メールアドレス</label>
                {editing ? (
                  <input
                    type="email"
                    value={formData.担当者メール}
                    onChange={(e) => setFormData({ ...formData, 担当者メール: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                  />
                ) : (
                  <p className="text-slate-900">{task.担当者メール || '未設定'}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">予定開始日</label>
                {editing ? (
                  <input
                    type="date"
                    value={formData.予定開始日}
                    onChange={(e) => setFormData({ ...formData, 予定開始日: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                  />
                ) : (
                  <p className="flex items-center gap-2 text-slate-900">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {task.予定開始日 || '未設定'}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">期限</label>
                {editing ? (
                  <input
                    type="date"
                    value={formData.期限}
                    onChange={(e) => setFormData({ ...formData, 期限: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                  />
                ) : (
                  <p className="flex items-center gap-2 text-slate-900">
                    <Clock className="h-4 w-4 text-slate-400" />
                    {task.期限 || '未設定'}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">ステータス</label>
                {editing ? (
                  <select
                    value={formData.ステータス}
                    onChange={(e) => setFormData({ ...formData, ステータス: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                  >
                    <option value="未着手">未着手</option>
                    <option value="進行中">進行中</option>
                    <option value="確認待ち">確認待ち</option>
                    <option value="保留">保留</option>
                    <option value="完了">完了</option>
                  </select>
                ) : (
                  <p className="flex items-center gap-2 text-slate-900">
                    <CheckCircle2 className="h-4 w-4 text-slate-400" />
                    {task.ステータス}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">優先度</label>
                {editing ? (
                  <select
                    value={formData.優先度}
                    onChange={(e) => setFormData({ ...formData, 優先度: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                  >
                    <option value="">未設定</option>
                    <option value="高">高</option>
                    <option value="中">中</option>
                    <option value="低">低</option>
                  </select>
                ) : (
                  <p className="text-slate-900">{task.優先度 || '未設定'}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">工数見積 (h)</label>
                {editing ? (
                  <input
                    type="number"
                    value={formData['工数見積(h)']}
                    onChange={(e) =>
                      setFormData({ ...formData, '工数見積(h)': parseFloat(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                  />
                ) : (
                  <p className="text-slate-900">{task['工数見積(h)'] || 0} h</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">工数実績 (h)</label>
                {editing ? (
                  <input
                    type="number"
                    value={formData['工数実績(h)']}
                    onChange={(e) =>
                      setFormData({ ...formData, '工数実績(h)': parseFloat(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                  />
                ) : (
                  <p className="text-slate-900">{task['工数実績(h)'] || 0} h</p>
                )}
              </div>
            </div>
          </div>

          {/* 通知設定 */}
          {editing && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 flex items-center gap-2 font-medium text-slate-900">
                <Bell className="h-5 w-5" />
                通知設定
              </h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notificationSettings.開始日}
                    onChange={(e) =>
                      setNotificationSettings({ ...notificationSettings, 開始日: e.target.checked })
                    }
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">開始日に通知</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notificationSettings.期限前日}
                    onChange={(e) =>
                      setNotificationSettings({ ...notificationSettings, 期限前日: e.target.checked })
                    }
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">期限前日に通知</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notificationSettings.期限当日}
                    onChange={(e) =>
                      setNotificationSettings({ ...notificationSettings, 期限当日: e.target.checked })
                    }
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">期限当日に通知</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notificationSettings.超過}
                    onChange={(e) =>
                      setNotificationSettings({ ...notificationSettings, 超過: e.target.checked })
                    }
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">期限超過時に通知</span>
                </label>
              </div>
            </div>
          )}

          {/* カレンダー連携 */}
          {!editing && (onCalendarSync || onSeedReminders) && (
            <div className="mt-6 flex gap-3">
              {onCalendarSync && (
                <button
                  onClick={onCalendarSync}
                  className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  <Calendar className="h-4 w-4" />
                  カレンダーに同期
                </button>
              )}
              {onSeedReminders && (
                <button
                  onClick={onSeedReminders}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Bell className="h-4 w-4" />
                  通知を設定
                </button>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 p-6">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                保存
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                閉じる
              </button>
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                編集
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

