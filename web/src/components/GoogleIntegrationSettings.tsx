import { useState, useEffect, useMemo } from 'react';
import {
  getGoogleIntegrationSettings,
  updateGoogleIntegrationSettings,
} from '../lib/api';
import type { GoogleIntegrationSettings as GoogleIntegrationSettingsType } from '../lib/types';
import {
  FolderOpen,
  MessageSquare,
  ArrowRightLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { GoogleConnectButton } from './GoogleConnectButton';
import { CalendarSyncSettings } from './CalendarSyncSettings';

// フォルダ名の構成要素
type FolderPart = 'number' | 'projectName' | 'client' | 'projectId';
interface FolderPartConfig {
  key: FolderPart;
  label: string;
  enabled: boolean;
  templateVar: string;
}

const SEPARATOR_OPTIONS = [
  { value: '_', label: '_（アンダースコア）' },
  { value: '-', label: '-（ハイフン）' },
  { value: ' ', label: '（スペース）' },
] as const;

/** テンプレート文字列からパーツ構成を解析 */
function parseTemplate(template: string): { parts: FolderPart[]; separator: string } {
  // セパレータを推測
  let separator = '_';
  for (const sep of ['_', '-', ' ']) {
    if (template.includes(sep)) {
      separator = sep;
      break;
    }
  }

  const allParts: FolderPart[] = ['number', 'projectName', 'client', 'projectId'];
  const templateVars: Record<string, FolderPart> = {
    '{number}': 'number',
    '{projectName}': 'projectName',
    '{client}': 'client',
    '{projectId}': 'projectId',
  };

  // テンプレート内の変数を出現順に抽出
  const found: FolderPart[] = [];
  const regex = /\{(number|projectName|client|projectId)\}/g;
  let match;
  while ((match = regex.exec(template)) !== null) {
    const part = templateVars[match[0]];
    if (part && !found.includes(part)) found.push(part);
  }

  // 見つからなかったパーツは found に含めない（無効扱い）
  return { parts: found.length > 0 ? found : ['projectName'], separator };
}

/** パーツ構成からテンプレート文字列を生成 */
function buildTemplate(enabledParts: FolderPart[], separator: string): string {
  const varMap: Record<FolderPart, string> = {
    number: '{number}',
    projectName: '{projectName}',
    client: '{client}',
    projectId: '{projectId}',
  };
  return enabledParts.map(p => varMap[p]).join(separator);
}

/** プレビュー文字列を生成 */
function buildPreview(enabledParts: FolderPart[], separator: string, numberStart: number, numberDigits: number): string {
  const sampleMap: Record<FolderPart, string> = {
    number: String(numberStart).padStart(numberDigits, '0'),
    projectName: 'サンプル物件A',
    client: '田中建設',
    projectId: 'P-0001',
  };
  return enabledParts.map(p => sampleMap[p]).join(separator);
}

interface GoogleIntegrationSettingsProps {
  className?: string;
  currentUserRole?: string;
}

const DEFAULT_SETTINGS: Omit<GoogleIntegrationSettingsType, 'updatedAt' | 'updatedBy'> = {
  drive: {
    enabled: false,
    parentFolderId: null,
    parentFolderUrl: null,
    folderNameTemplate: '{projectName}',
    numberStart: 1,
    numberDigits: 3,
  },
  chat: {
    enabled: false,
    spaceNameTemplate: '【COMPASS】{projectName}',
    defaultDescription: null,
  },
  memberSyncMode: 'none',
};

export function GoogleIntegrationSettings({ className = '', currentUserRole }: GoogleIntegrationSettingsProps) {
  const [settings, setSettings] = useState<Omit<GoogleIntegrationSettingsType, 'updatedAt' | 'updatedBy'>>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false); // 一度でも保存されたか

  // フォルダ名ビルダーの状態
  const [folderParts, setFolderParts] = useState<FolderPart[]>(['projectName']);
  const [separator, setSeparator] = useState('_');

  // テンプレートからビルダー状態を同期
  const syncBuilderFromTemplate = (template: string) => {
    const parsed = parseTemplate(template);
    setFolderParts(parsed.parts);
    setSeparator(parsed.separator);
  };

  // ビルダー状態からテンプレートを更新
  const updateTemplateFromBuilder = (parts: FolderPart[], sep: string) => {
    const template = buildTemplate(parts, sep);
    setSettings(prev => ({
      ...prev,
      drive: { ...prev.drive, folderNameTemplate: template },
    }));
  };

  const allParts: { key: FolderPart; label: string }[] = [
    { key: 'number', label: '連番' },
    { key: 'projectName', label: '物件名' },
    { key: 'client', label: 'クライアント名' },
    { key: 'projectId', label: 'プロジェクトID' },
  ];

  const folderPreview = useMemo(
    () => buildPreview(folderParts, separator, settings.drive.numberStart ?? 1, settings.drive.numberDigits ?? 3),
    [folderParts, separator, settings.drive.numberStart, settings.drive.numberDigits]
  );
  const isAdminUser = currentUserRole === 'super_admin' || currentUserRole === 'admin' || currentUserRole === 'owner';

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const response = await getGoogleIntegrationSettings();
      const driveSettings = { ...DEFAULT_SETTINGS.drive, ...response.settings.drive };
      setSettings({
        drive: driveSettings,
        chat: response.settings.chat || DEFAULT_SETTINGS.chat,
        memberSyncMode: response.settings.memberSyncMode || 'none',
      });
      syncBuilderFromTemplate(driveSettings.folderNameTemplate);
      // 設定が一度でも保存されていれば savedOnce
      if (response.settings.drive?.enabled || response.settings.chat?.enabled) {
        setSavedOnce(true);
      }
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
      setSavedOnce(true);
      setTimeout(() => setSuccess(false), 5000);
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Google連携設定</h2>
          {savedOnce && (settings.drive.enabled || settings.chat.enabled) && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              <CheckCircle className="w-3.5 h-3.5" />
              設定済み
            </span>
          )}
        </div>
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
        {/* Googleアカウント接続 */}
        <section>
          <h3 className="font-medium text-gray-900 mb-3">Googleアカウント接続</h3>
          <GoogleConnectButton />
        </section>

        {/* カレンダー双方向同期設定（全ユーザー） */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            <h3 className="font-medium text-gray-900">カレンダー同期</h3>
          </div>
          <CalendarSyncSettings />
        </section>

        {isAdminUser && (
          <>
            {/* Google Drive 設定 */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <FolderOpen className="w-5 h-5 text-yellow-600" />
                <h3 className="font-medium text-gray-900">Google Drive</h3>
                {savedOnce && settings.drive.enabled && (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">ON</span>
                )}
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

                    {/* フォルダ名の構成 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        フォルダ名の構成
                      </label>

                  {/* パーツ選択 */}
                  <div className="space-y-2 mb-3">
                    {allParts.map((part) => {
                      const isEnabled = folderParts.includes(part.key);
                      const idx = folderParts.indexOf(part.key);
                      return (
                        <div key={part.key} className="flex items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={(e) => {
                                let newParts: FolderPart[];
                                if (e.target.checked) {
                                  newParts = [...folderParts, part.key];
                                } else {
                                  newParts = folderParts.filter(p => p !== part.key);
                                }
                                setFolderParts(newParts);
                                updateTemplateFromBuilder(newParts, separator);
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{part.label}</span>
                          </label>
                          {/* 並び順ボタン */}
                          {isEnabled && folderParts.length > 1 && (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => {
                                  const newParts = [...folderParts];
                                  [newParts[idx - 1], newParts[idx]] = [newParts[idx], newParts[idx - 1]];
                                  setFolderParts(newParts);
                                  updateTemplateFromBuilder(newParts, separator);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === folderParts.length - 1}
                                onClick={() => {
                                  const newParts = [...folderParts];
                                  [newParts[idx], newParts[idx + 1]] = [newParts[idx + 1], newParts[idx]];
                                  setFolderParts(newParts);
                                  updateTemplateFromBuilder(newParts, separator);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 区切り文字 */}
                  {folderParts.length > 1 && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">区切り文字</label>
                      <select
                        value={separator}
                        onChange={(e) => {
                          setSeparator(e.target.value);
                          updateTemplateFromBuilder(folderParts, e.target.value);
                        }}
                        className="px-3 py-1.5 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                      >
                        {SEPARATOR_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 連番設定 */}
                  {folderParts.includes('number') && (
                    <div className="grid grid-cols-2 gap-4 mb-3 p-3 bg-gray-50 rounded-md">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">開始番号</label>
                        <input
                          type="number"
                          min={1}
                          value={settings.drive.numberStart ?? 1}
                          onChange={(e) => setSettings({
                            ...settings,
                            drive: { ...settings.drive, numberStart: parseInt(e.target.value) || 1 }
                          })}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">既存フォルダの続きから</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">桁数</label>
                        <input
                          type="number"
                          min={1}
                          max={6}
                          value={settings.drive.numberDigits ?? 3}
                          onChange={(e) => setSettings({
                            ...settings,
                            drive: { ...settings.drive, numberDigits: parseInt(e.target.value) || 3 }
                          })}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">例: 3桁 → 001, 021</p>
                      </div>
                    </div>
                  )}

                  {/* プレビュー */}
                  {folderParts.length > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-xs text-blue-600 mb-1">プレビュー</p>
                      <p className="text-sm font-medium text-blue-900">{folderPreview}</p>
                    </div>
                  )}
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
                {savedOnce && settings.chat.enabled && (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">ON</span>
                )}
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
          </>
        )}

        {/* 注意事項 */}
        <section className="bg-blue-50 p-4 rounded-md">
          <h4 className="text-sm font-medium text-blue-800 mb-2">設定に関する注意</h4>
          <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
            <li>上部の「Googleアカウントを接続」で、ご自身のGoogleアカウントを連携してください</li>
            <li>DriveフォルダやChatスペースは接続したアカウントで作成されます</li>
            <li>Google接続が未完了の場合、プロジェクト作成時にDrive/Chatの自動作成はスキップされます</li>
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
