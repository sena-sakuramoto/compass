import { useState, useEffect, useRef } from 'react';
import { Bell, Check, X, Mail, CheckCheck } from 'lucide-react';
import { useFirebaseAuth } from '../lib/firebaseClient';
import { buildAuthHeaders } from '../lib/api';
import { useLocation } from 'react-router-dom';

import { resolveApiBase } from '../lib/apiBase';

const BASE_URL = resolveApiBase();

interface ProjectInvitation {
  projectId: string;
  projectName: string;
  invitedBy: string;
  invitedByName: string;
  role: string;
  invitedAt: string;
  message?: string;
}

export function InvitationNotifications() {
  const { user } = useFirebaseAuth();
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [processing, setProcessing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (user) {
      loadInvitations();
    }
  }, [user]);

  // 外部クリックで閉じる
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showDropdown]);

  // ページ遷移時に閉じる
  useEffect(() => {
    setShowDropdown(false);
  }, [location]);

  const loadInvitations = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const token = await user.getIdToken(true); // Force refresh
      const response = await fetch(`${BASE_URL}/users/${user.uid}/projects`, {
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
      });

      if (!response.ok) throw new Error('Failed to load projects');

      const projects = await response.json();

      // Filter only invited projects
      const pendingInvitations = projects
        .filter((p: any) => p.member?.status === 'invited')
        .map((p: any) => ({
          projectId: p.projectId,
          projectName: p.project?.物件名 || p.projectId,
          invitedBy: p.member.invitedBy || '',
          invitedByName: p.member.invitedByName || '不明',
          role: p.member.role || 'member',
          invitedAt: p.member.invitedAt || new Date().toISOString(),
          message: p.member.message,
        }));

      setInvitations(pendingInvitations);
    } catch (err) {
      console.error('Error loading invitations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (projectId: string) => {
    if (!user) return;

    try {
      setProcessing(true);
      const token = await user.getIdToken(true);
      const response = await fetch(`${BASE_URL}/projects/${projectId}/members/${user.uid}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
      });

      if (!response.ok) throw new Error('Failed to accept invitation');

      // 招待一覧を再読み込み
      await loadInvitations();
    } catch (err) {
      console.error('Error accepting invitation:', err);
      alert('招待の承認に失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  const handleAcceptAll = async () => {
    if (!user || invitations.length === 0) return;
    if (!confirm(`${invitations.length}件の招待をすべて承認しますか？`)) return;

    setProcessing(true);

    try {
      const token = await user.getIdToken(true);

      // Process all invitations in parallel
      const results = await Promise.allSettled(
        invitations.map(invitation =>
          fetch(`${BASE_URL}/projects/${invitation.projectId}/members/${user.uid}/accept`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...buildAuthHeaders(token),
            },
          })
        )
      );

      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed > 0) {
        alert(`${invitations.length - failed}件承認しました。${failed}件は失敗しました。`);
      }

      // Reload invitations
      await loadInvitations();
    } catch (err) {
      console.error('Error accepting all invitations:', err);
      alert('一括承認に失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeclineAll = async () => {
    if (!user || invitations.length === 0) return;
    if (!confirm(`${invitations.length}件の招待をすべて辞退しますか？`)) return;

    setProcessing(true);

    try {
      const token = await user.getIdToken(true);

      // Process all invitations in parallel
      const results = await Promise.allSettled(
        invitations.map(invitation =>
          fetch(`${BASE_URL}/projects/${invitation.projectId}/members/${user.uid}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              ...buildAuthHeaders(token),
            },
          })
        )
      );

      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed > 0) {
        alert(`${invitations.length - failed}件辞退しました。${failed}件は失敗しました。`);
      }

      // Reload invitations
      await loadInvitations();
    } catch (err) {
      console.error('Error declining all invitations:', err);
      alert('一括辞退に失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async (projectId: string) => {
    if (!user) return;
    if (!confirm('この招待を辞退しますか？')) return;

    try {
      setProcessing(true);
      const token = await user.getIdToken(true);
      const response = await fetch(`${BASE_URL}/projects/${projectId}/members/${user.uid}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to decline invitation');
      }

      // 招待一覧を再読み込み
      await loadInvitations();
    } catch (err) {
      console.error('Error declining invitation:', err);
      alert('招待の辞退に失敗しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
    } finally {
      setProcessing(false);
    }
  };

  if (!user) return null;

  const unreadCount = invitations.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        title="招待通知"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">プロジェクト招待</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {unreadCount > 0 ? `${unreadCount}件の招待があります` : '招待はありません'}
                  </p>
                </div>
                {unreadCount > 1 && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleAcceptAll}
                      disabled={processing}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="すべて承認"
                    >
                      <CheckCheck className="w-4 h-4" />
                      一括承認
                    </button>
                    <button
                      onClick={handleDeclineAll}
                      disabled={processing}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="すべて辞退"
                    >
                      <X className="w-4 h-4" />
                      一括辞退
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-gray-600">読み込み中...</p>
                </div>
              ) : invitations.length === 0 ? (
                <div className="p-8 text-center">
                  <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">現在招待はありません</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {invitations.map((invitation) => (
                    <div key={invitation.projectId} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900">{invitation.projectName}</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            {invitation.invitedByName} さんがあなたを招待しました
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            ロール: {invitation.role}
                          </p>
                          {invitation.message && (
                            <p className="text-sm text-gray-700 mt-2 p-2 bg-blue-50 rounded border border-blue-100">
                              {invitation.message}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAccept(invitation.projectId)}
                          disabled={processing}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Check className="w-4 h-4" />
                          承認
                        </button>
                        <button
                          onClick={() => handleDecline(invitation.projectId)}
                          disabled={processing}
                          className="flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <X className="w-4 h-4" />
                          辞退
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
      )}
    </div>
  );
}
