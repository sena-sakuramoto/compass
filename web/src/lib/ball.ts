import type { Task } from './types';

type BallTaskLike = Pick<Task, 'ballHolder' | 'assignee' | '担当者' | '担当者メール'>;

export function normalizeBallLabel(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function getTaskAssigneeLabel(task: BallTaskLike): string | null {
  return normalizeBallLabel(task.assignee ?? task.担当者 ?? task.担当者メール ?? null);
}

export function normalizeBallHolderForStorage(
  ballHolder?: string | null,
  assignee?: string | null
): string | null {
  const normalizedBallHolder = normalizeBallLabel(ballHolder);
  const normalizedAssignee = normalizeBallLabel(assignee);
  if (!normalizedBallHolder) return null;
  if (normalizedAssignee && normalizedBallHolder === normalizedAssignee) {
    return null;
  }
  return normalizedBallHolder;
}

export function getEffectiveBallHolder(task: BallTaskLike): string | null {
  const assignee = getTaskAssigneeLabel(task);
  return normalizeBallHolderForStorage(task.ballHolder, assignee) ?? assignee;
}

export function ballHolderTracksAssignee(
  ballHolder?: string | null,
  assignee?: string | null
): boolean {
  const normalizedBallHolder = normalizeBallLabel(ballHolder);
  const normalizedAssignee = normalizeBallLabel(assignee);
  return Boolean(normalizedBallHolder && normalizedAssignee && normalizedBallHolder === normalizedAssignee);
}
