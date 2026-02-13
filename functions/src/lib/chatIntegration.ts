/**
 * Google Chat連携モジュール
 * プロジェクト作成時のスペース自動作成、メンバー招待機能を提供
 */

import { getChatClient } from './googleClients';
import { Project } from './types';

export interface CreateChatSpaceOptions {
  displayName: string;
  description?: string | null;
  externalUserAllowed?: boolean;
}

export interface CreateChatSpaceResult {
  spaceId: string;
  spaceUrl: string;
  spaceName: string; // spaces/{spaceId} の形式
}

export interface AddChatMemberResult {
  success: boolean;
  memberName?: string;
  error?: string;
}

export interface BatchAddChatMembersResult {
  totalRequested: number;
  successCount: number;
  failedCount: number;
  results: Array<{
    email: string;
    success: boolean;
    memberName?: string;
    error?: string;
  }>;
}

/**
 * Google Chat スペースを作成
 * Note: Google Chat API の spaces.create は管理者権限が必要
 */
export async function createChatSpace(
  options: CreateChatSpaceOptions
): Promise<CreateChatSpaceResult> {
  const chat = await getChatClient();

  const response = await chat.spaces.create({
    requestBody: {
      spaceType: 'SPACE',
      displayName: options.displayName,
      spaceDetails: options.description ? {
        description: options.description,
      } : undefined,
      externalUserAllowed: options.externalUserAllowed ?? false,
    },
  });

  if (!response.data.name) {
    throw new Error('Failed to create Chat space: No name returned');
  }

  // スペース名は "spaces/{spaceId}" の形式
  const spaceName = response.data.name;
  const spaceId = spaceName.replace('spaces/', '');

  return {
    spaceId,
    spaceName,
    spaceUrl: `https://chat.google.com/room/${spaceId}`,
  };
}

/**
 * Chat スペースにメンバーを追加
 * @param spaceName "spaces/{spaceId}" 形式のスペース名
 * @param email 追加するユーザーのメールアドレス
 */
export async function addChatMember(
  spaceName: string,
  email: string
): Promise<AddChatMemberResult> {
  try {
    const chat = await getChatClient();

    const response = await chat.spaces.members.create({
      parent: spaceName,
      requestBody: {
        member: {
          name: `users/${email}`,
          type: 'HUMAN',
        },
      },
    });

    return {
      success: true,
      memberName: response.data.name || undefined,
    };
  } catch (error: any) {
    // 既にメンバーの場合はエラーにしない
    if (error?.code === 409 || error?.message?.includes('already a member')) {
      return {
        success: true,
        error: 'Already a member',
      };
    }

    return {
      success: false,
      error: error?.message || 'Unknown error',
    };
  }
}

/**
 * 複数のメンバーを一括でChat スペースに追加
 * @param spaceId スペースID
 * @param emails 追加するユーザーのメールアドレス配列
 */
export async function addChatMembersBatch(
  spaceId: string,
  emails: string[]
): Promise<BatchAddChatMembersResult> {
  const spaceName = spaceId.startsWith('spaces/') ? spaceId : `spaces/${spaceId}`;
  const results: BatchAddChatMembersResult['results'] = [];

  // 並列で処理（ただしレートリミットを考慮して適度に）
  const batchSize = 5;
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (email) => {
        const result = await addChatMember(spaceName, email);
        return {
          email,
          ...result,
        };
      })
    );
    results.push(...batchResults);
  }

  const successCount = results.filter(r => r.success).length;

  return {
    totalRequested: emails.length,
    successCount,
    failedCount: emails.length - successCount,
    results,
  };
}

/**
 * スペース名テンプレートを展開
 * @param template テンプレート文字列 (例: "【COMPASS】{projectName}")
 * @param project プロジェクトデータ
 * @returns 展開後の文字列
 */
export function expandSpaceNameTemplate(
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
 * スペースの存在確認
 */
export async function checkChatSpaceExists(spaceId: string): Promise<boolean> {
  try {
    const chat = await getChatClient();
    const spaceName = spaceId.startsWith('spaces/') ? spaceId : `spaces/${spaceId}`;
    await chat.spaces.get({ name: spaceName });
    return true;
  } catch (error: any) {
    if (error?.code === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * スペースのメンバー一覧を取得
 */
export async function listChatMembers(
  spaceId: string
): Promise<Array<{ email: string; displayName?: string }>> {
  const chat = await getChatClient();
  const spaceName = spaceId.startsWith('spaces/') ? spaceId : `spaces/${spaceId}`;

  const members: Array<{ email: string; displayName?: string }> = [];
  let pageToken: string | undefined;

  do {
    const response = await chat.spaces.members.list({
      parent: spaceName,
      pageToken,
    });

    for (const member of response.data.memberships || []) {
      if (member.member?.name && member.member.type === 'HUMAN') {
        // member.name は "users/{email}" の形式
        const email = member.member.name.replace('users/', '');
        members.push({
          email,
          displayName: member.member.displayName || undefined,
        });
      }
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return members;
}
