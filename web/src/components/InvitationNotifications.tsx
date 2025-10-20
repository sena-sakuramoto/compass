import { useState, useEffect } from 'react';
import { Bell, Check, X, Mail } from 'lucide-react';
import { useFirebaseAuth } from '../lib/firebaseClient';

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

  useEffect(() => {
    if (user) {
      loadInvitations();
    }
  }, [user]);

  const loadInvitations = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const response = await fetch(`/api/users/${user.uid}/invitations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load invitations');

      const data = await response.json();
      setInvitations(data);
    } catch (err) {
      console.error('Error loading invitations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (projectId: string) => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/projects/${projectId}/members/${user.uid}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to accept invitation');

      // 招待一覧を再読み込み
      loadInvitations();
    } catch (err) {
      console.error('Error accepting invitation:', err);
      alert('招待の承認に失敗しました');
    }
  };

  const handleDecline = async (projectId: string) => {
    if (!user) return;
    if (!confirm('この招待を辞退しますか？')) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/projects/${projectId}/members/${user.uid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to decline invitation');

      // 招待一覧を再読み込み
      loadInvitations();
    } catch (err) {
      console.error('Error declining invitation:', err);
      alert('招待の辞退に失敗しました');
    }
  };

  if (!user) return null;

  const unreadCount = invitations.length;

  return (
    <div className="relative">
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
        <>
          {/* オーバーレイ */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />

          {/* ドロップダウン */}
          <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">プロジェクト招待</h3>
              <p className="text-sm text-gray-600 mt-1">
                {unreadCount > 0 ? `${unreadCount}件の招待があります` : '招待はありません'}
              </p>
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
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          承認
                        </button>
                        <button
                          onClick={() => handleDecline(invitation.projectId)}
                          className="flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
        </>
      )}
    </div>
  );
}
