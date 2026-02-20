import React, { useState, useCallback, useMemo } from 'react';
import type { ParsedItem, ConfirmedItem } from '../lib/types';
import { bulkImportSave } from '../lib/api';

interface EditableItem extends ParsedItem {
  selected: boolean;
}

interface BulkImportReviewTableProps {
  items: ParsedItem[];
  warnings: string[];
  projectId: string;
  members: string[];
  onSaved: () => void;
  onBack: () => void;
}

const TYPE_OPTIONS: { value: ParsedItem['type']; label: string }[] = [
  { value: 'stage', label: '工程' },
  { value: 'task', label: 'タスク' },
  { value: 'meeting', label: '打合せ' },
  { value: 'milestone', label: 'マイルストーン' },
];

export function BulkImportReviewTable({
  items,
  warnings,
  projectId,
  members,
  onSaved,
  onBack,
}: BulkImportReviewTableProps) {
  const [editableItems, setEditableItems] = useState<EditableItem[]>(() =>
    items.map((item) => ({ ...item, selected: true }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // List of stage items for parent dropdown
  const stageOptions = useMemo(
    () => editableItems.filter((item) => item.type === 'stage'),
    [editableItems]
  );

  const selectedCount = useMemo(
    () => editableItems.filter((item) => item.selected).length,
    [editableItems]
  );

  const updateItem = useCallback(
    (index: number, updates: Partial<EditableItem>) => {
      setEditableItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...updates };
        return next;
      });
    },
    []
  );

  const handleTypeChange = useCallback(
    (index: number, newType: ParsedItem['type']) => {
      setEditableItems((prev) => {
        const next = [...prev];
        const oldItem = next[index];
        const oldType = oldItem.type;

        // Update the item type
        next[index] = {
          ...oldItem,
          type: newType,
          // If becoming a stage, clear parent
          parentTempId: newType === 'stage' ? null : oldItem.parentTempId,
        };

        // If changing FROM stage, clear any items that had this as parent
        if (oldType === 'stage' && newType !== 'stage') {
          for (let i = 0; i < next.length; i++) {
            if (next[i].parentTempId === oldItem.tempId) {
              next[i] = { ...next[i], parentTempId: null };
            }
          }
        }

        return next;
      });
    },
    []
  );

  const handleSelectAll = useCallback(() => {
    setEditableItems((prev) => prev.map((item) => ({ ...item, selected: true })));
  }, []);

  const handleDeselectAll = useCallback(() => {
    setEditableItems((prev) => prev.map((item) => ({ ...item, selected: false })));
  }, []);

  const handleSave = async () => {
    setError('');
    const selectedItems = editableItems.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      setError('保存する項目を選択してください');
      return;
    }

    setSaving(true);
    try {
      const confirmedItems: ConfirmedItem[] = selectedItems.map((item, idx) => ({
        tempId: item.tempId,
        name: item.name,
        type: item.type,
        parentTempId: item.parentTempId ?? null,
        assignee: item.assignee ?? null,
        assigneeEmail: null,
        startDate: item.startDate ?? null,
        endDate: item.endDate ?? null,
        orderIndex: idx,
      }));

      await bulkImportSave({ projectId, items: confirmedItems });
      onSaved();
    } catch (err: any) {
      setError(err.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900">
          解析結果 ― {editableItems.length}件検出
        </h3>
        <div className="mt-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
          AIが工程・タスク・打合せを自動分類しました。間違いがあれば各セルをクリックして修正できます。
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="text-sm text-amber-600">
              &#9888; {w}
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            全選択
          </button>
          <button
            type="button"
            onClick={handleDeselectAll}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            選択解除
          </button>
          <span className="text-xs text-slate-500">
            {selectedCount}/{editableItems.length} 件選択中
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            disabled={saving}
          >
            &#8592; 戻る
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || selectedCount === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? '保存中...' : `選択した項目を確定（${selectedCount}件）`}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <th className="w-10 px-3 py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={selectedCount === editableItems.length}
                  onChange={(e) =>
                    e.target.checked ? handleSelectAll() : handleDeselectAll()
                  }
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
              </th>
              <th className="min-w-[200px] px-3 py-2.5">タスク名</th>
              <th className="w-28 px-3 py-2.5">種別</th>
              <th className="w-36 px-3 py-2.5">親工程</th>
              <th className="w-32 px-3 py-2.5">担当者</th>
              <th className="w-36 px-3 py-2.5">開始日</th>
              <th className="w-36 px-3 py-2.5">期限</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {editableItems.map((item, index) => {
              const isStage = item.type === 'stage';
              const hasParent = !isStage && item.parentTempId;
              const lowConfidence = item.confidence < 0.7;
              const missingAssignee = !item.assignee;

              return (
                <tr
                  key={item.tempId}
                  className={[
                    'transition-colors',
                    lowConfidence ? 'bg-amber-50' : '',
                    !item.selected ? 'opacity-50' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) => updateItem(index, { selected: e.target.checked })}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                  </td>

                  {/* Name */}
                  <td className="px-3 py-2">
                    <div className={hasParent ? 'pl-6' : ''}>
                      {isStage && (
                        <span className="mr-1.5 inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                          工程
                        </span>
                      )}
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(index, { name: e.target.value })}
                        className={[
                          'w-full border-0 bg-transparent rounded px-1 py-0.5 text-sm focus:ring-1 focus:ring-blue-500',
                          isStage ? 'font-semibold' : '',
                        ].join(' ')}
                      />
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-2">
                    <select
                      value={item.type}
                      onChange={(e) =>
                        handleTypeChange(index, e.target.value as ParsedItem['type'])
                      }
                      className="w-full border-0 bg-transparent text-sm rounded px-1 py-0.5 focus:ring-1 focus:ring-blue-500"
                    >
                      {TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Parent stage */}
                  <td className="px-3 py-2">
                    {isStage ? (
                      <span className="text-slate-400">&#8213;</span>
                    ) : (
                      <select
                        value={item.parentTempId ?? ''}
                        onChange={(e) =>
                          updateItem(index, {
                            parentTempId: e.target.value || null,
                          })
                        }
                        className="w-full border-0 bg-transparent text-sm rounded px-1 py-0.5 focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">なし</option>
                        {stageOptions.map((stage) => (
                          <option key={stage.tempId} value={stage.tempId}>
                            {stage.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  {/* Assignee */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <select
                        value={item.assignee ?? ''}
                        onChange={(e) =>
                          updateItem(index, {
                            assignee: e.target.value || null,
                          })
                        }
                        className={[
                          'w-full border-0 bg-transparent text-sm rounded px-1 py-0.5 focus:ring-1 focus:ring-blue-500',
                          missingAssignee ? 'text-amber-600' : '',
                        ].join(' ')}
                      >
                        <option value="">未設定</option>
                        {members.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      {missingAssignee && (
                        <span className="text-amber-500 text-xs" title="担当者が未設定です">
                          &#9888;
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Start date */}
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={item.startDate ?? ''}
                      onChange={(e) =>
                        updateItem(index, {
                          startDate: e.target.value || null,
                        })
                      }
                      className="w-full border-0 bg-transparent text-sm rounded px-1 py-0.5 focus:ring-1 focus:ring-blue-500"
                    />
                  </td>

                  {/* End date */}
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={item.endDate ?? ''}
                      onChange={(e) =>
                        updateItem(index, {
                          endDate: e.target.value || null,
                        })
                      }
                      className="w-full border-0 bg-transparent text-sm rounded px-1 py-0.5 focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
