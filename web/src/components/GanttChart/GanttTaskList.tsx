// タスク一覧コンポーネント（左側固定）

import React from 'react';
import type { GanttTask } from './types';

interface GanttTaskListProps {
  tasks: GanttTask[];
  rowHeight: number;
  onTaskClick?: (task: GanttTask) => void;
  onTaskToggleComplete?: (task: GanttTask) => void;
  scrollTop?: number;
}

export const GanttTaskList: React.FC<GanttTaskListProps> = ({
  tasks,
  rowHeight,
  onTaskClick,
  onTaskToggleComplete,
  scrollTop = 0
}) => {
  // プロジェクトごとにグループ化
  const projectGroups: { projectId: string; projectName: string; tasks: GanttTask[] }[] = [];
  let currentProjectId: string | null = null;

  tasks.forEach(task => {
    if (task.projectId !== currentProjectId) {
      currentProjectId = task.projectId;
      projectGroups.push({
        projectId: task.projectId,
        projectName: task.projectName,
        tasks: []
      });
    }
    projectGroups[projectGroups.length - 1].tasks.push(task);
  });

  return (
    <div className="border-r border-slate-200 bg-white">
      {/* ヘッダー（時間軸と同じ64px） */}
      <div className="border-b border-slate-200 bg-slate-50 flex items-center px-4 text-xs font-semibold text-slate-600" style={{ height: '64px' }}>
        <div className="w-8"></div>
        <div className="flex-1">タスク名</div>
        <div className="w-20 text-center">担当</div>
        <div className="w-16 text-center">進捗</div>
      </div>

      {/* タスクリスト（プロジェクトごとにグループ化） */}
      <div className="overflow-hidden">
        {projectGroups.map((group) => (
          <div key={group.projectId}>
            {/* プロジェクトヘッダー（タイムラインと同じ32px） */}
            <div className="bg-slate-100/50 border-b border-slate-200 flex items-center px-4 sticky z-10" style={{ height: '32px' }}>
              <span className="text-xs font-semibold text-slate-700">{group.projectName}</span>
            </div>

            {/* プロジェクト内のタスク */}
            {group.tasks.map((task, index) => {
          const isCompleted = task.status === 'completed';

          return (
            <div
              key={task.id}
              className={`flex items-center px-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                isCompleted ? 'opacity-60' : ''
              }`}
              style={{ height: `${rowHeight}px` }}
            >
              {/* チェックボックス */}
              <div className="w-8">
                <input
                  type="checkbox"
                  checked={isCompleted}
                  onChange={(e) => {
                    e.stopPropagation();
                    onTaskToggleComplete?.(task);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
              </div>

              {/* タスク名 */}
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onTaskClick?.(task)}>
                <div className={`text-sm font-medium text-slate-700 truncate ${
                  isCompleted ? 'line-through' : ''
                }`}>
                  {task.name}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {task.projectName}
                </div>
              </div>

              {/* 担当者 */}
              <div className="w-20 text-center">
                {task.assigneeAvatar ? (
                  <img
                    src={task.assigneeAvatar}
                    alt={task.assignee}
                    className="w-6 h-6 rounded-full mx-auto"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center mx-auto text-xs font-medium text-slate-600">
                    {task.assignee ? task.assignee.charAt(0) : '?'}
                  </div>
                )}
              </div>

              {/* 進捗 */}
              <div className="w-16 text-center">
                <span className="text-xs font-medium text-slate-600">
                  {task.progress}%
                </span>
              </div>
            </div>
          );
        })}
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-slate-400">
            タスクがありません
          </div>
        )}
      </div>
    </div>
  );
};
