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
  const [tempStartDate, setTempStartDate] = useState<Date | null>(null);
  const [isMilestone, setIsMilestone] = useState(false);
  const [notifyStart, setNotifyStart] = useState(false);
  const [notifyDayBefore, setNotifyDayBefore] = useState(false);
  const [notifyDue, setNotifyDue] = useState(false);
  const [notifyOverdue, setNotifyOverdue] = useState(false);

  useEffect(() => {
    setEditedTask(task);
    setTempStartDate(null);
    // 初期化時に担当者から自動的にメールアドレスを取得
    if (task?.assignee && people.length > 0) {
      const person = people.find((p) => p.氏名 === task.assignee);
      setAssigneeEmail(person?.メール || '');
    }
    // マイルストーンの状態を復元
    setIsMilestone(task?.milestone || false);
    // 通知設定を復元
    setNotifyStart(task?.notificationSettings?.開始日 || false);
    setNotifyDayBefore(task?.notificationSettings?.期限前日 || false);
    setNotifyDue(task?.notificationSettings?.期限当日 || false);
    setNotifyOverdue(task?.notificationSettings?.超過 || false);
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

  // マイルストーンチェックボックスが有効かどうか
  const isMilestoneCheckboxEnabled =
    editedTask?.startDate &&
    editedTask?.endDate &&
    editedTask.startDate.getTime() === editedTask.endDate.getTime();

  // このタスクが依存しているタスクで未完了のものをチェック
  const incompleteDependencies = (editedTask.dependencies || [])
    .map(depId => allTasks.find(t => t.id === depId))
    .filter(t => t && t.status !== 'completed') as GanttTask[];

  const cannotComplete = incompleteDependencies.length > 0;

  const handleSave = () => {
    // 通知設定とマイルストーンを含めて保存
    const taskToSave = {
      ...editedTask,
      assigneeEmail,
      milestone: isMilestone,
      notificationSettings: {
        開始日: notifyStart,
        期限前日: notifyDayBefore,
        期限当日: notifyDue,
        超過: notifyOverdue,
      }
    };
    onSave(taskToSave);
    onClose();
  };

  const handleDependencyToggle = (depId: string) => {
    const currentDeps = editedTask.dependencies || [];
    const newDeps = currentDeps.includes(depId)
      ? currentDeps.filter(id => id !== depId)
      : [...currentDeps, depId];
    setEditedTask({ ...editedTask, dependencies: newDeps });
  };

  const handleDateChange = (date: Date | null) => {
    if (!date || !editedTask) return;

    // 開始日が未設定の場合は新しい開始日として設定
    if (!tempStartDate) {
      setTempStartDate(date);
      return;
    }

    // 開始日が設定済みの場合
    if (tempStartDate.getTime() === date.getTime()) {
      // 同じ日をクリック → 単日タスク
      setEditedTask({ ...editedTask, startDate: date, endDate: date });
      setTempStartDate(null);
    } else if (date < tempStartDate) {
      // クリックした日が開始日より前 → 開始日と終了日を入れ替え
      setEditedTask({ ...editedTask, startDate: date, endDate: tempStartDate });
      setTempStartDate(null);
    } else {
      // クリックした日が開始日より後 → 範囲選択
      setEditedTask({ ...editedTask, startDate: tempStartDate, endDate: date });
      setTempStartDate(null);
    }
  };

  const handleMilestoneDateChange = (date: Date | null) => {
    if (!date || !editedTask) return;
    setEditedTask({ ...editedTask, startDate: date, endDate: date });
  };

  // 自分自身を除外し、同じプロジェクト内のタスクのみ
  const availableTasks = allTasks.filter(t =>
    t.id !== task.id && t.projectId === task.projectId
  );

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
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)] space-y-3">
          {/* 担当者 */}
          <div>
            <label className="mb-1 block text-xs text-slate-500">担当者</label>
            {people.length > 0 ? (
              <select
                value={editedTask.assignee}
                onChange={(e) => setEditedTask({ ...editedTask, assignee: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">選択</option>
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
                className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
          </div>

          {/* 通知送信先メール */}
          <div>
            <label className="mb-1 block text-xs text-slate-500">通知送信先メール</label>
            <input
              type="email"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              value={assigneeEmail}
              onChange={(e) => setAssigneeEmail(e.target.value)}
              placeholder="担当者メールアドレス"
            />
          </div>

          {/* タスク名 */}
          <div>
            <label className="mb-1 block text-xs text-slate-500">タスク名</label>
            <input
              type="text"
              value={editedTask.name}
              onChange={(e) => setEditedTask({ ...editedTask, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* マイルストーンチェックボックス */}
          <div className={`flex items-center gap-2 p-2 rounded-lg border ${
            isMilestoneCheckboxEnabled
              ? 'bg-red-50 border-red-200'
              : 'bg-gray-50 border-gray-200'
          }`}>
            <input
              type="checkbox"
              id="milestone"
              checked={isMilestone}
              disabled={!isMilestoneCheckboxEnabled}
              onChange={(e) => {
                setIsMilestone(e.target.checked);
              }}
              className={`w-4 h-4 rounded focus:ring-red-500 flex-shrink-0 ${
                isMilestoneCheckboxEnabled
                  ? 'text-red-600 cursor-pointer'
                  : 'text-gray-400 cursor-not-allowed'
              }`}
            />
            <label
              htmlFor="milestone"
              className={`text-xs ${
                isMilestoneCheckboxEnabled
                  ? 'text-red-900 cursor-pointer'
                  : 'text-gray-400 cursor-not-allowed'
              }`}
            >
              ◆ マイルストーン（重要な1日の予定）
              {!isMilestoneCheckboxEnabled && (
                <span className="block text-[10px] mt-0.5 text-gray-500">※ 1日だけの予定を選択すると設定可</span>
              )}
            </label>
          </div>

          {/* 日付選択 */}
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-3">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              {isMilestone ? '◆ 実施日' : '作業期間'}
            </label>
            {isMilestone ? (
              <DatePicker
                selected={editedTask.startDate}
                onChange={handleMilestoneDateChange}
                locale="ja"
                dateFormat="yyyy年MM月dd日"
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholderText="実施日を選択"
              />
            ) : (
              <div>
                <DatePicker
                  onChange={handleDateChange}
                  highlightDates={[
                    ...(tempStartDate ? [tempStartDate] : []),
                    ...(editedTask.startDate && editedTask.endDate ?
                      Array.from({ length: Math.ceil((editedTask.endDate.getTime() - editedTask.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 }, (_, i) => {
                        const d = new Date(editedTask.startDate);
                        d.setDate(editedTask.startDate.getDate() + i);
                        return d;
                      }) : []
                    )
                  ]}
                  locale="ja"
                  inline={true}
                  monthsShown={1}
                  className="w-full"
                />
                {/* 選択状態の表示 */}
                <div className="mt-2 text-xs text-slate-600 text-center bg-white rounded-lg py-2 px-3">
                  {!tempStartDate ? (
                    <span className="font-semibold text-blue-600">
                      {editedTask.startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })} 〜 {editedTask.endDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                      {editedTask.startDate.getTime() === editedTask.endDate.getTime() && ' (単日)'}
                      <span className="ml-2 text-slate-500">
                        ({Math.ceil((editedTask.endDate.getTime() - editedTask.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1}日間)
                      </span>
                    </span>
                  ) : (
                    <span>📅 終了日を選択してください（同じ日をもう一度クリックで単日タスク）</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 優先度とステータス */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">優先度</label>
              <select
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={editedTask.priority || '中'}
                onChange={(e) => setEditedTask({ ...editedTask, priority: e.target.value })}
              >
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">ステータス</label>
              <select
                value={editedTask.status}
                onChange={(e) => {
                  const newStatus = e.target.value as any;
                  // 依存タスクが未完了の場合は完了を選択できない
                  if (newStatus === 'completed' && cannotComplete && editedTask.status !== 'completed') {
                    return;
                  }
                  setEditedTask({ ...editedTask, status: newStatus });
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="not_started">未着手</option>
                <option value="in_progress">進行中</option>
                <option value="on_hold">保留</option>
                <option value="completed" disabled={cannotComplete && editedTask.status !== 'completed'}>
                  完了{cannotComplete && editedTask.status !== 'completed' ? ' (依存タスクが未完了)' : ''}
                </option>
              </select>
              {cannotComplete && editedTask.status !== 'completed' && (
                <div className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  先に完了が必要：{incompleteDependencies.map(t => t?.name).join('、')}
                </div>
              )}
            </div>
          </div>

          {/* 工数見積 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">工数見積(h)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={editedTask.estimatedHours || ''}
                onChange={(e) => setEditedTask({ ...editedTask, estimatedHours: Number(e.target.value || 0) })}
              />
            </div>
          </div>

          {/* メール通知 */}
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">メール通知</p>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={notifyStart} onChange={(e) => setNotifyStart(e.target.checked)} className="w-3.5 h-3.5" />
                <span>開始日</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={notifyDayBefore} onChange={(e) => setNotifyDayBefore(e.target.checked)} className="w-3.5 h-3.5" />
                <span>期限前日</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={notifyDue} onChange={(e) => setNotifyDue(e.target.checked)} className="w-3.5 h-3.5" />
                <span>期限当日</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={notifyOverdue} onChange={(e) => setNotifyOverdue(e.target.checked)} className="w-3.5 h-3.5" />
                <span>期限超過</span>
              </label>
            </div>
          </div>

          {/* 依存タスク */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              依存タスク（このタスクを開始する前に完了すべきタスク）
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
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-2xl hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-2xl hover:bg-slate-800 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};
