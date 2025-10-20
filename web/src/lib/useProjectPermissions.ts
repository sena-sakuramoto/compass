import { useState, useEffect } from 'react';
import { ProjectPermissions } from './auth-types';
import { useFirebaseAuth } from './firebaseClient';

/**
 * プロジェクトの権限を取得するフック
 */
export function useProjectPermissions(projectId: string | null): {
  permissions: ProjectPermissions | null;
  loading: boolean;
  error: Error | null;
} {
  const { user } = useFirebaseAuth();
  const [permissions, setPermissions] = useState<ProjectPermissions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user || !projectId) {
      setPermissions(null);
      return;
    }

    const fetchPermissions = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = await user.getIdToken();
        const response = await fetch(`/api/projects/${projectId}/members/${user.uid}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            // プロジェクトメンバーではない
            setPermissions(null);
            return;
          }
          throw new Error('Failed to fetch permissions');
        }

        const member = await response.json();
        setPermissions(member.permissions);
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [user, projectId]);

  return { permissions, loading, error };
}

/**
 * ユーザーがプロジェクトメンバーかどうかをチェックするフック
 */
export function useIsProjectMember(projectId: string | null): boolean {
  const { permissions } = useProjectPermissions(projectId);
  return permissions !== null;
}

/**
 * 権限チェックのヘルパー関数
 */
export function canEditProject(permissions: ProjectPermissions | null): boolean {
  return permissions?.canEditProject ?? false;
}

export function canManageMembers(permissions: ProjectPermissions | null): boolean {
  return permissions?.canManageMembers ?? false;
}

export function canEditTasks(permissions: ProjectPermissions | null): boolean {
  return permissions?.canEditTasks ?? false;
}

export function canCreateTasks(permissions: ProjectPermissions | null): boolean {
  return permissions?.canCreateTasks ?? false;
}

export function canDeleteTasks(permissions: ProjectPermissions | null): boolean {
  return permissions?.canDeleteTasks ?? false;
}

export function canViewTasks(permissions: ProjectPermissions | null): boolean {
  return permissions?.canViewTasks ?? false;
}

export function canUploadFiles(permissions: ProjectPermissions | null): boolean {
  return permissions?.canUploadFiles ?? false;
}
