import type { Project, Task, Person } from './types';

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api';

function getIdToken() {
  return localStorage.getItem('apdw_id_token') ?? undefined;
}

export function setIdToken(token?: string) {
  if (token) {
    localStorage.setItem('apdw_id_token', token);
  } else {
    localStorage.removeItem('apdw_id_token');
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getIdToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

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
  return request<{ id: string }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createProject(payload: Partial<Project>) {
  return request<{ id: string }>('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProject(projectId: string, payload: Partial<Project>) {
  return request<{ ok: true }>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
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

export async function moveTaskDates(taskId: string, payload: { 予定開始日?: string | null; 期限?: string | null }) {
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
  const token = getIdToken();
  const res = await fetch(`${BASE_URL}/import`, {
    method: 'POST',
    body: formData,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { imported: { projects: number; tasks: number; people: number } };
}

export async function exportExcel(): Promise<Blob> {
  const token = getIdToken();
  const res = await fetch(`${BASE_URL}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.blob();
}

export async function exportSnapshot() {
  const token = getIdToken();
  const res = await fetch(`${BASE_URL}/snapshot`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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
