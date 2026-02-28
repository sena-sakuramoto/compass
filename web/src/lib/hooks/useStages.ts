import { useQuery } from '@tanstack/react-query';
import { listStages } from '../api';
import type { Stage } from '../types';

export const stagesQueryKey = (projectId: string | undefined) => ['stages', projectId] as const;

export function useStages(projectId: string | undefined) {
  return useQuery<Stage[]>({
    queryKey: stagesQueryKey(projectId),
    queryFn: async () => {
      const { stages } = await listStages(projectId!);
      return stages;
    },
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
