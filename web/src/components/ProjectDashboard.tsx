// プロジェクトダッシュボード

import React from 'react';
import { TrendingUp, CheckCircle2, Clock, AlertCircle, Users } from 'lucide-react';
import type { Project, Task } from '../lib/types';
import { isClosedProjectStatus } from '../lib/constants';

interface ProjectDashboardProps {
  projects: Project[];
  tasks: Task[];
}

export function ProjectDashboard({ projects, tasks }: ProjectDashboardProps) {
  // 統計情報の計算
  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => !isClosedProjectStatus(p.ステータス)).length;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.ステータス === '完了').length;
  const inProgressTasks = tasks.filter((t) => t.ステータス === '進行中').length;
  
  // 期限超過タスク
  const today = new Date().toISOString().split('T')[0];
  const overdueTasks = tasks.filter(
    (t) => t.期限 && t.期限 < today && t.ステータス !== '完了'
  ).length;

  // 全体進捗率
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // 担当者別タスク数
  const tasksByAssignee = tasks.reduce((acc, task) => {
    const assignee = task.担当者 || '未設定';
    acc[assignee] = (acc[assignee] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topAssignees = Object.entries(tasksByAssignee)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* サマリーカード */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">プロジェクト数</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{totalProjects}</p>
              <p className="mt-1 text-xs text-slate-500">進行中: {activeProjects}</p>
            </div>
            <div className="rounded-full bg-blue-100 p-3">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">総タスク数</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{totalTasks}</p>
              <p className="mt-1 text-xs text-slate-500">完了: {completedTasks}</p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">進行中タスク</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{inProgressTasks}</p>
              <p className="mt-1 text-xs text-slate-500">全体の {Math.round((inProgressTasks / totalTasks) * 100)}%</p>
            </div>
            <div className="rounded-full bg-yellow-100 p-3">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">期限超過</p>
              <p className="mt-2 text-3xl font-bold text-red-600">{overdueTasks}</p>
              <p className="mt-1 text-xs text-slate-500">要対応</p>
            </div>
            <div className="rounded-full bg-red-100 p-3">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* 進捗バー */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">全体進捗</h3>
          <span className="text-2xl font-bold text-slate-900">{overallProgress}%</span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-4 rounded-full bg-gradient-to-r from-slate-700 to-slate-900 transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-600">{completedTasks}</p>
            <p className="text-xs text-slate-600">完了</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-600">{inProgressTasks}</p>
            <p className="text-xs text-slate-600">進行中</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-600">{totalTasks - completedTasks - inProgressTasks}</p>
            <p className="text-xs text-slate-600">未着手</p>
          </div>
        </div>
      </div>

      {/* 担当者別タスク数 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <Users className="h-5 w-5 text-slate-700" />
          <h3 className="text-lg font-semibold text-slate-900">担当者別タスク数（上位5名）</h3>
        </div>
        <div className="space-y-3">
          {topAssignees.map(([assignee, count]) => {
            const percentage = Math.round((count / totalTasks) * 100);
            return (
              <div key={assignee}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{assignee}</span>
                  <span className="text-slate-600">{count}件 ({percentage}%)</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-slate-700"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

