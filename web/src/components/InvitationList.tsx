// 招待一覧コンポーネント

import React from 'react';
import { Mail, Calendar, X, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { ProjectInvitation } from '../lib/invitations';

interface InvitationListProps {
  invitations: ProjectInvitation[];
  onDelete: (invitationId: string) => void;
}

export function InvitationList({ invitations, onDelete }: InvitationListProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
            <Clock className="h-3 w-3" />
            承認待ち
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
            <CheckCircle className="h-3 w-3" />
            承認済み
          </span>
        );
      case 'declined':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
            <XCircle className="h-3 w-3" />
            拒否
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
            <XCircle className="h-3 w-3" />
            期限切れ
          </span>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (invitations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        <Mail className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">招待はまだありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invitations.map((invitation) => (
        <div
          key={invitation.id}
          className="rounded-lg border border-slate-200 bg-white p-4 transition hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {/* メールアドレスとステータス */}
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-slate-400" />
                <span className="font-medium text-slate-900">{invitation.email}</span>
                {getStatusBadge(invitation.status)}
              </div>

              {/* プロジェクト名 */}
              <div className="mt-2 text-sm text-slate-600">
                プロジェクト: <span className="font-medium">{invitation.projectName}</span>
              </div>

              {/* 権限 */}
              <div className="mt-1 text-sm text-slate-600">
                権限: <span className="font-medium">{invitation.role === 'guest' ? 'ゲスト' : 'メンバー'}</span>
              </div>

              {/* 招待日時と期限 */}
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  招待日: {formatDate(invitation.invitedAt)}
                </div>
                {invitation.status === 'pending' && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    期限: {formatDate(invitation.expiresAt)}
                  </div>
                )}
              </div>

              {/* メッセージ */}
              {invitation.message && (
                <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                  {invitation.message}
                </div>
              )}
            </div>

            {/* 削除ボタン */}
            {invitation.status === 'pending' && (
              <button
                onClick={() => onDelete(invitation.id)}
                className="ml-4 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                title="招待を取り消す"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
