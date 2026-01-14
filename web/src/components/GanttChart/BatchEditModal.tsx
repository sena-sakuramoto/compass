// 一括編集モーダルコンポーネント

import React, { useState, useMemo } from 'react';
import type { GanttTask } from './types';
import type { ProjectMember } from '../../lib/auth-types';
import { PROJECT_ROLE_LABELS } from '../../lib/auth-types';

interface BatchEditModalProps {
  selectedTasks: GanttTask[];
  projectMembers?: ProjectMember[];
  stages?: GanttTask[];
  onClose: () => void;
  onSave: (updates: BatchUpdate) => void;
}

export interface BatchUpdate {
  assignee?: string;
  assigneeEmail?: string;
  status?: 'not_started' | 'in_progress' | 'on_hold' | 'completed';
  shiftDays?: number;
  priority?: string;
  parentId?: string | null;
}

export const BatchEditModal: React.FC<BatchEditModalProps> = ({
  selectedTasks,
  projectMembers = [],
  stages = [],
  onClose,
  onSave
}) => {
  const [assignee, setAssignee] = useState<string>('');
  const [applyAssignee, setApplyAssignee] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [applyStatus, setApplyStatus] = useState(false);
  const [shiftDays, setShiftDays] = useState<number>(0);
  const [applyShift, setApplyShift] = useState(false);
  const [priority, setPriority] = useState<string>('');
  const [applyPriority, setApplyPriority] = useState(false);
  const [parentId, setParentId] = useState<string>('');
  const [applyParentId, setApplyParentId] = useState(false);

  // 選択中のタスクに工程が含まれているかチェック（工程は工程の変更対象外）
  const hasStagesSelected = selectedTasks.some(t => t.type === 'stage');
  // タスクのみが選択されている場合のみ工程変更を許可
  const canChangeStage = !hasStagesSelected && stages.length > 0;

  const assignableMembers = useMemo(() => {
    return projectMembers.filter((member) => member.status === 'active');
  }, [projectMembers]);

  const assigneeOptions = useMemo(
    () =>
      assignableMembers.map((member) => ({
        key: member.userId || member.displayName,
        value: member.displayName,
        label: `${member.displayName} (${PROJECT_ROLE_LABELS[member.role] ?? member.role})`,
        email: member.email,
      })),
    [assignableMembers]
  );

  const handleSave = () => {
    const updates: BatchUpdate = {};

    if (applyAssignee && assignee) {
      updates.assignee = assignee;
      const member = assignableMembers.find((m) => m.displayName === assignee);
      updates.assigneeEmail = member?.email || '';
    }

    if (applyStatus && status) {
      updates.status = status as BatchUpdate['status'];
    }

    if (applyShift && shiftDays !== 0) {
      updates.shiftDays = shiftDays;
    }

    if (applyPriority && priority) {
      updates.priority = priority;
    }

    if (applyParentId && canChangeStage) {
      // 「なし」を選択した場合はnull、それ以外は工程ID
      updates.parentId = parentId === '' ? null : parentId;
    }

    onSave(updates);
    onClose();
  };

  const hasChanges = (applyAssignee && assignee) ||
                     (applyStatus && status) ||
                     (applyShift && shiftDays !== 0) ||
                     (applyPriority && priority) ||
                     (applyParentId && canChangeStage);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-blue-50">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">一括編集</h2>
            <p className="text-sm text-slate-600">{selectedTasks.length}個のアイテムを編集</p>
          </div>
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
        <div className="px-6 py-4 space-y-4">
          <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            適用したい項目にチェックを入れて、値を設定してください。
            チェックがない項目は変更されません。
          </p>

          {/* 担当者 */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="apply-assignee"
              checked={applyAssignee}
              onChange={(e) => setApplyAssignee(e.target.checked)}
              className="mt-2 w-4 h-4 text-blue-600 rounded"
            />
            <div className="flex-1">
              <label htmlFor="apply-assignee" className="block text-sm font-medium text-slate-700 mb-1">
                担当者
              </label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                disabled={!applyAssignee}
                className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${
                  !applyAssignee ? 'bg-slate-50 text-slate-400' : ''
                }`}
              >
                <option value="">選択してください</option>
                {assigneeOptions.map((option) => (
                  <option key={option.key} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ステータス */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="apply-status"
              checked={applyStatus}
              onChange={(e) => setApplyStatus(e.target.checked)}
              className="mt-2 w-4 h-4 text-blue-600 rounded"
            />
            <div className="flex-1">
              <label htmlFor="apply-status" className="block text-sm font-medium text-slate-700 mb-1">
                ステータス
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={!applyStatus}
                className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${
                  !applyStatus ? 'bg-slate-50 text-slate-400' : ''
                }`}
              >
                <option value="">選択してください</option>
                <option value="not_started">未着手</option>
                <option value="in_progress">進行中</option>
                <option value="on_hold">保留</option>
                <option value="completed">完了</option>
              </select>
            </div>
          </div>

          {/* 優先度 */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="apply-priority"
              checked={applyPriority}
              onChange={(e) => setApplyPriority(e.target.checked)}
              className="mt-2 w-4 h-4 text-blue-600 rounded"
            />
            <div className="flex-1">
              <label htmlFor="apply-priority" className="block text-sm font-medium text-slate-700 mb-1">
                優先度
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={!applyPriority}
                className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${
                  !applyPriority ? 'bg-slate-50 text-slate-400' : ''
                }`}
              >
                <option value="">選択してください</option>
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </div>
          </div>

          {/* 日付シフト */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="apply-shift"
              checked={applyShift}
              onChange={(e) => setApplyShift(e.target.checked)}
              className="mt-2 w-4 h-4 text-blue-600 rounded"
            />
            <div className="flex-1">
              <label htmlFor="apply-shift" className="block text-sm font-medium text-slate-700 mb-1">
                日付をシフト
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={shiftDays}
                  onChange={(e) => setShiftDays(parseInt(e.target.value) || 0)}
                  disabled={!applyShift}
                  className={`w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm text-center ${
                    !applyShift ? 'bg-slate-50 text-slate-400' : ''
                  }`}
                />
                <span className={`text-sm ${!applyShift ? 'text-slate-400' : 'text-slate-700'}`}>
                  日 {shiftDays > 0 ? '後ろにずらす' : shiftDays < 0 ? '前にずらす' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* 所属工程 */}
          {canChangeStage && (
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="apply-parent"
                checked={applyParentId}
                onChange={(e) => setApplyParentId(e.target.checked)}
                className="mt-2 w-4 h-4 text-blue-600 rounded"
              />
              <div className="flex-1">
                <label htmlFor="apply-parent" className="block text-sm font-medium text-slate-700 mb-1">
                  所属工程
                </label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  disabled={!applyParentId}
                  className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm ${
                    !applyParentId ? 'bg-slate-50 text-slate-400' : ''
                  }`}
                >
                  <option value="">なし（工程に属さない）</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 工程が選択されている場合の注意メッセージ */}
          {hasStagesSelected && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              工程が選択されています。工程の所属先は変更できません。
            </p>
          )}
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
            disabled={!hasChanges}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
              hasChanges
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-slate-300 cursor-not-allowed'
            }`}
          >
            {selectedTasks.length}個のアイテムに適用
          </button>
        </div>
      </div>
    </div>
  );
};
