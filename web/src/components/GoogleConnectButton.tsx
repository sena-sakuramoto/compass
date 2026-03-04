/**
 * Googleアカウント接続ボタン
 * 接続済み: 緑バッジ + メールアドレス + 切断ボタン
 * 未接続: 「Googleアカウントを接続」ボタン
 */

import { useGoogleConnect } from '../hooks/useGoogleConnect';
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Unlink,
} from 'lucide-react';

interface GoogleConnectButtonProps {
  className?: string;
}

export function GoogleConnectButton({ className = '' }: GoogleConnectButtonProps) {
  const {
    connected,
    email,
    loading,
    connecting,
    error,
    connect,
    disconnect,
  } = useGoogleConnect();

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-gray-500 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>接続状態を確認中...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {connected ? (
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">Googleアカウント接続済み</p>
              {email && (
                <p className="text-xs text-green-600">{email}</p>
              )}
            </div>
          </div>
          <button
            onClick={disconnect}
            disabled={connecting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Unlink className="w-3.5 h-3.5" />
            )}
            切断
          </button>
        </div>
      ) : (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Googleアカウント未接続</p>
              <p className="text-xs text-amber-600 mt-1">
                Google Drive フォルダや Chat スペースの自動作成には、Googleアカウントの接続が必要です。
              </p>
            </div>
          </div>
          <button
            onClick={connect}
            disabled={connecting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                接続中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Googleアカウントを接続
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
