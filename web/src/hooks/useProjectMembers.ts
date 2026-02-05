// プロジェクトメンバー関連のカスタムフック（React Query + IndexedDBキャッシュ）

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { listManageableProjectUsers, listCollaborators, type Collaborator } from '../lib/api';
import type { ManageableUserSummary } from '../lib/types';
import {
  cacheGet,
  cacheSet,
  cacheDelete,
  CACHE_KEY_MANAGEABLE_USERS_PREFIX,
  CACHE_KEY_COLLABORATORS,
  TTL_LONG,
  STALE_TIME_LONG,
} from '../lib/cache';

/**
 * 管理可能なユーザー一覧を取得するフック
 * IndexedDB + React Queryでキャッシュ
 */
export function useManageableUsers(projectId: string, enabled = true) {
  const [cachedData, setCachedData] = useState<ManageableUserSummary[] | undefined>(undefined);
  const loadedRef = useRef(false);

  // IndexedDBから非同期でキャッシュを読み込み（初回のみ）
  useEffect(() => {
    if (loadedRef.current || !projectId) return;
    loadedRef.current = true;
    const key = `${CACHE_KEY_MANAGEABLE_USERS_PREFIX}${projectId}`;
    cacheGet<ManageableUserSummary[]>(key).then((data) => {
      if (data && data.length > 0) {
        setCachedData(data);
      }
    }).catch(() => {});
  }, [projectId]);

  return useQuery({
    queryKey: ['manageable-users', projectId],
    queryFn: async () => {
      const users = await listManageableProjectUsers(projectId);
      // IndexedDBキャッシュに保存（バックグラウンド）
      const key = `${CACHE_KEY_MANAGEABLE_USERS_PREFIX}${projectId}`;
      cacheSet(key, users, TTL_LONG).catch(() => {});
      return users;
    },
    // IndexedDBキャッシュがあれば初期データとして使用
    ...(cachedData ? { initialData: cachedData } : {}),
    staleTime: STALE_TIME_LONG, // 5分間は再取得しない
    gcTime: 30 * 60 * 1000,   // 30分間キャッシュ保持
    enabled,
    refetchOnWindowFocus: false,
  });
}

/**
 * 協力者一覧を取得するフック
 * IndexedDB + React Queryでキャッシュ
 */
export function useCollaborators(enabled = true) {
  const [cachedData, setCachedData] = useState<Collaborator[] | undefined>(undefined);
  const loadedRef = useRef(false);

  // IndexedDBから非同期でキャッシュを読み込み（初回のみ）
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    cacheGet<Collaborator[]>(CACHE_KEY_COLLABORATORS).then((data) => {
      if (data && data.length > 0) {
        setCachedData(data);
      }
    }).catch(() => {});
  }, []);

  return useQuery({
    queryKey: ['collaborators'],
    queryFn: async () => {
      const data = await listCollaborators();
      const collaborators = data.collaborators || [];
      // IndexedDBキャッシュに保存（バックグラウンド）
      cacheSet(CACHE_KEY_COLLABORATORS, collaborators, TTL_LONG).catch(() => {});
      return collaborators;
    },
    // IndexedDBキャッシュがあれば初期データとして使用
    ...(cachedData ? { initialData: cachedData } : {}),
    staleTime: STALE_TIME_LONG, // 5分間は再取得しない
    gcTime: 30 * 60 * 1000,   // 30分間キャッシュ保持
    enabled,
    refetchOnWindowFocus: false,
  });
}

/**
 * キャッシュを強制的に再取得するフック
 * React QueryとIndexedDBの両方を無効化する
 */
export function useInvalidateProjectMembers() {
  const queryClient = useQueryClient();

  return {
    invalidateManageableUsers: (projectId: string) => {
      queryClient.invalidateQueries({ queryKey: ['manageable-users', projectId] });
      // IndexedDBキャッシュも無効化
      const key = `${CACHE_KEY_MANAGEABLE_USERS_PREFIX}${projectId}`;
      cacheDelete(key).catch(() => {});
    },
    invalidateCollaborators: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
      // IndexedDBキャッシュも無効化
      cacheDelete(CACHE_KEY_COLLABORATORS).catch(() => {});
    },
    invalidateAll: (projectId: string) => {
      queryClient.invalidateQueries({ queryKey: ['manageable-users', projectId] });
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
      // IndexedDBキャッシュも無効化
      const key = `${CACHE_KEY_MANAGEABLE_USERS_PREFIX}${projectId}`;
      cacheDelete(key).catch(() => {});
      cacheDelete(CACHE_KEY_COLLABORATORS).catch(() => {});
    },
  };
}

/**
 * 管理可能ユーザーのIndexedDBキャッシュを無効化する（フック外から呼び出し可能）
 */
export async function invalidateManageableUsersCache(projectId: string): Promise<void> {
  const key = `${CACHE_KEY_MANAGEABLE_USERS_PREFIX}${projectId}`;
  await cacheDelete(key).catch(() => {});
}

/**
 * 協力者のIndexedDBキャッシュを無効化する（フック外から呼び出し可能）
 */
export async function invalidateCollaboratorsCache(): Promise<void> {
  await cacheDelete(CACHE_KEY_COLLABORATORS).catch(() => {});
}
