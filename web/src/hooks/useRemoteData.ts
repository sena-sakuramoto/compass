import React, { useState, useEffect, useRef } from 'react';
import { listProjects, listTasks } from '../lib/api';
import { normalizeSnapshot } from '../lib/normalize';
import { getCachedSnapshot, cacheSnapshot } from '../lib/idbCache';
import { usePendingOverlay } from '../state/pendingOverlay';
import type { CompassState, Project, Task } from '../lib/types';

export function useRemoteData(setState: React.Dispatch<React.SetStateAction<CompassState>>, enabled: boolean) {
  const [loading, setLoading] = useState(false);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Stale-While-Revalidate: まずキャッシュから読み込み
    const loadFromCache = async () => {
      if (initialLoadDoneRef.current) return; // 初回のみ
      try {
        const cached = await getCachedSnapshot();
        if (cached.projects?.length || cached.tasks?.length) {
          console.log('[useRemoteData] Loading from cache:', {
            projects: cached.projects?.length || 0,
            tasks: cached.tasks?.length || 0,
          });
          setState((prev) => ({
            projects: cached.projects?.length ? cached.projects : prev.projects,
            tasks: cached.tasks?.length ? cached.tasks : prev.tasks,
            people: cached.people?.length ? cached.people : prev.people,
          }));
        }
      } catch (err) {
        console.warn('[useRemoteData] Failed to load from cache:', err);
      }
    };

    // キャッシュから即座に表示
    loadFromCache();

    const load = async () => {
      setLoading(true);
      try {
        const [p, t] = await Promise.allSettled([listProjects(), listTasks({})]);

        // pending状態を取得（サーバーデータのマージ時にガードとして使用）
        const pendingState = usePendingOverlay.getState();
        const pendingTasks = pendingState.pending;
        const pendingProjects = pendingState.pendingProjects;
        const deletedTasks = pendingState.deletedTasks;
        const deletedProjects = pendingState.deletedProjects;
        const creatingTasks = pendingState.creatingTasks;

        // 作成中のタスクIDセットを構築（tempIdとrealId両方）
        const creatingTaskIds = new Set<string>();
        Object.values(creatingTasks).forEach((creating) => {
          if (!creating) return;
          if (Date.now() >= creating.lockUntil) return;
          creatingTaskIds.add(creating.tempId);
          if (creating.realId) creatingTaskIds.add(creating.realId);
        });

        // タスクをマージする関数（pending中のタスクは上書きしない、削除済みタスクは除外、作成中タスクは保護）
        const mergeTasks = (prevTasks: Task[], serverTasks: Task[]): Task[] => {
          const taskMap = new Map<string, Task>();
          const now = Date.now();

          // まず既存のタスクをマップに追加（削除済みは除外）
          prevTasks.forEach((task) => {
            const deletion = deletedTasks[task.id];
            if (deletion && now < deletion.lockUntil) {
              // 削除済みとしてマークされているタスクは追加しない
              return;
            }
            taskMap.set(task.id, task);
          });

          // サーバーからのタスクをマージ
          serverTasks.forEach((serverTask) => {
            // 削除済みとしてマークされているタスクはスキップ
            const deletion = deletedTasks[serverTask.id];
            if (deletion && now < deletion.lockUntil) {
              console.log('[useRemoteData] Skipping deleted task:', serverTask.id);
              return;
            }

            // 作成中タスクはローカルの状態を優先（上書きしない）
            if (creatingTaskIds.has(serverTask.id)) {
              console.log('[useRemoteData] Skipping creating task:', serverTask.id);
              return;
            }

            const existingTask = taskMap.get(serverTask.id);
            const pending = pendingTasks[serverTask.id];

            // pendingがある場合、updatedAtを比較してサーバーデータが古ければスキップ
            if (pending && now < pending.lockUntil) {
              // pendingで変更されたフィールドがサーバーデータで元に戻ろうとしている場合はスキップ
              let shouldSkip = false;
              if (existingTask) {
                Object.entries(pending.fields).forEach(([key, pendingValue]) => {
                  const serverValue = (serverTask as any)[key];
                  // pendingの値とサーバーの値が異なる場合、サーバーデータを採用しない
                  if (serverValue !== pendingValue) {
                    shouldSkip = true;
                  }
                });
              }
              if (shouldSkip) {
                console.log('[useRemoteData] Skipping server task due to pending:', serverTask.id);
                return; // このサーバータスクをスキップ
              }
            }

            // updatedAt比較：サーバーの方が古い場合はスキップ
            if (existingTask?.updatedAt && serverTask.updatedAt) {
              const existingTime = new Date(existingTask.updatedAt).getTime();
              const serverTime = new Date(serverTask.updatedAt).getTime();
              if (serverTime < existingTime) {
                console.log('[useRemoteData] Skipping older server task:', serverTask.id);
                return; // 古いサーバーデータをスキップ
              }
            }

            taskMap.set(serverTask.id, serverTask);
          });

          return Array.from(taskMap.values());
        };

        // プロジェクトをマージする関数（pending中のプロジェクトは上書きしない、削除済みプロジェクトは除外）
        const mergeProjects = (prevProjects: Project[], serverProjects: Project[]): Project[] => {
          const projectMap = new Map<string, Project>();
          const now = Date.now();

          // まず既存のプロジェクトをマップに追加（削除済みは除外）
          prevProjects.forEach((project) => {
            const deletion = deletedProjects[project.id];
            if (deletion && now < deletion.lockUntil) {
              // 削除済みとしてマークされているプロジェクトは追加しない
              return;
            }
            projectMap.set(project.id, project);
          });

          // サーバーからのプロジェクトをマージ
          serverProjects.forEach((serverProject) => {
            // 削除済みとしてマークされているプロジェクトはスキップ
            const deletion = deletedProjects[serverProject.id];
            if (deletion && now < deletion.lockUntil) {
              console.log('[useRemoteData] Skipping deleted project:', serverProject.id);
              return;
            }

            const existingProject = projectMap.get(serverProject.id);
            const pending = pendingProjects[serverProject.id];

            // pendingがある場合、変更されたフィールドがサーバーデータで元に戻ろうとしている場合はスキップ
            if (pending && now < pending.lockUntil) {
              let shouldSkip = false;
              if (existingProject) {
                Object.entries(pending.fields).forEach(([key, pendingValue]) => {
                  const serverValue = (serverProject as any)[key];
                  // pendingの値とサーバーの値が異なる場合、サーバーデータを採用しない
                  if (serverValue !== pendingValue) {
                    shouldSkip = true;
                  }
                });
              }
              if (shouldSkip) {
                console.log('[useRemoteData] Skipping server project due to pending:', serverProject.id);
                return; // このサーバープロジェクトをスキップ
              }
            }

            // updatedAt比較：サーバーの方が古い場合はスキップ
            if (existingProject?.updatedAt && serverProject.updatedAt) {
              const existingTime = new Date(existingProject.updatedAt).getTime();
              const serverTime = new Date(serverProject.updatedAt).getTime();
              if (serverTime < existingTime) {
                console.log('[useRemoteData] Skipping older server project:', serverProject.id);
                return; // 古いサーバーデータをスキップ
              }
            }

            projectMap.set(serverProject.id, serverProject);
          });

          return Array.from(projectMap.values());
        };

        if (p.status === 'fulfilled' && t.status === 'fulfilled') {
          const normalized = normalizeSnapshot({
            projects: p.value.projects,
            tasks: t.value.tasks,
            people: [],
          });

          setState((prev) => {
            // タスクとプロジェクトはマージして上書きを防ぐ
            const mergedTasks = mergeTasks(prev.tasks, normalized.tasks);
            const mergedProjects = mergeProjects(prev.projects, normalized.projects);
            return {
              projects: mergedProjects,
              tasks: mergedTasks,
              people: prev.people,
            };
          });

          // キャッシュに保存（バックグラウンド）
          initialLoadDoneRef.current = true;
          cacheSnapshot({ projects: normalized.projects, tasks: normalized.tasks }).catch(() => {});
          return;
        }

        if (p.status === 'fulfilled') {
          const normalized = normalizeSnapshot({
            projects: p.value.projects,
            tasks: [],
            people: [],
          });
          setState((prev) => {
            // プロジェクトはマージして上書きを防ぐ
            const mergedProjects = mergeProjects(prev.projects, normalized.projects);
            return {
              projects: mergedProjects,
              tasks: prev.tasks,
              people: prev.people,
            };
          });
          // キャッシュに保存
          cacheSnapshot({ projects: normalized.projects }).catch(() => {});
        }

        if (t.status === 'fulfilled') {
          const normalized = normalizeSnapshot({
            projects: [],
            tasks: t.value.tasks,
            people: [],
          });
          setState((prev) => {
            // タスクはマージして上書きを防ぐ
            const mergedTasks = mergeTasks(prev.tasks, normalized.tasks);
            return {
              projects: prev.projects,
              tasks: mergedTasks,
              people: prev.people,
            };
          });
          // キャッシュに保存
          cacheSnapshot({ tasks: normalized.tasks }).catch(() => {});
        }
      } catch (err) {
        console.warn('Failed to load remote snapshot', err);
      } finally {
        setLoading(false);
        initialLoadDoneRef.current = true;
      }
    };
    load();

    const handler = () => load();
    window.addEventListener('snapshot:reload', handler);
    return () => window.removeEventListener('snapshot:reload', handler);
  }, [setState, enabled]);

  return loading;
}
