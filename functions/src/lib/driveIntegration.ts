/**
 * Google Drive連携モジュール
 * プロジェクト作成時のフォルダ自動作成機能を提供
 */

import { getDriveClient } from './googleClients';
import { Project } from './types';

export interface CreateDriveFolderOptions {
  folderName: string;
  parentFolderId?: string | null;
}

export interface CreateDriveFolderResult {
  folderId: string;
  folderUrl: string;
}

/**
 * Google Drive にフォルダを作成
 */
export async function createDriveFolder(
  options: CreateDriveFolderOptions
): Promise<CreateDriveFolderResult> {
  const drive = await getDriveClient();

  const fileMetadata: {
    name: string;
    mimeType: string;
    parents?: string[];
  } = {
    name: options.folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (options.parentFolderId) {
    fileMetadata.parents = [options.parentFolderId];
  }

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, webViewLink',
  });

  if (!response.data.id) {
    throw new Error('Failed to create Drive folder: No ID returned');
  }

  return {
    folderId: response.data.id,
    folderUrl: response.data.webViewLink || `https://drive.google.com/drive/folders/${response.data.id}`,
  };
}

/**
 * フォルダ名テンプレートを展開
 * @param template テンプレート文字列 (例: "{projectName}")
 * @param project プロジェクトデータ
 * @returns 展開後の文字列
 */
export function expandFolderNameTemplate(
  template: string,
  project: Pick<Project, '物件名' | 'クライアント' | 'id'>
): string {
  return template
    .replace(/{projectName}/g, project.物件名 || '')
    .replace(/{projectId}/g, project.id || '')
    .replace(/{client}/g, project.クライアント || '')
    .trim();
}

/**
 * フォルダを削除（オプション: プロジェクト削除時に使用可能）
 */
export async function deleteDriveFolder(folderId: string): Promise<void> {
  const drive = await getDriveClient();
  await drive.files.delete({ fileId: folderId });
}

/**
 * フォルダの存在確認
 */
export async function checkDriveFolderExists(folderId: string): Promise<boolean> {
  try {
    const drive = await getDriveClient();
    await drive.files.get({ fileId: folderId, fields: 'id' });
    return true;
  } catch (error: any) {
    if (error?.code === 404) {
      return false;
    }
    throw error;
  }
}
