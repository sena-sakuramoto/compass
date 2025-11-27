import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { X, Users, History, Plus } from 'lucide-react';
import type { Project, Task } from '../lib/types';
import type { ProjectMember } from '../lib/auth-types';
import { listProjectMembers, listActivityLogs, type ActivityLog } from '../lib/api';

interface ProjectEditDialogProps {
  project: Project | null;
  onClose: () => void;
  onSave: (project: Project) => Promise<void>;
  onTaskCreate?: (taskData: Partial<Task>) => Promise<void>;
  people?: Array<{ id: string; 氏名: string; メール?: string }>;
}

const STATUS_OPTIONS = ['未着手', '進行中', '確認待ち', '保留', '完了', '計画中', '見積', '実施中', '設計中'];
const PRIORITY_OPTIONS = ['高', '中', '低'];

export function ProjectEditDialog({ project, onClose, onSave, onTaskCreate, people = [] }: ProjectEditDialogProps) {
  const [formData, setFormData] = useState<Partial<Project>>({
    id: '',
    物件名: '',
    クライアント: '',
    LS担当者: '',
    自社PM: '',
    ステータス: '未着手',
    優先度: '中',
    開始日: '',
    予定完了日: '',
    現地調査日: '',
    着工日: '',
    竣工予定日: '',
    引渡し予定日: '',
    '所在地/現地': '',
    '所在地_現地': '',
    'フォルダURL': '',
    備考: '',
    施工費: undefined,
  });
  const [saving, setSaving] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskEndDate, setNewTaskEndDate] = useState('');
  const [taskCreating, setTaskCreating] = useState(false);

  useEffect(() => {
    if (project) {
      setFormData(project);
      // プロジェクトメンバーを取得（編集モード時のみ）
      if (project.id) {
        setMembersLoading(true);
        setLogsLoading(true);

        Promise.all([
          listProjectMembers(project.id, { status: 'active' }),
          listActivityLogs({ projectId: project.id, limit: 20 }),
        ])
          .then(([members, logsData]) => {
            setProjectMembers(members);
            setActivityLogs(logsData.logs);
          })
          .catch(error => {
            console.error('Failed to load project data:', error);
            setProjectMembers([]);
            setActivityLogs([]);
          })
          .finally(() => {
            setMembersLoading(false);
            setLogsLoading(false);
          });
      } else {
        setProjectMembers([]);
        setActivityLogs([]);
      }
    } else {
      // Reset to default values for new project
      setFormData({
        id: '',
        物件名: '',
        クライアント: '',
        LS担当者: '',
        自社PM: '',
        ステータス: '未着手',
        優先度: '中',
        開始日: '',
        予定完了日: '',
        現地調査日: '',
        着工日: '',
        竣工予定日: '',
        引渡し予定日: '',
        '所在地/現地': '',
        '所在地_現地': '',
        'フォルダURL': '',
        備考: '',
        施工費: undefined,
      });
      setProjectMembers([]);
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Pass formData directly to parent handler
      // Parent will handle mode-based branching and id stripping for create mode
      await onSave(formData as Project);
      onClose();
    } catch (error) {
      console.error('プロジェクトの保存に失敗しました:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskName.trim() || !project?.id || !onTaskCreate) return;

    setTaskCreating(true);
    try {
      await onTaskCreate({
        タスク名: newTaskName,
        担当者: newTaskAssignee || undefined,
        予定開始日: newTaskStartDate || undefined,
        期限: newTaskEndDate || undefined,
        ステータス: '未着手',
        優先度: '中',
        projectId: project.id,
      });

      // フォームをリセット
      setNewTaskName('');
      setNewTaskAssignee('');
      setNewTaskStartDate('');
      setNewTaskEndDate('');
      setShowTaskForm(false);
    } catch (error) {
      console.error('タスクの作成に失敗しました:', error);
      alert('タスクの作成に失敗しました');
    } finally {
      setTaskCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {project ? 'プロジェクト編集' : 'プロジェクト作成'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 transition hover:bg-slate-100"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                <label className="block text-sm font-medium text-slate-700">受注日</label>
                <input
                  type="date"
                  value={formData.開始日 || ''}
                  onChange={(e) => setFormData({ ...formData, 開始日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">現地調査日</label>
                <input
                  type="date"
                  value={formData.現地調査日 || ''}
                  onChange={(e) => setFormData({ ...formData, 現地調査日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">着工日</label>
                <input
                  type="date"
                  value={formData.着工日 || ''}
                  onChange={(e) => setFormData({ ...formData, 着工日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">竣工予定日</label>
                <input
                  type="date"
                  value={formData.竣工予定日 || ''}
                  onChange={(e) => setFormData({ ...formData, 竣工予定日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">引渡し予定日</label>
                <input
                  type="date"
                  value={formData.引渡し予定日 || ''}
                  onChange={(e) => setFormData({ ...formData, 引渡し予定日: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
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

            <div>
              <label className="block text-sm font-medium text-slate-700">施工費（円）</label>
              <input
                type="number"
                value={formData.施工費 || ''}
                onChange={(e) => setFormData({ ...formData, 施工費: e.target.value ? Number(e.target.value) : undefined })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="例：10000000"
                min="0"
                step="1"
              />
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

            {/* タスク追加（編集モード時のみ） */}
            {project && project.id && onTaskCreate && (
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">
                    <Plus className="inline h-4 w-4 mr-1" />
                    タスク追加
                  </label>
                  {!showTaskForm && (
                    <button
                      type="button"
                      onClick={() => setShowTaskForm(true)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + 新しいタスク
                    </button>
                  )}
                </div>

                {showTaskForm && (
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        タスク名 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newTaskName}
                        onChange={(e) => setNewTaskName(e.target.value)}
                        placeholder="タスク名を入力"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">開始日</label>
                        <input
                          type="date"
                          value={newTaskStartDate}
                          onChange={(e) => setNewTaskStartDate(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">期限</label>
                        <input
                          type="date"
                          value={newTaskEndDate}
                          onChange={(e) => setNewTaskEndDate(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">担当者</label>
                      <select
                        value={newTaskAssignee}
                        onChange={(e) => setNewTaskAssignee(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">未割り当て</option>
                        {people.map((person) => (
                          <option key={person.id} value={person.氏名}>
                            {person.氏名}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowTaskForm(false);
                          setNewTaskName('');
                          setNewTaskAssignee('');
                          setNewTaskStartDate('');
                          setNewTaskEndDate('');
                        }}
                        className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-700 rounded-lg border border-slate-300 hover:bg-slate-100"
                        disabled={taskCreating}
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateTask}
                        disabled={!newTaskName.trim() || taskCreating}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {taskCreating ? '作成中...' : 'タスクを作成'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* プロジェクトメンバー表示（編集モード時のみ） */}
            {project && project.id && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Users className="inline h-4 w-4 mr-1" />
                  プロジェクトメンバー
                </label>
                {membersLoading ? (
                  <div className="text-sm text-slate-400 text-center py-4">
                    読み込み中...
                  </div>
                ) : projectMembers.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="max-h-32 overflow-y-auto">
                      {projectMembers.map((member) => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between px-3 py-2 text-sm border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-medium">
                              {member.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-slate-700">{member.displayName}</div>
                              <div className="text-xs text-slate-500">{member.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {member.職種 && (
                              <span className="text-xs text-slate-500">{member.職種}</span>
                            )}
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              {member.role === 'owner' ? 'オーナー' : member.role === 'manager' ? 'マネージャー' : member.role === 'member' ? 'メンバー' : '閲覧者'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 text-center py-4 border border-slate-200 rounded-lg">
                    メンバーがいません
                  </div>
                )}
              </div>
            )}

            {/* アクティビティログ表示（編集モード時のみ） */}
            {project && project.id && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <History className="inline h-4 w-4 mr-1" />
                  編集履歴
                </label>
                {logsLoading ? (
                  <div className="text-sm text-slate-400 text-center py-4">
                    読み込み中...
                  </div>
                ) : activityLogs.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      {activityLogs.map((log) => (
                        <div
                          key={log.id}
                          className="px-3 py-2 text-sm border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-slate-700">{log.userName}</span>
                                <span className="text-slate-500">が</span>
                                <span className="font-medium text-blue-600">{log.action}</span>
                              </div>
                              {log.changes && Object.keys(log.changes).length > 0 && (
                                <div className="mt-1 pl-2 border-l-2 border-slate-200">
                                  {Object.entries(log.changes).map(([field, change]) => (
                                    <div key={field} className="text-xs text-slate-600 mb-0.5">
                                      <span className="font-medium">{field}:</span>{' '}
                                      <span className="line-through text-slate-400">{JSON.stringify(change.before)}</span>
                                      {' → '}
                                      <span className="text-green-600">{JSON.stringify(change.after)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 ml-2 whitespace-nowrap">
                              {(() => {
                                try {
                                  const date = log.createdAt && typeof log.createdAt === 'object' && '_seconds' in log.createdAt
                                    ? new Date((log.createdAt as any)._seconds * 1000)
                                    : new Date(log.createdAt);
                                  return format(date, 'yyyy/MM/dd HH:mm');
                                } catch (e) {
                                  return '-';
                                }
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 text-center py-4 border border-slate-200 rounded-lg">
                    編集履歴がありません
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
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
