import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subWeeks,
  subMonths,
  subYears,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  startOfDay,
  endOfDay,
  differenceInCalendarDays,
} from 'date-fns';
import { parseDate } from './date';
import { toNumber } from './normalize';
import type { Task, Project } from './types';

// ================== Types ==================

export type WorkloadScale = 'week' | 'month' | 'year';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ProjectRevenueSpan {
  projectId: string;
  start: Date;
  end: Date;
  revenue: number;
}

export type WorkloadSummaryRow = {
  label: string;
  hours: number;
  tasks: number;
  revenue: number;
};

// ================== Date Range Functions ==================

export function getPeriodRange(scale: WorkloadScale, reference: Date): DateRange {
  if (scale === 'week') {
    return {
      start: startOfWeek(reference, { weekStartsOn: 1 }),
      end: endOfWeek(reference, { weekStartsOn: 1 }),
    };
  }
  if (scale === 'month') {
    return {
      start: startOfMonth(reference),
      end: endOfMonth(reference),
    };
  }
  return {
    start: startOfYear(reference),
    end: endOfYear(reference),
  };
}

export function getPreviousRange(range: DateRange, scale: WorkloadScale): DateRange {
  if (scale === 'week') {
    return getPeriodRange('week', subWeeks(range.start, 1));
  }
  if (scale === 'month') {
    return getPeriodRange('month', subMonths(range.start, 1));
  }
  return getPeriodRange('year', subYears(range.start, 1));
}

export function getTaskRange(task: Task): DateRange | null {
  const startSource = task.start ?? task.予定開始日 ?? task.実績開始日 ?? task.実績完了日 ?? task.期限 ?? null;
  const endSource = task.end ?? task.期限 ?? task.実績完了日 ?? task.実績開始日 ?? task.予定開始日 ?? task.start ?? null;
  const start = startSource ? parseDate(startSource) : null;
  const end = endSource ? parseDate(endSource) : null;
  if (!start && !end) return null;
  const safeStart = start ?? end;
  const safeEnd = end ?? start;
  if (!safeStart || !safeEnd) return null;
  return safeStart <= safeEnd ? { start: safeStart, end: safeEnd } : { start: safeEnd, end: safeStart };
}

export function getOverlapRange(rangeA: DateRange, rangeB: DateRange): DateRange | null {
  const start = rangeA.start > rangeB.start ? rangeA.start : rangeB.start;
  const end = rangeA.end < rangeB.end ? rangeA.end : rangeB.end;
  return start <= end ? { start, end } : null;
}

// ================== Task Hours Functions ==================

export function getTaskHoursInRange(task: Task, range: DateRange): number {
  const taskRange = getTaskRange(task);
  if (!taskRange) return 0;
  const overlap = getOverlapRange(taskRange, range);
  if (!overlap) return 0;
  const estimate = toNumber(task['工数見積(h)']);
  if (!estimate) return 0;
  const taskSpanDays = Math.max(1, differenceInCalendarDays(taskRange.end, taskRange.start) + 1);
  const overlapDays = Math.max(1, differenceInCalendarDays(overlap.end, overlap.start) + 1);
  return (estimate * overlapDays) / taskSpanDays;
}

export function sumTaskHoursInRange(tasks: Task[], range: DateRange): number {
  return tasks.reduce((sum, task) => sum + getTaskHoursInRange(task, range), 0);
}

export function filterTasksByRange(tasks: Task[], range: DateRange): Task[] {
  return tasks.filter((task) => {
    const taskRange = getTaskRange(task);
    return taskRange ? Boolean(getOverlapRange(taskRange, range)) : false;
  });
}

export function countTasksInRange(tasks: Task[], range: DateRange): number {
  return tasks.reduce((count, task) => {
    const taskRange = getTaskRange(task);
    if (!taskRange) return count;
    return getOverlapRange(taskRange, range) ? count + 1 : count;
  }, 0);
}

export function sumHoursForRange(tasks: Task[], start: Date, end: Date): number {
  return sumTaskHoursInRange(tasks, { start, end });
}

// ================== Workload Calculation ==================

export function buildActiveDaysByAssignee(tasks: Task[], range: DateRange): Map<string, number> {
  const daySets = new Map<string, Set<string>>();
  tasks.forEach((task) => {
    const assignee = (task.assignee ?? task.担当者 ?? '未設定').trim() || '未設定';
    const taskRange = getTaskRange(task);
    if (!taskRange) return;
    const overlap = getOverlapRange(taskRange, range);
    if (!overlap) return;
    const set = daySets.get(assignee) ?? new Set<string>();
    eachDayOfInterval(overlap).forEach((day) => {
      set.add(format(day, 'yyyy-MM-dd'));
    });
    daySets.set(assignee, set);
  });
  const counts = new Map<string, number>();
  daySets.forEach((set, key) => {
    counts.set(key, set.size);
  });
  return counts;
}

export function buildWorkload(tasks: Task[], range: DateRange) {
  const map = new Map<string, { assignee: string; est: number; count: number }>();
  tasks.forEach((task) => {
    const key = (task.assignee ?? task.担当者 ?? '未設定').trim() || '未設定';
    const entry = map.get(key) ?? { assignee: key, est: 0, count: 0 };
    entry.est += getTaskHoursInRange(task, range);
    entry.count += 1;
    map.set(key, entry);
  });
  return Array.from(map.values()).sort((a, b) => b.est - a.est);
}

// ================== Revenue Functions ==================

function pickDate(...sources: (string | undefined | null)[]): Date | null {
  for (const source of sources) {
    if (!source) continue;
    const date = parseDate(source);
    if (date) return date;
  }
  return null;
}

function resolveProjectRevenueRange(project: Project): DateRange | null {
  const start = pickDate(project.span?.start, project.開始日, project.着工日, project.現地調査日);
  const end = pickDate(project.span?.end, project.引渡し予定日, project.竣工予定日, project.予定完了日);
  if (!start && !end) return null;
  const safeStart = start ?? end;
  const safeEnd = end ?? start;
  if (!safeStart || !safeEnd) return null;
  return safeStart <= safeEnd ? { start: safeStart, end: safeEnd } : { start: safeEnd, end: safeStart };
}

export function buildProjectRevenueSpans(projects: Project[]): ProjectRevenueSpan[] {
  return projects
    .map((project) => {
      const rawAmount = project.施工費;
      const amount = typeof rawAmount === 'number' ? rawAmount : rawAmount ? Number(rawAmount) : 0;
      if (!amount) return null;
      const range = resolveProjectRevenueRange(project);
      if (!range) return null;
      return { projectId: project.id, start: range.start, end: range.end, revenue: amount };
    })
    .filter((span): span is ProjectRevenueSpan => Boolean(span));
}

export function getRevenueInRange(span: ProjectRevenueSpan, range: DateRange): number {
  const overlap = getOverlapRange({ start: span.start, end: span.end }, range);
  if (!overlap) return 0;
  const totalDays = Math.max(1, differenceInCalendarDays(span.end, span.start) + 1);
  const overlapDays = Math.max(1, differenceInCalendarDays(overlap.end, overlap.start) + 1);
  return (span.revenue * overlapDays) / totalDays;
}

export function sumRevenueForRange(spans: ProjectRevenueSpan[], range: DateRange): number {
  return spans.reduce((sum, span) => sum + getRevenueInRange(span, range), 0);
}

export function sumRevenueForWindow(spans: ProjectRevenueSpan[], start: Date, end: Date): number {
  return spans.reduce((sum, span) => sum + getRevenueInRange(span, { start, end }), 0);
}

export function countProjectsInRange(spans: ProjectRevenueSpan[], range: DateRange): number {
  return spans.filter((span) => Boolean(getOverlapRange({ start: span.start, end: span.end }, range))).length;
}

// ================== Delta Calculation ==================

export function calculateDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// ================== Timeline Data ==================

export function buildTimelineData(
  range: DateRange,
  scale: WorkloadScale,
  tasks: Task[],
  revenueSpans: ProjectRevenueSpan[]
) {
  if (scale === 'week') {
    return eachDayOfInterval(range).map((day) => {
      const bucketStart = startOfDay(day);
      const bucketEnd = endOfDay(day);
      return {
        label: format(day, 'M/d'),
        hours: sumHoursForRange(tasks, bucketStart, bucketEnd),
        revenue: sumRevenueForWindow(revenueSpans, bucketStart, bucketEnd),
      };
    });
  }

  if (scale === 'month') {
    const weeks = eachWeekOfInterval(range, { weekStartsOn: 1 });
    return weeks.map((weekStart) => {
      const bucketStart = weekStart < range.start ? range.start : weekStart;
      const bucketEndCandidate = endOfWeek(weekStart, { weekStartsOn: 1 });
      const bucketEnd = bucketEndCandidate > range.end ? range.end : bucketEndCandidate;
      return {
        label: `${format(bucketStart, 'M/d')}〜${format(bucketEnd, 'M/d')}`,
        hours: sumHoursForRange(tasks, bucketStart, bucketEnd),
        revenue: sumRevenueForWindow(revenueSpans, bucketStart, bucketEnd),
      };
    });
  }

  // year
  const months = eachMonthOfInterval(range);
  return months.map((monthStart) => {
    const bucketStart = monthStart < range.start ? range.start : monthStart;
    const bucketEndCandidate = endOfMonth(monthStart);
    const bucketEnd = bucketEndCandidate > range.end ? range.end : bucketEndCandidate;
    return {
      label: format(bucketStart, 'M月'),
      hours: sumHoursForRange(tasks, bucketStart, bucketEnd),
      revenue: sumRevenueForWindow(revenueSpans, bucketStart, bucketEnd),
    };
  });
}

// ================== Summary Builders ==================

export function buildWeeklySummary(range: DateRange, tasks: Task[], revenueSpans: ProjectRevenueSpan[]): WorkloadSummaryRow[] {
  return eachWeekOfInterval(range, { weekStartsOn: 1 }).map((weekStart) => {
    const bucketStart = weekStart < range.start ? range.start : weekStart;
    const bucketEndCandidate = endOfWeek(weekStart, { weekStartsOn: 1 });
    const bucketEnd = bucketEndCandidate > range.end ? range.end : bucketEndCandidate;
    return {
      label: `${format(bucketStart, 'M/d')}〜${format(bucketEnd, 'M/d')}`,
      hours: sumHoursForRange(tasks, bucketStart, bucketEnd),
      tasks: countTasksInRange(tasks, { start: bucketStart, end: bucketEnd }),
      revenue: sumRevenueForWindow(revenueSpans, bucketStart, bucketEnd),
    };
  });
}

export function buildMonthlySummary(range: DateRange, tasks: Task[], revenueSpans: ProjectRevenueSpan[]): WorkloadSummaryRow[] {
  return eachMonthOfInterval(range).map((monthStart) => {
    const bucketStart = monthStart < range.start ? range.start : monthStart;
    const bucketEndCandidate = endOfMonth(monthStart);
    const bucketEnd = bucketEndCandidate > range.end ? range.end : bucketEndCandidate;
    return {
      label: format(bucketStart, 'yyyy/M'),
      hours: sumHoursForRange(tasks, bucketStart, bucketEnd),
      tasks: countTasksInRange(tasks, { start: bucketStart, end: bucketEnd }),
      revenue: sumRevenueForWindow(revenueSpans, bucketStart, bucketEnd),
    };
  });
}
