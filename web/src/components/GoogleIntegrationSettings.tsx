import { useState, useEffect } from 'react';
import {
  getGoogleIntegrationSettings,
  updateGoogleIntegrationSettings
} from '../lib/api';
import type { GoogleIntegrationSettings as GoogleIntegrationSettingsType } from '../lib/types';
import {
  FolderOpen,
  MessageSquare,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

interface GoogleIntegrationSettingsProps {
  className?: string;
}

const DEFAULT_SETTINGS: Omit<GoogleIntegrationSettingsType, 'updatedAt' | 'updatedBy'> = {
  drive: {
    enabled: false,
    parentFolderId: null,
    parentFolderUrl: null,
    folderNameTemplate: '{projectName}',
  },
  chat: {
    enabled: false,
    spaceNameTemplate: '【COMPASS】{projectName}',
    defaultDescription: null,
  },
  memberSyncMode: 'none',
};

export function GoogleIntegrationSettings({ className = '' }: GoogleIntegrationSettingsProps) {
  const [settings, setSettings] = useState<Omit<GoogleIntegrationSettingsType, 'updatedAt' | 'updatedBy'>>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const response = await getGoogleIntegrationSettings();
      setSettings({
        drive: response.settings.drive || DEFAULT_SETTINGS.drive,
        chat: response.settings.chat || DEFAULT_SETTINGS.chat,
        memberSyncMode: response.settings.memberSyncMode || 'none',
      });
    } catch (err) {
      console.error('Failed to load Google integration settings:', err);
      setError('設定の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      await updateGoogleIntegrationSettings(settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save Google integration settings:', err);
      setError('設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">読み込み中...</span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Google連携設定</h2>
        <p className="mt-1 text-sm text-gray-500">
          プロジェクト作成時に Google Drive フォルダと Google Chat スペースを自動作成します
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">設定を保存しました</span>
        </div>
      )}

      <div className="p-6 space-y-8">
        {/* Google Drive 設定 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="w-5 h-5 text-yellow-600" />
            <h3 className="font-medium text-gray-900">Google Drive</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* 有効/無効 */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.drive.enabled}
                onChange={(e) => setSettings({
                  ...settings,
                  drive: { ...settings.drive, enabled: e.target.checked }
                })}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                プロジェクト作成時にフォルダを自動作成
              </span>
            </label>

            {settings.drive.enabled && (
              <>
                {/* 親フォルダURL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    親フォルダURL
                    <button
                      type="button"
                      className="ml-1 text-gray-400 hover:text-gray-600"
                      title="フォルダをこの親フォルダ内に作成します"
                    >
                      <HelpCircle className="w-4 h-4 inline" />
                    </button>
                  </label>
                  <input
                    type="url"
                    value={settings.drive.parentFolderUrl || ''}
                    onChange={(e) => {
                      const url = e.target.value;
                      // URLからフォルダIDを抽出
                      let folderId: string | null = null;
                      if (url) {
                        const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
                        if (match) {
                          folderId = match[1];
                        }
                      }
                      setSettings({
                        ...settings,
                        drive: {
                          ...settings.drive,
                          parentFolderUrl: url || null,
                          parentFolderId: folderId
                        }
                      });
                    }}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Google DriveのフォルダURLを貼り付けてください
                  </p>
                </div>

                {/* フォルダ名テンプレート */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    フォルダ名テンプレート
                  </label>
                  <input
                    type="text"
                    value={settings.drive.folderNameTemplate}
                    onChange={(e) => setSettings({
                      ...settings,
                      drive: { ...settings.drive, folderNameTemplate: e.target.value }
                    })}
                    placeholder="{projectName}"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    使用可能な変数: {'{projectName}'}, {'{projectId}'}, {'{client}'}
                  </p>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Google Chat 設定 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-green-600" />
            <h3 className="font-medium text-gray-900">Google Chat</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* 有効/無効 */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.chat.enabled}
                onChange={(e) => setSettings({
                  ...settings,
                  chat: { ...settings.chat, enabled: e.target.checked }
                })}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                プロジェクト作成時にスペースを自動作成
              </span>
            </label>

            {settings.chat.enabled && (
              <>
                {/* スペース名テンプレート */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    スペース名テンプレート
                  </label>
                  <input
                    type="text"
                    value={settings.chat.spaceNameTemplate}
                    onChange={(e) => setSettings({
                      ...settings,
                      chat: { ...settings.chat, spaceNameTemplate: e.target.value }
                    })}
                    placeholder="【COMPASS】{projectName}"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    使用可能な変数: {'{projectName}'}, {'{projectId}'}, {'{client}'}
                  </p>
                </div>

                {/* デフォルト説明 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    デフォルト説明文（オプション）
                  </label>
                  <textarea
                    value={settings.chat.defaultDescription || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      chat: { ...settings.chat, defaultDescription: e.target.value || null }
                    })}
                    placeholder="COMPASSプロジェクト連携スペースです"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* メンバー同期設定 */}
        {(settings.drive.enabled || settings.chat.enabled) && (
          <section>
            <h3 className="font-medium text-gray-900 mb-4">メンバー同期</h3>
            <div className="space-y-2 pl-0">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="memberSyncMode"
                  value="none"
                  checked={settings.memberSyncMode === 'none'}
                  onChange={() => setSettings({ ...settings, memberSyncMode: 'none' })}
                  className="w-4 h-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  自動同期しない（手動で招待）
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="memberSyncMode"
                  value="addOnly"
                  checked={settings.memberSyncMode === 'addOnly'}
                  onChange={() => setSettings({ ...settings, memberSyncMode: 'addOnly' })}
                  className="w-4 h-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  メンバー追加時に自動招待
                </span>
              </label>
            </div>
          </section>
        )}

        {/* 注意事項 */}
        <section className="bg-blue-50 p-4 rounded-md">
          <h4 className="text-sm font-medium text-blue-800 mb-2">設定に関する注意</h4>
          <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
            <li>Google Workspace 管理者によるドメイン全体委任の設定が必要です</li>
            <li>サービスアカウントに適切な API スコープを付与してください</li>
            <li>Drive: https://www.googleapis.com/auth/drive</li>
            <li>Chat: chat.spaces, chat.spaces.create, chat.memberships</li>
          </ul>
        </section>
      </div>

      {/* 保存ボタン */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              設定を保存
            </>
          )}
        </button>
      </div>
    </div>
  );
}
