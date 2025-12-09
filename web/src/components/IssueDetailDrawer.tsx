import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, Trash2, Calendar, User, Tag, Flag, Clock, Send, Loader2 } from 'lucide-react';
import type { Task, Project, Person } from '../lib/types';
import { apiFetch } from '../lib/api';

interface Comment {
  id: string;
  taskId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  createdAt: { _seconds: number; _nanoseconds: number } | string;
  updatedAt: { _seconds: number; _nanoseconds: number } | string;
}

interface IssueDetailDrawerProps {
  open: boolean;
  task: Task | null;
  projects: Project[];
  people: Person[];
  onClose: () => void;
  onSave: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
  onNotify?: (message: { tone: 'success' | 'error' | 'info'; title: string; description?: string }) => void;
}

export function IssueDetailDrawer({
  open,
  task,
  projects,
  people,
  onClose,
  onSave,
  onDelete,
  onNotify,
}: IssueDetailDrawerProps) {
  const [formData, setFormData] = useState<Partial<Task>>({});
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  // コメント一覧を取得
  const fetchComments = useCallback(async (taskId: string) => {
    setLoadingComments(true);
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoadingComments(false);
    }
  }, []);

  useEffect(() => {
    if (task) {
      setFormData({ ...task });
      fetchComments(task.id);
    } else {
      setComments([]);
    }
  }, [task, fetchComments]);

  // コメントを投稿
  const handlePostComment = async () => {
    if (!comment.trim() || !task) return;

    setPostingComment(true);
    try {
      const res = await apiFetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: comment.trim() }),
      });

      if (res.ok) {
        const newComment = await res.json();
        setComments(prev => [...prev, newComment]);
        setComment('');
        onNotify?.({ tone: 'success', title: 'コメントを追加しました' });
      } else {
        throw new Error('Failed to post comment');
      }
    } catch (error) {
      console.error('Failed to post comment:', error);
      onNotify?.({ tone: 'error', title: 'コメントの投稿に失敗しました' });
    } finally {
      setPostingComment(false);
    }
  };

  // コメントの日時をフォーマット
  const formatCommentDate = (date: Comment['createdAt']): string => {
    if (!date) return '';
    let d: Date;
    if (typeof date === 'object' && '_seconds' in date) {
      d = new Date(date._seconds * 1000);
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      return '';
    }
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!open || !task) return null;

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSave(task.id, formData);
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
      onNotify?.({ tone: 'error', title: 'タスクの保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('このタスクを削除しますか？')) return;
    try {
      await onDelete?.(task.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete task:', error);
      onNotify?.({ tone: 'error', title: 'タスクの削除に失敗しました' });
    }
  };

  return (
    <>
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* ドロワー */}
      <div className="fixed right-0 top-0 z-50 h-screen w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">タスク詳細</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                <Save size={16} />
                保存
              </button>
              {onDelete && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 transition"
                >
                  <Trash2 size={16} />
                  削除
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-lg p-2 hover:bg-slate-100 transition"
                aria-label="閉じる"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* フォーム */}
        <div className="p-6 space-y-6">
          {/* タスク名 */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              タスク名
            </label>
            <input
              type="text"
              value={formData.タスク名 || ''}
              onChange={(e) => setFormData({ ...formData, タスク名: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
            />
          </div>

          {/* 2カラムグリッド */}
          <div className="grid grid-cols-2 gap-4">
            {/* プロジェクト */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <Tag size={14} className="inline mr-1" />
                プロジェクト
              </label>
              <select
                value={formData.projectId || ''}
                onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              >
                <option value="">選択してください</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.物件名}
                  </option>
                ))}
              </select>
            </div>

            {/* 担当者 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <User size={14} className="inline mr-1" />
                担当者
              </label>
              <select
                value={formData.assignee || formData.担当者 || ''}
                onChange={(e) => setFormData({ ...formData, assignee: e.target.value, 担当者: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              >
                <option value="">未割り当て</option>
                {people.map((person) => (
                  <option key={person.id} value={person.氏名}>
                    {person.氏名}
                  </option>
                ))}
              </select>
            </div>

            {/* 優先度 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <Flag size={14} className="inline mr-1" />
                優先度
              </label>
              <select
                value={formData.優先度 || ''}
                onChange={(e) => setFormData({ ...formData, 優先度: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              >
                <option value="">未設定</option>
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </div>

            {/* ステータス */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                ステータス
              </label>
              <select
                value={formData.ステータス || ''}
                onChange={(e) => setFormData({ ...formData, ステータス: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              >
                <option value="未着手">未着手</option>
                <option value="進行中">進行中</option>
                <option value="確認待ち">確認待ち</option>
                <option value="保留">保留</option>
                <option value="完了">完了</option>
              </select>
            </div>

            {/* 開始日 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <Calendar size={14} className="inline mr-1" />
                開始日
              </label>
              <input
                type="date"
                value={formData.start || formData.予定開始日 || ''}
                onChange={(e) => setFormData({ ...formData, start: e.target.value, 予定開始日: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              />
            </div>

            {/* 期限 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <Calendar size={14} className="inline mr-1" />
                期限
              </label>
              <input
                type="date"
                value={formData.end || formData.期限 || ''}
                onChange={(e) => setFormData({ ...formData, end: e.target.value, 期限: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              />
            </div>

            {/* スプリント */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                スプリント
              </label>
              <input
                type="text"
                value={formData.スプリント || ''}
                onChange={(e) => setFormData({ ...formData, スプリント: e.target.value })}
                placeholder="例: Sprint 1"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              />
            </div>

            {/* フェーズ */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                フェーズ
              </label>
              <input
                type="text"
                value={formData.フェーズ || ''}
                onChange={(e) => setFormData({ ...formData, フェーズ: e.target.value })}
                placeholder="例: 設計フェーズ"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              />
            </div>

            {/* 工数見積 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <Clock size={14} className="inline mr-1" />
                工数見積（時間）
              </label>
              <input
                type="number"
                value={formData['工数見積(h)'] || ''}
                onChange={(e) => setFormData({ ...formData, '工数見積(h)': parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              />
            </div>

            {/* 工数実績 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <Clock size={14} className="inline mr-1" />
                工数実績（時間）
              </label>
              <input
                type="number"
                value={formData['工数実績(h)'] || ''}
                onChange={(e) => setFormData({ ...formData, '工数実績(h)': parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              />
            </div>
          </div>

          {/* 依頼元 */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              依頼元
            </label>
            <input
              type="text"
              value={formData.依頼元 || ''}
              onChange={(e) => setFormData({ ...formData, 依頼元: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
            />
          </div>

          {/* コメント機能 */}
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              コメント {comments.length > 0 && <span className="text-slate-400">({comments.length})</span>}
            </h3>

            {/* コメント一覧 */}
            {loadingComments ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="animate-spin text-slate-400" size={20} />
              </div>
            ) : comments.length > 0 ? (
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{c.authorName}</span>
                      <span className="text-xs text-slate-400">{formatCommentDate(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 mb-4">まだコメントはありません</p>
            )}

            {/* コメント入力 */}
            <div className="flex gap-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="コメントを入力..."
                rows={2}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    handlePostComment();
                  }
                }}
              />
              <button
                onClick={handlePostComment}
                disabled={!comment.trim() || postingComment}
                className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                {postingComment ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Ctrl+Enter で送信</p>
          </div>

          {/* メタデータ */}
          <div className="border-t border-slate-200 pt-6">
            <div className="text-xs text-slate-500 space-y-1">
              <div>作成日: {formData.createdAt || '不明'}</div>
              <div>更新日: {formData.updatedAt || '不明'}</div>
              <div>タスクID: {task.id}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
