import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';

interface GoogleDriveFolderPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Google Drive APIキーを環境変数から取得
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID;

export function GoogleDriveFolderPicker({
  value,
  onChange,
  placeholder = 'Google DriveフォルダのURLを入力',
  className = '',
}: GoogleDriveFolderPickerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // APIキーが設定されていない場合は通常の入力フィールドとして動作
    if (!GOOGLE_API_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_APP_ID) {
      setError('Google Drive APIキーが設定されていません');
      return;
    }

    // Google Picker APIスクリプトをロード
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      (window as any).gapi.load('client:picker', () => {
        setIsLoaded(true);
      });
    };
    script.onerror = () => setError('Google Drive APIの読み込みに失敗しました');
    document.head.appendChild(script);

    return () => {
      // クリーンアップは不要（スクリプトは再利用される）
    };
  }, []);

  const openPicker = async () => {
    if (!isLoaded) return;

    try {
      // OAuth2トークンを取得
      const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID!,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (response: any) => {
          if (response.access_token) {
            createPicker(response.access_token);
          }
        },
      });

      tokenClient.requestAccessToken();
    } catch (err) {
      console.error('Failed to open Google Drive Picker:', err);
      setError('Google Driveピッカーの起動に失敗しました');
    }
  };

  const createPicker = (accessToken: string) => {
    const picker = new (window as any).google.picker.PickerBuilder()
      .setAppId(GOOGLE_APP_ID!)
      .setOAuthToken(accessToken)
      .addView(
        new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.FOLDERS)
          .setSelectFolderEnabled(true)
          .setMode((window as any).google.picker.DocsViewMode.LIST)
      )
      .setCallback((data: any) => {
        if (data.action === (window as any).google.picker.Action.PICKED) {
          const doc = data.docs[0];
          // Google DriveフォルダのURLを構築
          const folderUrl = `https://drive.google.com/drive/folders/${doc.id}`;
          onChange(folderUrl);
        }
      })
      .build();

    picker.setVisible(true);
  };

  return (
    <div className="relative flex gap-2">
      <div className="flex-1 relative">
        <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
          placeholder={placeholder}
        />
      </div>
      {isLoaded && (
        <button
          type="button"
          onClick={openPicker}
          className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors"
          title="Google Driveから選択"
        >
          選択
        </button>
      )}
    </div>
  );
}

// Google API型定義の拡張
declare global {
  const gapi: any;
  const google: any;
}
