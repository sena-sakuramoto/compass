import { useState, useEffect, useRef } from 'react';
import { Bell, Check, X, Mail, CheckCheck, Trash2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  getUnreadNotificationCount,
  listNotifications,
  markNotificationAsRead,
  deleteNotification,
  buildAuthHeaders,
  type InAppNotification,
} from '../lib/api';
import { useFirebaseAuth } from '../lib/firebaseClient';

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api';

interface ProjectInvitation {
  projectId: string;
  projectName: string;
  invitedBy: string;
  invitedByName: string;
  role: string;
  invitedAt: string;
  message?: string;
}

export function NotificationBell() {
  const { user } = useFirebaseAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [processing, setProcessing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const location = useLocation();

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      setInvitations([]);
      setNotifications([]);
      return;
    }

    const tick = () => {
      loadUnreadCount();
      loadInvitations();
      loadNotifications();
    };

    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // 外部クリックで閉じる
  const updateDropdownPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 8;
    const right = window.innerWidth - rect.right - window.scrollX;
    setDropdownPosition({ top, right });
  };

  useEffect(() => {
    if (!showDropdown) return;
    updateDropdownPosition();

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setShowDropdown(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDropdown(false);
      }
    };

    const handleResize = () => updateDropdownPosition();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [showDropdown]);

  // ページ遷移時に閉じる
  useEffect(() => {
    setShowDropdown(false);
  }, [location]);

  const loadUnreadCount = async () => {
    try {
      const { count } = await getUnreadNotificationCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to load unread notification count:', error);
    }
  };

  const loadNotifications = async () => {
    if (!user) {
      setNotifications([]);
      return;
    }

    try {
      setNotificationsLoading(true);
      const data = await listNotifications({ limit: 10 });
      setNotifications(data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const loadInvitations = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const token = await user.getIdToken(true);
      const response = await fetch(`${BASE_URL}/users/${user.uid}/projects`, {
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
      });

      if (!response.ok) throw new Error('Failed to load projects');

      const projects = await response.json();

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

      await loadInvitations();
      await loadUnreadCount();
      await loadNotifications();
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

      await loadInvitations();
      await loadUnreadCount();
      await loadNotifications();
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

      await loadInvitations();
      await loadUnreadCount();
      await loadNotifications();
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

      await loadInvitations();
      await loadUnreadCount();
      await loadNotifications();
    } catch (err) {
      console.error('Error declining invitation:', err);
      alert('招待の辞退に失敗しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
    } finally {
      setProcessing(false);
    }
  };

  const handleNotificationMarked = (notificationId: string, read: boolean) => {
    setNotifications(prev =>
      prev.map((n) => (n.id === notificationId ? { ...n, read } : n))
    );
    if (read) {
      setUnreadCount((count) => Math.max(0, count - 1));
    } else {
      setUnreadCount((count) => count + 1);
    }
  };

  const handleNotificationRead = async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
      handleNotificationMarked(notificationId, true);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleNotificationDelete = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId);
      setNotifications(prev => prev.filter((n) => n.id !== notificationId));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const handleNotificationAction = async (notification: InAppNotification) => {
    if (!notification.read) {
      await handleNotificationRead(notification.id);
    }
    if (notification.actionUrl) {
      window.open(notification.actionUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const totalUnread = unreadCount + invitations.length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        onClick={() => {
          const next = !showDropdown;
          setShowDropdown(next);
          if (next) updateDropdownPosition();
        }}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        title="通知"
      >
        <Bell className="w-5 h-5" />
        {totalUnread > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full min-w-[18px]">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {showDropdown && dropdownPosition && (
        <div
          ref={dropdownRef}
          className="fixed w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999]"
          style={{ top: dropdownPosition.top, right: dropdownPosition.right }}
        >
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">通知</h3>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {/* プロジェクト招待セクション */}
            {invitations.length > 0 && (
              <div className="border-b border-gray-200">
                <div className="p-3 bg-blue-50 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">プロジェクト招待</h4>
                    <p className="text-xs text-gray-600 mt-0.5">{invitations.length}件の招待があります</p>
                  </div>
                  {invitations.length > 1 && (
                    <div className="flex gap-1">
                      <button
                        onClick={handleAcceptAll}
                        disabled={processing}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                        title="すべて承認"
                      >
                        <CheckCheck className="w-3 h-3" />
                        一括承認
                      </button>
                      <button
                        onClick={handleDeclineAll}
                        disabled={processing}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                        title="すべて辞退"
                      >
                        <X className="w-3 h-3" />
                        一括辞退
                      </button>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-gray-200">
                  {invitations.map((invitation) => (
                    <div key={invitation.projectId} className="p-3 hover:bg-gray-50 transition-colors">
                      <div className="mb-2">
                        <h5 className="font-semibold text-sm text-gray-900">{invitation.projectName}</h5>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {invitation.invitedByName} さんから招待
                        </p>
                        {invitation.message && (
                          <p className="text-xs text-gray-700 mt-1 p-2 bg-blue-50 rounded border border-blue-100">
                            {invitation.message}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAccept(invitation.projectId)}
                          disabled={processing}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" />
                          承認
                        </button>
                        <button
                          onClick={() => handleDecline(invitation.projectId)}
                          disabled={processing}
                          className="flex items-center justify-center px-2 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                          <X className="w-3 h-3" />
                          辞退
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 一般通知セクション */}
            <div className="border-b border-gray-200">
              <div className="p-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">アプリ内通知</h4>
                  <p className="text-xs text-gray-600 mt-0.5">
                    最新の通知を表示します
                  </p>
                </div>
                <Link
                  to="/notifications"
                  className="text-xs text-blue-600 hover:text-blue-700"
                  onClick={() => setShowDropdown(false)}
                >
                  一覧を開く
                </Link>
              </div>
              <div className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
                {notificationsLoading ? (
                  <div className="p-4 text-center text-sm text-gray-500">読み込み中...</div>
                ) : notifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">
                    通知はありません
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 text-sm ${notification.read ? 'bg-white' : 'bg-orange-50'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 truncate">{notification.title}</span>
                            {!notification.read && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-orange-500 text-white rounded-full">
                                未読
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-1 break-words">{notification.message}</p>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-2">
                            <span>{new Date(notification.createdAt).toLocaleString('ja-JP')}</span>
                            {notification.actionUrl && (
                              <button
                                onClick={() => handleNotificationAction(notification)}
                                className="text-blue-600 hover:text-blue-700 font-medium"
                              >
                                詳細を見る
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          {!notification.read && (
                            <button
                              onClick={() => handleNotificationRead(notification.id)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="既読にする"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleNotificationDelete(notification.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {invitations.length === 0 && unreadCount === 0 && notifications.length === 0 && (
              <div className="p-8 text-center">
                <Mail className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">通知はありません</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
