/**
 * IndexedDB Cache - Stale-While-Revalidate パターン
 *
 * ページロード時に即座にキャッシュからデータを表示し、
 * バックグラウンドでサーバーから最新データを取得して更新
 *
 * 素のIndexedDB APIベースの cache.ts を使用（idb-keyval 不要）
 */

import {
  cacheGet,
  cacheSet,
  cacheClear as cacheRawClear,
  CACHE_KEY_PROJECTS,
  CACHE_KEY_TASKS,
  CACHE_KEY_PROJECT_MEMBERS_PREFIX,
  TTL_SHORT,
  TTL_LONG,
} from './cache';
import type { Project, Task, Person } from './types';
import type { ProjectMember } from './auth-types';

// プロジェクトメンバーのキャッシュ型
type ProjectMembersCache = Record<string, ProjectMember[]>;

// 内部キー
const KEY_PEOPLE = 'people';
const KEY_PROJECT_MEMBERS_ALL = 'project_members_all';

/**
 * プロジェクトをキャッシュに保存
 */
export async function cacheProjects(projects: Project[]): Promise<void> {
  try {
    await cacheSet(CACHE_KEY_PROJECTS, projects, TTL_SHORT);
  } catch (err) {
    console.warn('[idbCache] Failed to cache projects:', err);
  }
}

/**
 * キャッシュからプロジェクトを取得
 */
export async function getCachedProjects(): Promise<Project[] | undefined> {
  try {
    const data = await cacheGet<Project[]>(CACHE_KEY_PROJECTS);
    return data ?? undefined;
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
    await cacheSet(CACHE_KEY_TASKS, tasks, TTL_SHORT);
  } catch (err) {
    console.warn('[idbCache] Failed to cache tasks:', err);
  }
}

/**
 * キャッシュからタスクを取得
 */
export async function getCachedTasks(): Promise<Task[] | undefined> {
  try {
    const data = await cacheGet<Task[]>(CACHE_KEY_TASKS);
    return data ?? undefined;
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
    await cacheSet(KEY_PEOPLE, people, TTL_SHORT);
  } catch (err) {
    console.warn('[idbCache] Failed to cache people:', err);
  }
}

/**
 * キャッシュから担当者リストを取得
 */
export async function getCachedPeople(): Promise<Person[] | undefined> {
  try {
    const data = await cacheGet<Person[]>(KEY_PEOPLE);
    return data ?? undefined;
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
    // 個別プロジェクトのメンバーキャッシュを保存
    await cacheSet(`${CACHE_KEY_PROJECT_MEMBERS_PREFIX}${projectId}`, members, TTL_LONG);

    // 全プロジェクトメンバーの集約キャッシュも更新
    const current = await cacheGet<ProjectMembersCache>(KEY_PROJECT_MEMBERS_ALL) || {};
    current[projectId] = members;
    await cacheSet(KEY_PROJECT_MEMBERS_ALL, current, TTL_LONG);
  } catch (err) {
    console.warn('[idbCache] Failed to cache project members:', err);
  }
}

/**
 * キャッシュからプロジェクトメンバーを取得
 */
export async function getCachedProjectMembers(projectId: string): Promise<ProjectMember[] | undefined> {
  try {
    const data = await cacheGet<ProjectMember[]>(`${CACHE_KEY_PROJECT_MEMBERS_PREFIX}${projectId}`);
    return data ?? undefined;
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
    const data = await cacheGet<ProjectMembersCache>(KEY_PROJECT_MEMBERS_ALL);
    return data ?? undefined;
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
 * キャッシュをクリア
 */
export async function clearCache(): Promise<void> {
  try {
    await cacheRawClear();
  } catch (err) {
    console.warn('[idbCache] Failed to clear cache:', err);
  }
}
