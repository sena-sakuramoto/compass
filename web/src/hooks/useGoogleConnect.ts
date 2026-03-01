/**
 * Per-user Google OAuth 接続フック
 * Google Identity Services (GIS) を使用してOAuthポップアップを表示し、
 * authorization codeをバックエンドに送信してトークンを保存する
 */

import { useState, useEffect, useCallback } from 'react';
import { connectGoogle, disconnectGoogle, getGoogleStatus } from '../lib/api';

// GIS types - access via window.google.accounts.oauth2
interface GisCodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode?: 'popup' | 'redirect';
  access_type?: string;
  callback: (response: { code?: string; error?: string }) => void;
}

interface GisCodeClient {
  requestCode: () => void;
}

function getGisOAuth2(): { initCodeClient: (config: GisCodeClientConfig) => GisCodeClient } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = (window as any).google;
  return g?.accounts?.oauth2 ?? null;
}

export interface GoogleConnectState {
  connected: boolean;
  email: string | null;
  loading: boolean;
  connecting: boolean;
  error: string | null;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/chat.spaces.create',
  'https://www.googleapis.com/auth/chat.memberships',
].join(' ');

export function useGoogleConnect() {
  const [state, setState] = useState<GoogleConnectState>({
    connected: false,
    email: null,
    loading: true,
    connecting: false,
    error: null,
  });

  // 接続状態を取得
  const fetchStatus = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const status = await getGoogleStatus();
      setState(prev => ({
        ...prev,
        connected: status.connected,
        email: status.email || null,
        loading: false,
      }));
    } catch (err) {
      console.error('[useGoogleConnect] Failed to fetch status:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: '接続状態の取得に失敗しました',
      }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Google接続を開始
  const connect = useCallback(() => {
    if (!GOOGLE_CLIENT_ID) {
      setState(prev => ({
        ...prev,
        error: 'Google Client IDが設定されていません',
      }));
      return;
    }

    const gisOAuth2 = getGisOAuth2();
    if (!gisOAuth2) {
      setState(prev => ({
        ...prev,
        error: 'Google Identity Servicesが読み込まれていません。ページを再読み込みしてください。',
      }));
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    const client = gisOAuth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      ux_mode: 'popup',
      access_type: 'offline',
      callback: async (response) => {
        if (response.error) {
          setState(prev => ({
            ...prev,
            connecting: false,
            error: `Google認証エラー: ${response.error}`,
          }));
          return;
        }

        if (!response.code) {
          setState(prev => ({
            ...prev,
            connecting: false,
            error: '認証コードが取得できませんでした',
          }));
          return;
        }

        try {
          const result = await connectGoogle(response.code);
          setState(prev => ({
            ...prev,
            connected: true,
            email: result.email || null,
            connecting: false,
          }));
        } catch (err: any) {
          console.error('[useGoogleConnect] Failed to connect:', err);
          setState(prev => ({
            ...prev,
            connecting: false,
            error: err.message || 'Google接続に失敗しました',
          }));
        }
      },
    });

    client.requestCode();
  }, []);

  // Google接続を解除
  const disconnect = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, connecting: true, error: null }));
      await disconnectGoogle();
      setState(prev => ({
        ...prev,
        connected: false,
        email: null,
        connecting: false,
      }));
    } catch (err: any) {
      console.error('[useGoogleConnect] Failed to disconnect:', err);
      setState(prev => ({
        ...prev,
        connecting: false,
        error: err.message || '接続解除に失敗しました',
      }));
    }
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    refresh: fetchStatus,
  };
}
