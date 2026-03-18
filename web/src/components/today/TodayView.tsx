import React, { useState, useMemo, useCallback, useRef } from 'react';
import { isSameDay, parseISO } from 'date-fns';
import { DateHeader } from './DateHeader';
import { Timeline } from './Timeline';
import { BottomSheet } from './BottomSheet';
import { BottomSheetItem } from './BottomSheetItem';
import { FeedbackBar } from './FeedbackBar';
import { QuickAddSheet } from './QuickAddSheet';
import { useFeedbackBar } from '../../hooks/useFeedbackBar';
import { getEffectiveBallHolder, getTaskAssigneeLabel } from '../../lib/ball';
import { formatDuration, type ChipCandidate } from '../../lib/timeline';
import { getWorkHours, workHoursToMinutes } from '../../lib/workHours';
import type { Task } from '../../lib/types';

interface TodayViewProps {
  tasks: Task[];
  currentUserName: string;
  currentUserEmail: string;
  currentUserAliases: Set<string>;
  onCompleteTask: (task: Task) => void;
  onThrowBall: (task: Task) => void;
  onPullBackBall: (task: Task) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onCreateTask: (title: string, estimateMinutes: number | null) => void;
  onOpenTask: (task: Task) => void;
}

const GAP = 20;

/**
 * Check whether the user holds the ball for a given task.
 */
function userHoldsBall(task: Task, aliases: Set<string>): boolean {
  const holder = getEffectiveBallHolder(task);
  if (!holder) return false;
  return aliases.has(holder.toLowerCase());
}

/**
 * Check whether the task is "waiting" — the user is the assignee but
 * someone else holds the ball.
 */
function isWaitingTask(task: Task, aliases: Set<string>): boolean {
  const assignee = getTaskAssigneeLabel(task);
  if (!assignee || !aliases.has(assignee.toLowerCase())) return false;
  const holder = getEffectiveBallHolder(task);
  if (!holder) return false;
  return !aliases.has(holder.toLowerCase());
}

/**
 * Check whether a task falls on the given date based on its schedule range
 * (予定開始日 .. 期限) or its startTime field.
 */
function isScheduledForDate(task: Task, date: Date): boolean {
  const startStr = task.予定開始日 ?? task.start;
  const endStr = task.期限 ?? task.end;

  // If the task has a startTime date component that matches, it counts.
  if (task.startTime) {
    try {
      const parsed = parseISO(task.startTime);
      if (isSameDay(parsed, date)) return true;
    } catch {
      // ignore parse errors
    }
  }

  if (!startStr && !endStr) return false;

  const dateStr = formatDateYMD(date);
  const s = startStr ?? endStr!;
  const e = endStr ?? startStr!;
  return s <= dateStr && e >= dateStr;
}

function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function TodayView({
  tasks,
  currentUserName,
  currentUserEmail,
  currentUserAliases,
  onCompleteTask,
  onThrowBall,
  onPullBackBall,
  onUpdateTask,
  onCreateTask,
  onOpenTask,
}: TodayViewProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const feedback = useFeedbackBar();
  const { dayStart: DAY_START, dayEnd: DAY_END } = useMemo(() => workHoursToMinutes(getWorkHours()), []);
  const [animatingOut, setAnimatingOut] = useState<Record<string, 'complete' | 'pass'>>({});
  const pendingActions = useRef<Record<string, () => void>>({});

  // ---- Categorize tasks ----
  const { timelineTasks, trayItems } = useMemo(() => {
    const activeTasks = tasks.filter(
      (t) => t.ステータス !== '完了' && t.type !== 'stage',
    );

    const timeline: Task[] = [];
    const tray: Task[] = [];

    for (const t of activeTasks) {
      const mine = userHoldsBall(t, currentUserAliases);
      const scheduled = isScheduledForDate(t, selectedDate);

      // Follow-up deadline is today
      const followUpToday =
        t.responseDeadline != null &&
        (() => {
          try {
            return isSameDay(parseISO(t.responseDeadline!), selectedDate);
          } catch {
            return false;
          }
        })();

      if ((mine && scheduled) || followUpToday) {
        timeline.push(t);
      } else {
        tray.push(t);
      }
    }

    return { timelineTasks: timeline, trayItems: tray };
  }, [tasks, selectedDate, currentUserAliases]);

  // ---- Map timeline tasks to Timeline component shape ----
  const timelineTasksWithHandlers = useMemo(
    () =>
      timelineTasks.map((t) => ({
        id: t.id,
        name: t['タスク名'],
        startTime: t.startTime ?? null,
        estimateMinutes:
          typeof t['工数見積(h)'] === 'number' && t['工数見積(h)'] > 0
            ? Math.round(t['工数見積(h)'] * 60)
            : null,
        onComplete: () => {
          // Trigger animation, then execute after it ends
          setAnimatingOut(prev => ({ ...prev, [t.id]: 'complete' }));
          pendingActions.current[t.id] = () => {
            onCompleteTask(t);
            feedback.push({ type: 'complete', undoFn: null });
          };
        },
        onThrow: userHoldsBall(t, currentUserAliases)
          ? () => {
              setAnimatingOut(prev => ({ ...prev, [t.id]: 'pass' }));
              pendingActions.current[t.id] = () => {
                onThrowBall(t);
                feedback.push({ type: 'pass', undoFn: null });
              };
            }
          : undefined,
        onTap: () => onOpenTask(t),
      })),
    [timelineTasks, currentUserAliases, onCompleteTask, onThrowBall, onOpenTask, feedback],
  );

  // ---- Map tray items to chip candidates ----
  const chipCandidates: ChipCandidate[] = useMemo(
    () =>
      trayItems.map((t) => ({
        id: t.id,
        name: t['タスク名'],
        estimateMinutes:
          typeof t['工数見積(h)'] === 'number' && t['工数見積(h)'] > 0
            ? Math.round(t['工数見積(h)'] * 60)
            : null,
        deadline: t['期限'] ?? null,
      })),
    [trayItems],
  );

  // ---- Callbacks ----
  const isToday = useMemo(() => isSameDay(selectedDate, new Date()), [selectedDate]);

  const handleChipPlace = useCallback(
    (chip: ChipCandidate, startMinutes: number) => {
      const hours = Math.floor(startMinutes / 60);
      const mins = startMinutes % 60;
      const startTimeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      onUpdateTask(chip.id, {
        startTime: startTimeStr,
        予定開始日: formatDateYMD(selectedDate),
      });
    },
    [onUpdateTask, selectedDate],
  );

  const handleAnimationEnd = useCallback((id: string) => {
    setAnimatingOut(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const action = pendingActions.current[id];
    if (action) {
      delete pendingActions.current[id];
      action();
    }
  }, []);

  const handleQuickAdd = useCallback(
    (title: string, estimateMinutes: number | null, _scheduled: boolean) => {
      onCreateTask(title, estimateMinutes);
    },
    [onCreateTask],
  );

  // ---- Build tray item lookup for bottom sheet ----
  const trayTaskMap = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of trayItems) {
      map.set(t.id, t);
    }
    return map;
  }, [trayItems]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Date header */}
      <DateHeader selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* Timeline area (scrollable) */}
      <div className="flex-1 overflow-y-auto pb-20">
        <Timeline
          tasks={timelineTasksWithHandlers}
          trayItems={chipCandidates}
          dayStart={DAY_START}
          dayEnd={DAY_END}
          gap={GAP}
          isToday={isToday}
          onChipPlace={handleChipPlace}
          animatingOut={animatingOut}
          onAnimationEnd={handleAnimationEnd}
        />
      </div>

      {/* Bottom sheet — tray items */}
      <BottomSheet
        title="あとで整理"
        count={trayItems.length}
      >
        {trayItems.map((t) => {
          const waiting = isWaitingTask(t, currentUserAliases);
          const mine = userHoldsBall(t, currentUserAliases);
          const holder = getEffectiveBallHolder(t);
          const assignee = getTaskAssigneeLabel(t);
          const waitingFor =
            waiting && holder ? holder : null;

          const estMinutes =
            typeof t['工数見積(h)'] === 'number' && t['工数見積(h)'] > 0
              ? Math.round(t['工数見積(h)'] * 60)
              : null;

          return (
            <BottomSheetItem
              key={t.id}
              name={t['タスク名']}
              estimateLabel={estMinutes != null ? formatDuration(estMinutes) : null}
              waitingFor={waitingFor}
              deadlineLabel={
                t.responseDeadline
                  ? `催促${t.responseDeadline.slice(5).replace('-', '/')}`
                  : null
              }
              overdue={Boolean(t['期限'] && new Date(t['期限']) < new Date())}
              onComplete={() => {
                onCompleteTask(t);
                feedback.push({ type: 'complete', undoFn: null });
              }}
              onThrow={mine ? () => onThrowBall(t) : undefined}
              onPullBack={waiting ? () => onPullBackBall(t) : undefined}
              onTap={() => onOpenTask(t)}
            />
          );
        })}
      </BottomSheet>

      {/* Feedback bar */}
      <FeedbackBar state={feedback.state} onUndo={feedback.undoLast} />

      {/* Quick add FAB + sheet */}
      <QuickAddSheet onAdd={handleQuickAdd} />
    </div>
  );
}
