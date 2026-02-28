import { useQuery } from '@tanstack/react-query';
import { listProjectMembers } from '../api';
import type { ProjectMember } from '../auth-types';

export const projectMembersQueryKey = (projectId: string | undefined) => ['projectMembers', projectId] as const;

type UseProjectMembersOptions = {
  initialData?: ProjectMember[];
};

export function useProjectMembers(projectId: string | undefined, options?: UseProjectMembersOptions) {
  return useQuery<ProjectMember[]>({
    queryKey: projectMembersQueryKey(projectId),
    queryFn: () => listProjectMembers(projectId!, { status: 'active' }),
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...(options?.initialData ? { initialData: options.initialData } : {}),
  });
}
