// プロジェクト招待API クライアント
import { buildAuthHeaders } from './api';

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api';

function getIdToken() {
  return localStorage.getItem('apdw_id_token') ?? undefined;
}

export interface ProjectInvitation {
  id: string;
  email: string;
  projectId: string;
  projectName: string;
  orgId: string;
  orgName: string;
  invitedBy: string;
  invitedByName: string;
  invitedAt: string;
  expiresAt: string;
  role: 'member' | 'guest';
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  acceptedAt?: string | null;
  acceptedBy?: string | null;
  message?: string | null;
}

export interface CreateInvitationInput {
  email: string;
  projectId: string;
  role?: 'member' | 'guest';
  message?: string;
}

/**
 * 招待一覧を取得（管理者のみ）
 */
export async function listInvitations(): Promise<ProjectInvitation[]> {
  const token = getIdToken();
  const response = await fetch(`${BASE_URL}/invitations`, {
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch invitations');
  }

  const data = await response.json();
  return data.invitations;
}

/**
 * 招待を作成（管理者のみ）
 */
export async function createInvitation(input: CreateInvitationInput): Promise<string> {
  const token = getIdToken();
  const response = await fetch(`${BASE_URL}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(token),
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create invitation');
  }

  const data = await response.json();
  return data.invitationId;
}

/**
 * 招待詳細を取得
 */
export async function getInvitation(invitationId: string): Promise<ProjectInvitation> {
  const token = getIdToken();
  const response = await fetch(`${BASE_URL}/invitations/${invitationId}`, {
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch invitation');
  }

  const data = await response.json();
  return data.invitation;
}

/**
 * 招待を承認
 */
export async function acceptInvitation(invitationId: string): Promise<void> {
  const token = getIdToken();
  const response = await fetch(`${BASE_URL}/invitations/${invitationId}/accept`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to accept invitation');
  }
}

/**
 * 招待を拒否
 */
export async function declineInvitation(invitationId: string): Promise<void> {
  const token = getIdToken();
  const response = await fetch(`${BASE_URL}/invitations/${invitationId}/decline`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to decline invitation');
  }
}

/**
 * 招待を削除（管理者のみ）
 */
export async function deleteInvitation(invitationId: string): Promise<void> {
  const token = getIdToken();
  const response = await fetch(`${BASE_URL}/invitations/${invitationId}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete invitation');
  }
}
