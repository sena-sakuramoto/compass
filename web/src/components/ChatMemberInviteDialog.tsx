import { useState, useEffect } from 'react';
import { listProjectMembers, inviteChatMembers, type InviteChatMembersResult } from '../lib/api';
import type { ProjectMember } from '../lib/auth-types';
import {
  X,
  MessageSquare,
  Loader2,
  AlertCircle,
  CheckCircle,
  Mail,
  MailX,
  Users
} from 'lucide-react';

interface ChatMemberInviteDialogProps {
  projectId: string;
  projectName: string;
  chatSpaceUrl?: string | null;
  onClose: () => void;
}

export function ChatMemberInviteDialog({
  projectId,
  projectName,
  chatSpaceUrl,
  onClose
}: ChatMemberInviteDialogProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteChatMembersResult | null>(null);

  useEffect(() => {
    loadMembers();
  }, [projectId]);

  async function loadMembers() {
    try {
      setLoading(true);
      setError(null);
      const data = await listProjectMembers(projectId);
      setMembers(data);
      // デフォルトでメールがあるメンバーを全選択
      const withEmail = data.filter(m => m.email).map(m => m.id || m.userId);
      setSelectedMemberIds(new Set(withEmail));
    } catch (err) {
      console.error('Failed to load project members:', err);
      setError('メンバーの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }

  function toggleMember(memberId: string) {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }

  function selectAll() {
    const withEmail = members.filter(m => m.email).map(m => m.id || m.userId);
    setSelectedMemberIds(new Set(withEmail));
  }

  function deselectAll() {
    setSelectedMemberIds(new Set());
  }

  async function handleInvite() {
    if (selectedMemberIds.size === 0) {
      setError('招待するメンバーを選択してください');
      return;
    }

    try {
      setInviting(true);
      setError(null);
      const data = await inviteChatMembers(projectId, Array.from(selectedMemberIds));
      setResult(data);
    } catch (err) {
      console.error('Failed to invite members to chat:', err);
      setError('招待に失敗しました');
    } finally {
      setInviting(false);
    }
  }

  const membersWithEmail = members.filter(m => m.email);
  const membersWithoutEmail = members.filter(m => !m.email);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold">Google Chat に招待</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-4">
          {result ? (
            // 結果表示
            <div className="space-y-4">
              <div className={`p-4 rounded-md ${result.successCount > 0 ? 'bg-green-50' : 'bg-yellow-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {result.successCount > 0 ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                  )}
                  <span className="font-medium">
                    {result.successCount > 0
                      ? `${result.successCount}人を招待しました`
                      : '招待に失敗しました'
                    }
                  </span>
                </div>
                {result.failedCount > 0 && (
                  <p className="text-sm text-gray-600">
                    失敗: {result.failedCount}人
                  </p>
                )}
                {result.missingEmails.length > 0 && (
                  <p className="text-sm text-gray-600">
                    メール未設定: {result.missingEmails.join(', ')}
                  </p>
                )}
              </div>

              {chatSpaceUrl && (
                <a
                  href={chatSpaceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Google Chat を開く
                </a>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-600">読み込み中...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">{projectName}</span> のメンバーを Google Chat スペースに招待します。
              </p>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* 選択操作 */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  <Users className="w-4 h-4 inline mr-1" />
                  {selectedMemberIds.size}人選択中
                </span>
                <div className="space-x-2">
                  <button
                    onClick={selectAll}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    全選択
                  </button>
                  <button
                    onClick={deselectAll}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    選択解除
                  </button>
                </div>
              </div>

              {/* メンバーリスト（メールあり） */}
              {membersWithEmail.length > 0 && (
                <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                  {membersWithEmail.map(member => {
                    const memberId = member.id || member.userId;
                    return (
                      <label
                        key={memberId}
                        className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.has(memberId)}
                          onChange={() => toggleMember(memberId)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {member.displayName}
                          </p>
                          <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {member.email}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* メンバーリスト（メールなし） */}
              {membersWithoutEmail.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-amber-600 mb-2 flex items-center gap-1">
                    <MailX className="w-4 h-4" />
                    メール未設定のメンバー（招待不可）
                  </p>
                  <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-500">
                    {membersWithoutEmail.map(m => m.displayName).join(', ')}
                  </div>
                </div>
              )}

              {members.length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  プロジェクトメンバーがいません
                </p>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-md"
          >
            {result ? '閉じる' : 'キャンセル'}
          </button>
          {!result && (
            <button
              onClick={handleInvite}
              disabled={inviting || selectedMemberIds.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  招待中...
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  招待する
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
