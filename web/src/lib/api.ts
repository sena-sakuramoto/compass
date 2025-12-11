import type { Project, Task, Person, ManageableUserSummary } from './types';
import type { ProjectMember } from './auth-types';
import { getCachedIdToken } from './authToken';

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api';

// カスタムエラークラス（ステータスコードを保持）
export class ApiError extends Error {
  constructor(message: string, public status: number, public statusText: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function buildAuthHeaders(token?: string): Record<string, string> {
  if (!token) return {};
  const value = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  return { Authorization: value };
}

function mergeHeaders(base: Record<string, string>, extra?: HeadersInit): HeadersInit {
  if (!extra) return base;

  const result: Record<string, string> = { ...base };

  if (extra instanceof Headers) {
    extra.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (Array.isArray(extra)) {
    for (const [key, value] of extra) {
      result[key] = value as string;
    }
    return result;
  }

  return { ...result, ...(extra as Record<string, string>) };
}

/**
 * localStorage からトークンを取得（後方互換性のため残す）
 */
function getIdToken() {
  return localStorage.getItem('apdw_id_token') ?? undefined;
}

/**
 * localStorage にトークンを保存（後方互換性のため残す）
 */
export function setIdToken(token?: string) {
  if (token) {
    localStorage.setItem('apdw_id_token', token);
  } else {
    localStorage.removeItem('apdw_id_token');
  }
}

/**
 * 低レベルAPIフェッチ関数（Responseオブジェクトを返す）
 * コメント投稿など、細かい制御が必要な場合に使用
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getCachedIdToken();
  const { headers: optionHeaders, credentials: optionCredentials, ...restOptions } = options;
  const authHeaders = buildAuthHeaders(token);
  const headers = mergeHeaders({ 'Content-Type': 'application/json', ...authHeaders }, optionHeaders);

  const fetchOptions: RequestInit = {
    ...restOptions,
    headers,
    credentials: optionCredentials ?? 'include',
  };

  return fetch(`${BASE_URL}${path}`, fetchOptions);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // キャッシュされたIDトークンを取得（重複呼び出しを防ぐ）
  // console.log(`[api] 🔵 Starting ${options.method || 'GET'} ${path}`);
  const token = await getCachedIdToken();

  const { headers: optionHeaders, credentials: optionCredentials, ...restOptions } = options;
  const authHeaders = buildAuthHeaders(token);
  const headers = mergeHeaders({ 'Content-Type': 'application/json', ...authHeaders }, optionHeaders);

  const fetchOptions: RequestInit = {
    ...restOptions,
    headers,
    credentials: optionCredentials ?? 'include',
  };

  const res = await fetch(`${BASE_URL}${path}`, fetchOptions);

  if (!res.ok) {
    const text = await res.text();

    // 404エラーはdebugレベルで記録（プロジェクトがFirestoreに存在しない可能性）
    if (res.status === 404) {
      console.debug(`[api] ${options.method || 'GET'} ${path} not found (404)`);
    } else {
      console.error(`[api] ${options.method || 'GET'} ${path} failed:`, {
        status: res.status,
        statusText: res.statusText,
        response: text,
        hasAuthHeader: !!token,
      });
    }

    if (res.status === 401) {
      throw new ApiError(`認証エラー (401): ログインしていないか、トークンが無効です。\n${text || res.statusText}`, res.status, res.statusText);
    }

    throw new ApiError(text || res.statusText, res.status, res.statusText);
  }

  console.debug(`[api] ${options.method || 'GET'} ${path} succeeded (${res.status})`);

  if (res.status === 204) return undefined as unknown as T;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return res as unknown as T;
}

export async function listProjects() {
  return request<{ projects: Project[] }>('/projects');
}

export interface ListTasksParams {
  projectId?: string;
  assignee?: string;
  assigneeEmail?: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
}

export async function listTasks(params: ListTasksParams) {
  const query = new URLSearchParams();
  if (params.projectId && params.projectId !== 'all') query.set('projectId', params.projectId);
  if (params.assignee && params.assignee !== 'all') query.set('assignee', params.assignee);
  if (params.assigneeEmail) query.set('assigneeEmail', params.assigneeEmail);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.q) query.set('q', params.q);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  const qs = query.toString();
  const suffix = qs ? `?${qs}` : '';
  return request<{ tasks: Task[] }>(`/tasks${suffix}`);
}

export async function listPeople() {
  return request<{ people: Person[] }>('/people');
}

export async function createTask(payload: Partial<Task>) {
  console.log('[api.createTask] Payload being sent:', payload);
  console.log('[api.createTask] Payload has id?', 'id' in payload, 'TaskID' in payload);
  return request<{ id: string }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createProject(payload: Partial<Project>) {
  // Strip id and ProjectID to ensure server always generates new ID
  const { id: _id, ProjectID: _pid, ...clean } = payload as any;
  const body = JSON.stringify(clean);
  console.debug('API createProject POST /projects', clean);
  return request<{ id: string }>('/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

export async function listManageableProjectUsers(projectId: string) {
  const { users } = await request<{ users: ManageableUserSummary[] }>(`/projects/${projectId}/manageable-users`);
  return users;
}

export async function listProjectMembers(projectId: string, filters?: { status?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) {
    params.append('status', filters.status);
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  return request<ProjectMember[]>(`/projects/${projectId}/members${query}`);
}

export async function updateProject(projectId: string, payload: Partial<Project>) {
  return request<{ ok: true }>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteProject(projectId: string) {
  return request<{ ok: true }>(`/projects/${projectId}`, {
    method: 'DELETE',
  });
}

export async function createPerson(payload: Partial<Person>) {
  return request<{ id: string }>('/people', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePerson(personId: string, payload: Partial<Person>) {
  return request<{ ok: true }>(`/people/${personId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function completeTask(taskId: string, done: boolean) {
  return request<{ ok: true }>(`/tasks/${taskId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ done }),
  });
}

export async function updateTask(taskId: string, payload: Partial<Task>) {
  return request<{ ok: true }>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteTask(taskId: string) {
  return request<{ ok: true }>(`/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

export async function moveTaskDates(taskId: string, payload: { 予定開始日?: string | null; 期限?: string | null; start?: string | null; end?: string | null }) {
  return request<{ ok: true }>(`/tasks/${taskId}/move`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listSchedule(params: { view?: 'people' | 'projects'; from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params.view) query.set('view', params.view);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  const qs = query.toString();
  const suffix = qs ? `?${qs}` : '';
  return request<{ items: Task[] }>(`/schedule${suffix}`);
}

export async function seedTaskReminders(taskId: string) {
  return request<{ ok: true }>(`/tasks/${taskId}/seed-reminders`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function syncTaskCalendar(taskId: string, mode: 'push' | 'sync' = 'push') {
  return request<{ ok: true }>(`/calendar/sync`, {
    method: 'POST',
    body: JSON.stringify({ taskId, mode }),
  });
}

export async function importExcel(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const token = await getCachedIdToken();
  const headers = buildAuthHeaders(token);
  const res = await fetch(`${BASE_URL}/import`, {
    method: 'POST',
    body: formData,
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { imported: { projects: number; tasks: number; people: number } };
}

export async function exportExcel(): Promise<Blob> {
  const token = await getCachedIdToken();
  const res = await fetch(`${BASE_URL}/export`, {
    headers: token ? buildAuthHeaders(token) : undefined,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.blob();
}

export async function exportSnapshot() {
  const token = await getCachedIdToken();
  const res = await fetch(`${BASE_URL}/snapshot`, {
    credentials: 'include',
    headers: token ? buildAuthHeaders(token) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { projects: Project[]; tasks: Task[]; people: Person[] };
}

export async function importSnapshot(payload: { projects: Project[]; tasks: Task[]; people: Person[] }) {
  return request<{ imported: { projects: number; tasks: number; people: number } }>('/snapshot', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Settings API
export interface ProjectSettings {
  viewMode?: 'board' | 'gantt' | 'backlog' | 'reports';
  filters?: {
    status?: string;
    assignee?: string;
    priority?: string;
    sprint?: string;
  };
  groupBy?: '' | 'project' | 'assignee' | 'status' | 'priority' | 'sprint';
  boardColumns?: Array<{
    id: string;
    label: string;
    color: string;
    visible?: boolean;
  }>;
}

export async function getProjectSettings(projectId: string) {
  return request<{ settings: ProjectSettings }>(`/settings/projects/${projectId}`);
}

export async function saveProjectSettings(projectId: string, settings: ProjectSettings) {
  return request<{ ok: true }>(`/settings/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  visible: boolean;
  order: number;
}

export async function getNavigationConfig() {
  return request<{ navigationItems: NavigationItem[] }>('/settings/navigation');
}

export async function saveNavigationConfig(navigationItems: NavigationItem[]) {
  return request<{ ok: true }>('/settings/navigation', {
    method: 'PUT',
    body: JSON.stringify({ navigationItems }),
  });
}

// ==================== ユーザー管理 API ====================

import type { Role } from './auth-types';

export interface User {
  id: string;
  email: string;
  displayName: string;
  orgId: string;
  role: Role;
  jobTitle?: string;
  department?: string;
  phoneNumber?: string;
  photoURL?: string;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

export async function listUsers(params?: { orgId?: string; role?: string; isActive?: boolean }) {
  const query = new URLSearchParams();
  if (params?.orgId) query.set('orgId', params.orgId);
  if (params?.role) query.set('role', params.role);
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
  const qs = query.toString();
  const suffix = qs ? `?${qs}` : '';
  return request<User[]>(`/users${suffix}`);
}

export async function getUser(userId: string) {
  return request<User>(`/users/${userId}`);
}

export async function getCurrentUser() {
  return request<User>('/users/me');
}

export async function createUser(payload: Partial<User>) {
  return request<User>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUser(userId: string, payload: Partial<User>) {
  return request<User>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deactivateUser(userId: string) {
  return request<User>(`/users/${userId}/deactivate`, {
    method: 'POST',
  });
}

export async function activateUser(userId: string) {
  return request<User>(`/users/${userId}/activate`, {
    method: 'POST',
  });
}

export async function deleteUser(userId: string) {
  return request<{ success: boolean }>(`/users/${userId}`, {
    method: 'DELETE',
  });
}

// ==================== アクティビティログ API ====================

export interface ActivityLog {
  id: string;
  orgId: string;
  projectId?: string;
  taskId?: string;
  type: string;
  userId: string;
  userName: string;
  userEmail: string;
  targetType: 'project' | 'task' | 'member' | 'person';
  targetId: string;
  targetName: string;
  action: string;
  changes?: Record<string, { before: any; after: any }>;
  metadata?: Record<string, any>;
  createdAt: string;
}

export async function listActivityLogs(params?: { projectId?: string; taskId?: string; userId?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.projectId) query.set('projectId', params.projectId);
  if (params?.taskId) query.set('taskId', params.taskId);
  if (params?.userId) query.set('userId', params.userId);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const suffix = qs ? `?${qs}` : '';
  return request<{ logs: ActivityLog[] }>(`/activity-logs${suffix}`);
}

// ==================== クライアント管理 API ====================

export interface Client {
  id: string;
  name: string;
  createdAt: any;
  createdBy: string;
  updatedAt: any;
}

export async function listClients() {
  return request<{ clients: Client[] }>('/clients');
}

export async function createClient(name: string) {
  return request<Client>('/clients', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function updateClient(clientId: string, name: string) {
  return request<Client>(`/clients/${clientId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteClient(clientId: string) {
  return request<{ success: boolean }>(`/clients/${clientId}`, {
    method: 'DELETE',
  });
}

// ==================== 協力者管理 API ====================

export interface Collaborator {
  id: string;
  name: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  phoneNumber?: string;
  notes?: string;
  createdAt: any;
  createdBy: string;
  updatedAt: any;
  linkedUser?: {
    orgId: string;
    orgName: string;
    displayName: string;
  };
}

export async function listCollaborators() {
  return request<{ collaborators: Collaborator[] }>('/collaborators');
}

export async function createCollaborator(data: { name: string; email?: string; company?: string; jobTitle?: string; phoneNumber?: string; notes?: string }) {
  return request<Collaborator>('/collaborators', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCollaborator(collaboratorId: string, data: { name?: string; email?: string; company?: string; jobTitle?: string; phoneNumber?: string; notes?: string }) {
  return request<Collaborator>(`/collaborators/${collaboratorId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCollaborator(collaboratorId: string) {
  return request<{ success: boolean }>(`/collaborators/${collaboratorId}`, {
    method: 'DELETE',
  });
}

// ==================== 通知 API ====================

export interface InAppNotification {
  id: string;
  userId: string;
  type: 'invitation' | 'task_assigned' | 'task_reminder' | 'project_update' | 'mention';
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: {
    projectId?: string;
    projectName?: string;
    taskId?: string;
    invitationId?: string;
    inviterName?: string;
    role?: string;
    [key: string]: any;
  };
  read: boolean;
  createdAt: string;
}

export async function listNotifications(params?: { limit?: number; unreadOnly?: boolean }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.unreadOnly) query.set('unreadOnly', 'true');
  const qs = query.toString();
  const suffix = qs ? `?${qs}` : '';
  return request<InAppNotification[]>(`/notifications${suffix}`);
}

export async function getUnreadNotificationCount() {
  return request<{ count: number }>('/notifications/unread-count');
}

export async function markNotificationAsRead(notificationId: string) {
  return request<{ success: boolean }>(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
  });
}

export async function markAllNotificationsAsRead() {
  return request<{ success: boolean; count: number }>('/notifications/mark-all-read', {
    method: 'POST',
  });
}

export async function deleteNotification(notificationId: string) {
  return request<{ success: boolean }>(`/notifications/${notificationId}`, {
    method: 'DELETE',
  });
}

// ==================== 日本の祝日 API ====================
export interface JapaneseHoliday {
  date: string;
  name: string;
}

export async function listJapaneseHolidays(params?: { year?: number; from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.year) query.set('year', String(params.year));
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const qs = query.toString();
  const suffix = qs ? `?${qs}` : '';
  return request<{ holidays: JapaneseHoliday[]; sourceUpdatedAt?: string }>(`/japanese-holidays${suffix}`);
}

// ==================== Stage (工程) API ====================

import type { Stage } from './types';

export interface StageInput {
  タスク名: string;
  予定開始日?: string | null;
  期限?: string | null;
  orderIndex?: number | null;
}

export async function listStages(projectId: string) {
  return request<{ stages: Stage[] }>(`/projects/${projectId}/stages`);
}

export async function createStage(projectId: string, input: StageInput) {
  return request<{ id: string }>(`/projects/${projectId}/stages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateStage(stageId: string, updates: Partial<StageInput>) {
  return request<{ success: boolean }>(`/stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteStage(stageId: string) {
  return request<{ success: boolean }>(`/stages/${stageId}`, {
    method: 'DELETE',
  });
}
