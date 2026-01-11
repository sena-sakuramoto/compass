/**
 * IndexedDB Cache - Stale-While-Revalidate パターン
 * 
 * ページロード時に即座にキャッシュからデータを表示し、
 * バックグラウンドでサーバーから最新データを取得して更新
 */

import { get, set, del, createStore } from 'idb-keyval';
import type { Project, Task, Person } from './types';
import type { ProjectMember } from './auth-types';

// Compass専用のIndexedDBストア
const compassStore = createStore('compass-cache', 'keyval');

// キャッシュキー
const CACHE_KEYS = {
  PROJECTS: 'projects',
  TASKS: 'tasks',
  PEOPLE: 'people',
  PROJECT_MEMBERS: 'project_members',
  METADATA: 'metadata',
} as const;

// プロジェクトメンバーのキャッシュ型
type ProjectMembersCache = Record<string, ProjectMember[]>;

// キャッシュメタデータ
interface CacheMetadata {
  projectsUpdatedAt?: number;
  tasksUpdatedAt?: number;
  peopleUpdatedAt?: number;
}

// キャッシュの有効期限（5分）- これを過ぎたらバックグラウンド更新を優先
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * プロジェクトをキャッシュに保存
 */
export async function cacheProjects(projects: Project[]): Promise<void> {
  try {
    await set(CACHE_KEYS.PROJECTS, projects, compassStore);
    await updateMetadata({ projectsUpdatedAt: Date.now() });
  } catch (err) {
    console.warn('[idbCache] Failed to cache projects:', err);
  }
}

/**
 * キャッシュからプロジェクトを取得
 */
export async function getCachedProjects(): Promise<Project[] | undefined> {
  try {
    return await get<Project[]>(CACHE_KEYS.PROJECTS, compassStore);
  } catch (err) {
    console.warn('[idbCache] Failed to get cached projects:', err);
    return undefined;
  }
}

/**
 * タスクをキャッシュに保存
 */
export async function cacheTasks(tasks: Task[]): Promise<void> {
  try {
    await set(CACHE_KEYS.TASKS, tasks, compassStore);
    await updateMetadata({ tasksUpdatedAt: Date.now() });
  } catch (err) {
    console.warn('[idbCache] Failed to cache tasks:', err);
  }
}

/**
 * キャッシュからタスクを取得
 */
export async function getCachedTasks(): Promise<Task[] | undefined> {
  try {
    return await get<Task[]>(CACHE_KEYS.TASKS, compassStore);
  } catch (err) {
    console.warn('[idbCache] Failed to get cached tasks:', err);
    return undefined;
  }
}

/**
 * 担当者リストをキャッシュに保存
 */
export async function cachePeople(people: Person[]): Promise<void> {
  try {
    await set(CACHE_KEYS.PEOPLE, people, compassStore);
    await updateMetadata({ peopleUpdatedAt: Date.now() });
  } catch (err) {
    console.warn('[idbCache] Failed to cache people:', err);
  }
}

/**
 * キャッシュから担当者リストを取得
 */
export async function getCachedPeople(): Promise<Person[] | undefined> {
  try {
    return await get<Person[]>(CACHE_KEYS.PEOPLE, compassStore);
  } catch (err) {
    console.warn('[idbCache] Failed to get cached people:', err);
    return undefined;
  }
}

/**
 * プロジェクトメンバーをキャッシュに保存
 */
export async function cacheProjectMembers(projectId: string, members: ProjectMember[]): Promise<void> {
  try {
    const current = await get<ProjectMembersCache>(CACHE_KEYS.PROJECT_MEMBERS, compassStore) || {};
    current[projectId] = members;
    await set(CACHE_KEYS.PROJECT_MEMBERS, current, compassStore);
  } catch (err) {
    console.warn('[idbCache] Failed to cache project members:', err);
  }
}

/**
 * キャッシュからプロジェクトメンバーを取得
 */
export async function getCachedProjectMembers(projectId: string): Promise<ProjectMember[] | undefined> {
  try {
    const cache = await get<ProjectMembersCache>(CACHE_KEYS.PROJECT_MEMBERS, compassStore);
    return cache?.[projectId];
  } catch (err) {
    console.warn('[idbCache] Failed to get cached project members:', err);
    return undefined;
  }
}

/**
 * キャッシュから全プロジェクトメンバーを取得
 */
export async function getAllCachedProjectMembers(): Promise<ProjectMembersCache | undefined> {
  try {
    return await get<ProjectMembersCache>(CACHE_KEYS.PROJECT_MEMBERS, compassStore);
  } catch (err) {
    console.warn('[idbCache] Failed to get all cached project members:', err);
    return undefined;
  }
}

/**
 * 全データをキャッシュに保存
 */
export async function cacheSnapshot(data: {
  projects?: Project[];
  tasks?: Task[];
  people?: Person[];
}): Promise<void> {
  const promises: Promise<void>[] = [];
  if (data.projects) promises.push(cacheProjects(data.projects));
  if (data.tasks) promises.push(cacheTasks(data.tasks));
  if (data.people) promises.push(cachePeople(data.people));
  await Promise.all(promises);
}

/**
 * キャッシュから全データを取得
 */
export async function getCachedSnapshot(): Promise<{
  projects?: Project[];
  tasks?: Task[];
  people?: Person[];
}> {
  const [projects, tasks, people] = await Promise.all([
    getCachedProjects(),
    getCachedTasks(),
    getCachedPeople(),
  ]);
  return { projects, tasks, people };
}

/**
 * キャッシュが古いかどうかをチェック
 */
export async function isCacheStale(key: 'projects' | 'tasks' | 'people'): Promise<boolean> {
  try {
    const metadata = await get<CacheMetadata>(CACHE_KEYS.METADATA, compassStore);
    if (!metadata) return true;

    const updatedAt = metadata[`${key}UpdatedAt` as keyof CacheMetadata];
    if (!updatedAt) return true;

    return Date.now() - updatedAt > STALE_THRESHOLD_MS;
  } catch {
    return true;
  }
}

/**
 * メタデータを更新
 */
async function updateMetadata(updates: Partial<CacheMetadata>): Promise<void> {
  try {
    const current = await get<CacheMetadata>(CACHE_KEYS.METADATA, compassStore) || {};
    await set(CACHE_KEYS.METADATA, { ...current, ...updates }, compassStore);
  } catch (err) {
    console.warn('[idbCache] Failed to update metadata:', err);
  }
}

/**
 * キャッシュをクリア
 */
export async function clearCache(): Promise<void> {
  try {
    await Promise.all([
      del(CACHE_KEYS.PROJECTS, compassStore),
      del(CACHE_KEYS.TASKS, compassStore),
      del(CACHE_KEYS.PEOPLE, compassStore),
      del(CACHE_KEYS.METADATA, compassStore),
    ]);
  } catch (err) {
    console.warn('[idbCache] Failed to clear cache:', err);
  }
}

