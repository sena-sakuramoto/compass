import React, { useState, useMemo } from 'react';
import { Plus, MoreVertical } from 'lucide-react';
import type { Task } from '../lib/types';

interface BoardViewProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  onTaskMove?: (taskId: string, newStatus: string) => void;
  onAddTask?: (status: string) => void;
}

const DEFAULT_COLUMNS = [
  { id: '未着手', label: '未着手', color: 'bg-slate-100' },
  { id: '進行中', label: '進行中', color: 'bg-blue-100' },
  { id: '確認待ち', label: '確認待ち', color: 'bg-amber-100' },
  { id: '完了', label: '完了', color: 'bg-emerald-100' },
];

export function BoardView({ tasks, onTaskClick, onTaskMove, onAddTask }: BoardViewProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    DEFAULT_COLUMNS.forEach(col => {
      grouped[col.id] = [];
    });

    tasks.forEach(task => {
      const status = task.ステータス || '未着手';
      if (grouped[status]) {
        grouped[status].push(task);
      } else {
        grouped[status] = [task];
      }
    });

    return grouped;
  }, [tasks]);

  const handleDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (draggedTask && draggedTask.ステータス !== columnId) {
      onTaskMove?.(draggedTask.id, columnId);
    }
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  return (
    <div className="h-[calc(100vh-300px)] overflow-x-auto">
      <div className="flex gap-4 h-full min-w-max">
        {DEFAULT_COLUMNS.map((column) => (
          <div
            key={column.id}
            className="flex-shrink-0 w-80 flex flex-col"
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* カラムヘッダー */}
            <div className={`rounded-t-2xl ${column.color} p-4`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">
                  {column.label}
                  <span className="ml-2 text-sm text-slate-600">
                    ({tasksByStatus[column.id]?.length || 0})
                  </span>
                </h3>
                <button
                  onClick={() => onAddTask?.(column.id)}
                  className="rounded-lg p-1 hover:bg-white/50 transition"
                  aria-label="タスク追加"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            {/* タスクリスト */}
            <div
              className={`flex-1 overflow-y-auto bg-slate-50 p-3 space-y-3 rounded-b-2xl border-2 transition ${
                dragOverColumn === column.id
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-transparent'
              }`}
            >
              {tasksByStatus[column.id]?.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => handleDragStart(task)}
                  onClick={() => onTaskClick?.(task)}
                  className={`rounded-xl bg-white border border-slate-200 p-4 cursor-move hover:shadow-md transition ${
                    draggedTask?.id === task.id ? 'opacity-50' : ''
                  }`}
                >
                  <h4 className="font-medium text-slate-900 mb-2 line-clamp-2">
                    {task.タスク名}
                  </h4>

                  {task.assignee && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700">
                        {task.assignee.charAt(0)}
                      </div>
                      <span className="text-xs text-slate-600">{task.assignee}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    {task.期限 && (
                      <span className={`${
                        new Date(task.期限) < new Date() && task.ステータス !== '完了'
                          ? 'text-rose-600 font-semibold'
                          : ''
                      }`}>
                        期限: {task.期限}
                      </span>
                    )}
                    {task.優先度 && (
                      <span className={`px-2 py-0.5 rounded-full ${
                        task.優先度 === '高'
                          ? 'bg-rose-100 text-rose-700'
                          : task.優先度 === '中'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {task.優先度}
                      </span>
                    )}
                  </div>

                  {typeof task.progress === 'number' && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${task.progress * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 mt-1">
                        {Math.round(task.progress * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {tasksByStatus[column.id]?.length === 0 && (
                <div className="text-center py-8 text-sm text-slate-400">
                  タスクがありません
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
