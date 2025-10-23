// タスク編集モーダルコンポーネント

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import DatePicker, { registerLocale } from 'react-datepicker';
import type { GanttTask } from './types';

// 日本語ロケールを登録
registerLocale('ja', ja);

interface Person {
  id: string;
  氏名: string;
  メール?: string;
  [key: string]: any;
}

interface TaskEditModalProps {
  task: GanttTask | null;
  allTasks: GanttTask[];
  people?: Person[];
  onClose: () => void;
  onSave: (task: GanttTask & { assigneeEmail?: string }) => void;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  task,
  allTasks,
  people = [],
  onClose,
  onSave
}) => {
  const [editedTask, setEditedTask] = useState<GanttTask | null>(task);
  const [assigneeEmail, setAssigneeEmail] = useState('');

  useEffect(() => {
    setEditedTask(task);
    // 初期化時に担当者から自動的にメールアドレスを取得
    if (task?.assignee && people.length > 0) {
      const person = people.find((p) => p.氏名 === task.assignee);
      setAssigneeEmail(person?.メール || '');
    }
  }, [task, people]);

  // 担当者が変更されたら、自動的にメールアドレスを補完
  useEffect(() => {
    if (!editedTask?.assignee) {
      setAssigneeEmail('');
      return;
    }
    const person = people.find((p) => p.氏名 === editedTask.assignee);
    setAssigneeEmail(person?.メール || '');
  }, [editedTask?.assignee, people]);

  if (!task || !editedTask) return null;

  const handleSave = () => {
    console.log('TaskEditModal handleSave called with:', editedTask);
    // 担当者メールも含めて保存
    onSave({ ...editedTask, assigneeEmail });
    onClose();
  };

  const handleDependencyToggle = (depId: string) => {
    const currentDeps = editedTask.dependencies || [];
    const newDeps = currentDeps.includes(depId)
      ? currentDeps.filter(id => id !== depId)
      : [...currentDeps, depId];
    setEditedTask({ ...editedTask, dependencies: newDeps });
  };

  // 自分自身を除外したタスクリスト
  const availableTasks = allTasks.filter(t => t.id !== task.id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">タスク編集</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* コンテンツ */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* タスク名 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              タスク名
            </label>
            <input
              type="text"
              value={editedTask.name}
              onChange={(e) => setEditedTask({ ...editedTask, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 日付 - 範囲選択カレンダーピッカー */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              作業期間
            </label>
            <div className="border border-slate-300 rounded-lg p-3 bg-white">
              {/* 選択中の期間表示 */}
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {format(editedTask.startDate, 'M月d日 (E)', { locale: ja })}
                  </span>
                  <span className="text-slate-400">〜</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {format(editedTask.endDate, 'M月d日 (E)', { locale: ja })}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {Math.ceil((editedTask.endDate.getTime() - editedTask.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1}日間
                </span>
              </div>

              {/* カレンダー */}
              <DatePicker
                selectsRange={true}
                startDate={editedTask.startDate}
                endDate={editedTask.endDate}
                onChange={(update) => {
                  if (Array.isArray(update)) {
                    const [start, end] = update;
                    if (start && end) {
                      setEditedTask({ ...editedTask, startDate: start, endDate: end });
                    } else if (start) {
                      setEditedTask({ ...editedTask, startDate: start });
                    }
                  }
                }}
                locale="ja"
                inline={true}
                monthsShown={1}
                shouldCloseOnSelect={false}
              />
            </div>
          </div>

          {/* 担当者 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              担当者
            </label>
            {people.length > 0 ? (
              <select
                value={editedTask.assignee}
                onChange={(e) => setEditedTask({ ...editedTask, assignee: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">選択してください</option>
                {people.map((person) => (
                  <option key={person.id} value={person.氏名}>
                    {person.氏名}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={editedTask.assignee}
                onChange={(e) => setEditedTask({ ...editedTask, assignee: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
            {assigneeEmail && (
              <p className="mt-1 text-xs text-slate-500">
                メール: {assigneeEmail}
              </p>
            )}
          </div>

          {/* 進捗率 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              進捗率: {editedTask.progress}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={editedTask.progress}
              onChange={(e) => setEditedTask({ ...editedTask, progress: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* ステータス */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              ステータス
            </label>
            <select
              value={editedTask.status}
              onChange={(e) => setEditedTask({ ...editedTask, status: e.target.value as any })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="not_started">未着手</option>
              <option value="in_progress">進行中</option>
              <option value="on_hold">保留</option>
              <option value="completed">完了</option>
            </select>
          </div>

          {/* 依存タスク */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              依存タスク（このタスクが開始する前に完了すべきタスク）
            </label>
            <div className="border border-slate-300 rounded-lg p-3 max-h-48 overflow-y-auto">
              {availableTasks.length === 0 ? (
                <p className="text-sm text-slate-400">他のタスクがありません</p>
              ) : (
                availableTasks.map(t => (
                  <label key={t.id} className="flex items-center gap-2 py-2 hover:bg-slate-50 px-2 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(editedTask.dependencies || []).includes(t.id)}
                      onChange={() => handleDependencyToggle(t.id)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">{t.name}</span>
                    <span className="text-xs text-slate-400">({t.projectName})</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};
