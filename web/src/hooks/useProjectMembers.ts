// プロジェクトメンバー関連のカスタムフック（React Query キャッシュ）

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listManageableProjectUsers, listCollaborators, type Collaborator } from '../lib/api';
import type { ManageableUserSummary } from '../lib/types';

/**
 * 管理可能なユーザー一覧を取得するフック
 * 5分間キャッシュして無駄なAPI呼び出しを削減
 */
export function useManageableUsers(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['manageable-users', projectId],
    queryFn: () => listManageableProjectUsers(projectId),
    staleTime: 5 * 60 * 1000, // 5分間は再取得しない
    gcTime: 10 * 60 * 1000,   // 10分間キャッシュ保持
    enabled,
    refetchOnWindowFocus: false,
  });
}

/**
 * 協力者一覧を取得するフック
 * 5分間キャッシュして無駄なAPI呼び出しを削減
 */
export function useCollaborators(enabled = true) {
  return useQuery({
    queryKey: ['collaborators'],
    queryFn: async () => {
      const data = await listCollaborators();
      return data.collaborators || [];
    },
    staleTime: 5 * 60 * 1000, // 5分間は再取得しない
    gcTime: 10 * 60 * 1000,   // 10分間キャッシュ保持
    enabled,
    refetchOnWindowFocus: false,
  });
}

/**
 * キャッシュを強制的に再取得するフック
 */
export function useInvalidateProjectMembers() {
  const queryClient = useQueryClient();

  return {
    invalidateManageableUsers: (projectId: string) => {
      queryClient.invalidateQueries({ queryKey: ['manageable-users', projectId] });
    },
    invalidateCollaborators: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
    },
    invalidateAll: (projectId: string) => {
      queryClient.invalidateQueries({ queryKey: ['manageable-users', projectId] });
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
    },
  };
}
