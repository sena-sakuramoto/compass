import React, { useMemo } from 'react';
import { addDays, differenceInDays, format, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { GanttTask, ViewMode } from './types';
import type { Project } from '../../lib/types';
import { calculateDateTicks, STATUS_COLORS } from './utils';
import { parseDate } from '../../lib/date';

type PrintProject = {
  id: string;
  name: string;
  tasks: GanttTask[];
};

const PRINT_STATUS_COLORS: Record<string, string> = {
  not_started: '#94a3b8',
  in_progress: '#4b5563',
  on_hold: '#6b7280',
  completed: '#1f2937',
  overdue: '#111827',
};

interface GanttPrintViewProps {
  tasks: GanttTask[];
  projectIds: string[];
  viewMode?: ViewMode;
  holidaySet?: Set<string> | null;
  generatedBy?: string | null;
  projectMeta?: Record<string, Project>;
  rangeMode?: 'tasks' | 'construction';
}

function formatDate(value: Date) {
  return format(value, 'yyyy/MM/dd', { locale: ja });
}

function getTaskPercent(task: GanttTask, range: { start: Date; end: Date }) {
  const rangeStart = startOfDay(range.start);
  const rangeEnd = startOfDay(range.end);
  const totalDays = differenceInDays(rangeEnd, rangeStart) + 1;
  const taskStart = startOfDay(task.startDate);
  const taskEnd = startOfDay(task.endDate);
  const startOffset = differenceInDays(taskStart, rangeStart);
  const durationDays = differenceInDays(taskEnd, taskStart) + 1;
  const leftRaw = (startOffset / totalDays) * 100;
  const widthRaw = (durationDays / totalDays) * 100;
  const left = Math.min(Math.max(leftRaw, 0), 100);
  const width = Math.max(Math.min(widthRaw, 100 - left), 0.5);
  return { left, width, durationDays };
}

function resolveTaskRange(tasks: GanttTask[]) {
  const dates = tasks.flatMap((task) => [task.startDate, task.endDate]).filter((d) => d instanceof Date);
  const min = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date();
  const max = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
  return { start: startOfDay(min), end: startOfDay(max) };
}

function buildMonthSpans(ticks: { date: Date }[]) {
  if (ticks.length === 0) return [];
  const spans: { label: string; span: number }[] = [];
  let currentLabel = format(ticks[0].date, 'yyyy/MM', { locale: ja });
  let count = 0;
  ticks.forEach((tick) => {
    const label = format(tick.date, 'yyyy/MM', { locale: ja });
    if (label !== currentLabel) {
      spans.push({ label: currentLabel, span: count });
      currentLabel = label;
      count = 1;
    } else {
      count += 1;
    }
  });
  spans.push({ label: currentLabel, span: count });
  return spans;
}

function alignRangeToWeek(range: { start: Date; end: Date }) {
  const start = startOfDay(range.start);
  const end = startOfDay(range.end);
  const startOffset = (start.getDay() + 6) % 7;
  const endOffset = (7 - end.getDay()) % 7;
  return {
    start: addDays(start, -startOffset),
    end: addDays(end, endOffset),
  };
}

function buildWeekSpans(ticks: { date: Date }[]) {
  if (ticks.length === 0) return [];
  const spans: { label: string; span: number }[] = [];
  let currentLabel = '';
  let count = 0;
  ticks.forEach((tick, index) => {
    const weekStart = tick.date;
    const month = weekStart.getMonth() + 1;
    const weekIndex = Math.floor((weekStart.getDate() - 1) / 7) + 1;
    const label = `${month}月${weekIndex}週`;
    if (index === 0) {
      currentLabel = label;
      count = 1;
      return;
    }
    if (label !== currentLabel) {
      spans.push({ label: currentLabel, span: count });
      currentLabel = label;
      count = 1;
    } else {
      count += 1;
    }
  });
  spans.push({ label: currentLabel, span: count });
  return spans;
}

export const GanttPrintView: React.FC<GanttPrintViewProps> = ({
  tasks,
  projectIds,
  viewMode = 'week',
  holidaySet,
  generatedBy,
  projectMeta,
  rangeMode = 'tasks',
}) => {
  const projects = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, GanttTask[]>();
    tasks.forEach((task) => {
      if (!projectIds.includes(task.projectId)) return;
      if (!map.has(task.projectId)) {
        map.set(task.projectId, []);
        order.push(task.projectId);
      }
      map.get(task.projectId)?.push(task);
    });
    return order.map((id) => {
      const list = map.get(id) ?? [];
      const name = list[0]?.projectName || id;
      return { id, name, tasks: list };
    });
  }, [tasks, projectIds]);

  if (projects.length === 0) return null;

  return (
    <div className="gantt-print-root">
      {projects.map((project) => {
        const info = projectMeta?.[project.id];
        const location = info?.['所在地/現地'] ?? info?.['所在地_現地'] ?? '';
        const plannedStart = info?.着工日 ?? info?.開始日 ?? '';
        const plannedEnd = info?.竣工予定日 ?? info?.予定完了日 ?? '';
        const baseRange = resolveTaskRange(project.tasks);
        const plannedStartDate = plannedStart ? parseDate(plannedStart) : null;
        const plannedEndDate = plannedEnd ? parseDate(plannedEnd) : null;
        const minStart = plannedStartDate && plannedStartDate < baseRange.start
          ? plannedStartDate
          : baseRange.start;
        const maxEnd = plannedEndDate && plannedEndDate > baseRange.end
          ? plannedEndDate
          : baseRange.end;
        const baseTotalDays = differenceInDays(maxEnd, minStart) + 1;
        const effectiveViewMode: ViewMode =
          baseTotalDays <= 14 ? 'day' : 'week';
        const bufferDays = effectiveViewMode === 'day' ? 2 : 14;
        const rawRange = rangeMode === 'construction'
          ? {
              start: addDays(startOfDay(minStart), -bufferDays),
              end: addDays(startOfDay(maxEnd), bufferDays),
            }
          : {
              start: addDays(startOfDay(baseRange.start), -bufferDays),
              end: addDays(startOfDay(baseRange.end), bufferDays),
            };
        const range = alignRangeToWeek(rawRange);
        const totalDays = differenceInDays(range.end, range.start) + 1;
        const dayTicks = calculateDateTicks(range.start, range.end, 'day', holidaySet ?? undefined);
        const weekTicks = calculateDateTicks(range.start, range.end, 'week', holidaySet ?? undefined);
        const ticks = weekTicks;
        const monthSpans = buildMonthSpans(ticks);
        const weekSpans = buildWeekSpans(ticks);
        const displayRangeLabel = `${formatDate(range.start)} 〜 ${formatDate(range.end)}`;
        const today = startOfDay(new Date());
        const todayOffset = differenceInDays(today, range.start);
        const showTodayLine = todayOffset >= 0 && todayOffset <= totalDays;
        const todayLeft = showTodayLine ? Math.max((todayOffset / totalDays) * 100, 0) : 0;
        const periodLabel = plannedStart || plannedEnd
          ? `${plannedStart || formatDate(range.start)} 〜 ${plannedEnd || formatDate(range.end)}`
          : '-';
        return (
          <section key={project.id} className="gantt-print-sheet">
            <header className="gantt-print-header">
              <div className="gantt-print-header-top">
                <div className="gantt-print-title">
                  <div className="gantt-print-title-main">工程表</div>
                  <div className="gantt-print-title-sub">Construction Schedule</div>
                </div>
                <div className="gantt-print-stamps">
                  <div className="gantt-print-stamp-box">
                    <div className="gantt-print-stamp-label">作成</div>
                    <div className="gantt-print-stamp-circle"></div>
                  </div>
                  <div className="gantt-print-stamp-box">
                    <div className="gantt-print-stamp-label">確認</div>
                    <div className="gantt-print-stamp-circle"></div>
                  </div>
                  <div className="gantt-print-stamp-box">
                    <div className="gantt-print-stamp-label">承認</div>
                    <div className="gantt-print-stamp-circle"></div>
                  </div>
                </div>
              </div>
              <div className="gantt-print-meta">
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">工事名</span>
                  <span className="gantt-print-meta-value">{project.name}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">工事場所</span>
                  <span className="gantt-print-meta-value">{location || '-'}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">発注者</span>
                  <span className="gantt-print-meta-value">{info?.クライアント || '-'}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">施工者</span>
                  <span className="gantt-print-meta-value">{(info as any)?.組織名 || (info as any)?.会社名 || '-'}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">工事工期</span>
                  <span className="gantt-print-meta-value">{periodLabel}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">表示期間</span>
                  <span className="gantt-print-meta-value">{displayRangeLabel}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">施工管理</span>
                  <span className="gantt-print-meta-value">{info?.施工管理 || '-'}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">PM</span>
                  <span className="gantt-print-meta-value">{info?.PM || info?.自社PM || '-'}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">設計</span>
                  <span className="gantt-print-meta-value">{info?.設計 || '-'}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">営業</span>
                  <span className="gantt-print-meta-value">{info?.営業 || '-'}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">作成日</span>
                  <span className="gantt-print-meta-value">{format(new Date(), 'yyyy/MM/dd')}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">作成者</span>
                  <span className="gantt-print-meta-value">{generatedBy || '-'}</span>
                </div>
                <div className="gantt-print-meta-row">
                  <span className="gantt-print-meta-label">版数</span>
                  <span className="gantt-print-meta-value">1.0</span>
                </div>
              </div>
            </header>

            <div className="gantt-print-table">
              <div className="gantt-print-table-head">
                <div className="gantt-print-col gantt-print-col-task">工種/作業</div>
                <div className="gantt-print-col gantt-print-col-assignee">担当</div>
                <div className="gantt-print-col gantt-print-col-date">開始</div>
                <div className="gantt-print-col gantt-print-col-date">終了</div>
                <div className="gantt-print-col gantt-print-col-days">日数</div>
                <div className="gantt-print-col gantt-print-col-progress">進捗</div>
                <div className="gantt-print-col gantt-print-col-timeline">
                  <div
                    className="gantt-print-months"
                    style={{ gridTemplateColumns: `repeat(${ticks.length}, minmax(12px, 1fr))` }}
                  >
                    {monthSpans.map((span, idx) => (
                      <div
                        key={`${span.label}-${idx}`}
                        className="gantt-print-month"
                        style={{ gridColumn: `span ${span.span}` }}
                      >
                        {span.label}
                      </div>
                    ))}
                  </div>
                  <div
                    className="gantt-print-weeks"
                    style={{ gridTemplateColumns: `repeat(${ticks.length}, minmax(12px, 1fr))` }}
                  >
                    {weekSpans.map((span, idx) => (
                      <div
                        key={`${span.label}-${idx}`}
                        className="gantt-print-week"
                        style={{ gridColumn: `span ${span.span}` }}
                      >
                        {span.label}
                      </div>
                    ))}
                  </div>
                  <div
                    className="gantt-print-ticks"
                    style={{ gridTemplateColumns: `repeat(${ticks.length}, minmax(12px, 1fr))` }}
                  >
                    {ticks.map((tick, index) => {
                      const prev = ticks[index - 1];
                      const isMonthBoundary = !prev || tick.date.getMonth() !== prev.date.getMonth();
                      const isWeekBoundary =
                        effectiveViewMode === 'day'
                          ? tick.date.getDay() === 1
                          : true;
                      return (
                        <div
                          key={tick.date.toISOString()}
                          className={`gantt-print-tick${tick.isWeekend ? ' is-weekend' : ''}${tick.isHoliday ? ' is-holiday' : ''}${isMonthBoundary ? ' is-month-boundary' : ''}${isWeekBoundary ? ' is-week-boundary' : ''}`}
                        >
                          {' '}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="gantt-print-table-body">
                {project.tasks.map((task) => {
                  const safeStart = task.startDate instanceof Date && !Number.isNaN(task.startDate.getTime());
                  const safeEnd = task.endDate instanceof Date && !Number.isNaN(task.endDate.getTime());
                  const { left, width, durationDays } = safeStart && safeEnd
                    ? getTaskPercent(task, range)
                    : { left: 0, width: 0, durationDays: 0 };
                  const statusColor = PRINT_STATUS_COLORS[task.status] || STATUS_COLORS[task.status] || '#64748b';
                  const isStage = task.type === 'stage';
                  const isChild = Boolean(task.parentId) && !isStage;
                  return (
                    <div key={task.id} className={`gantt-print-row${isStage ? ' is-stage' : ''}${isChild ? ' is-child' : ''}`}>
                      <div className="gantt-print-col gantt-print-col-task">
                        <div
                          className="gantt-print-task-name"
                          style={{ paddingLeft: isChild ? '12px' : '0' }}
                        >
                          {task.name || '無題'}
                        </div>
                        {task.description ? <div className="gantt-print-task-note">{task.description}</div> : null}
                      </div>
                      <div className="gantt-print-col gantt-print-col-assignee">{task.assignee || '-'}</div>
                      <div className="gantt-print-col gantt-print-col-date">{safeStart ? formatDate(task.startDate) : '-'}</div>
                      <div className="gantt-print-col gantt-print-col-date">{safeEnd ? formatDate(task.endDate) : '-'}</div>
                      <div className="gantt-print-col gantt-print-col-days">{durationDays ? `${durationDays}日` : '-'}</div>
                      <div className="gantt-print-col gantt-print-col-progress">{Math.round(task.progress || 0)}%</div>
                      <div className="gantt-print-col gantt-print-col-timeline">
                        <div
                          className="gantt-print-grid"
                          style={{ gridTemplateColumns: `repeat(${ticks.length}, minmax(12px, 1fr))` }}
                        >
                          {ticks.map((tick, index) => {
                            const prev = ticks[index - 1];
                            const isMonthBoundary = !prev || tick.date.getMonth() !== prev.date.getMonth();
                            const isWeekBoundary =
                              effectiveViewMode === 'day'
                                ? tick.date.getDay() === 1
                                : true;
                            return (
                              <div
                                key={`${task.id}-${tick.date.toISOString()}`}
                                className={`gantt-print-grid-cell${tick.isWeekend ? ' is-weekend' : ''}${tick.isHoliday ? ' is-holiday' : ''}${isMonthBoundary ? ' is-month-boundary' : ''}${isWeekBoundary ? ' is-week-boundary' : ''}`}
                              />
                            );
                          })}
                        </div>
                        {dayTicks.map((tick) => {
                          if (!tick.isWeekend) return null;
                          const offset = differenceInDays(tick.date, range.start);
                          const left = Math.max((offset / totalDays) * 100, 0);
                          const width = Math.max((1 / totalDays) * 100, 0.2);
                          return (
                            <div
                              key={`${task.id}-weekend-${tick.date.toISOString()}`}
                              className="gantt-print-weekend-band"
                              style={{ left: `${left}%`, width: `${width}%` }}
                            />
                          );
                        })}
                        {showTodayLine ? (
                          <div
                            className="gantt-print-today-line"
                            style={{ left: `${todayLeft}%` }}
                          />
                        ) : null}
                        {safeStart && safeEnd ? (
                          <div
                            className="gantt-print-bar"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              backgroundColor: statusColor,
                            }}
                            data-status={task.status}
                          >
                            <div
                              className="gantt-print-bar-progress"
                              style={{ width: `${Math.max(0, Math.min(100, Math.round(task.progress || 0)))}%` }}
                            />
                          </div>
                        ) : (
                          <div className="gantt-print-bar gantt-print-bar-empty">日付未設定</div>
                        )}
                        {task.milestone ? (
                          <>
                            <div className="gantt-print-milestone-line" style={{ left: `${left}%` }} />
                            <div className="gantt-print-milestone" style={{ left: `${left}%` }} />
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className="gantt-print-footer">
              <div className="gantt-print-footer-section">
                <div className="gantt-print-footer-label">備考</div>
                <div className="gantt-print-footer-remarks">
                  <div className="gantt-print-footer-remark-line"></div>
                  <div className="gantt-print-footer-remark-line"></div>
                </div>
              </div>
              <div className="gantt-print-footer-info">
                <div className="gantt-print-footer-note">
                  ※ 本工程表はCompassから出力された内容です。最新の契約条件・進捗は担当者へご確認ください。
                </div>
                <div className="gantt-print-footer-page">
                  ページ: 1 / 1
                </div>
              </div>
            </footer>
            <div className="gantt-print-legend">
              <div className="gantt-print-legend-item">
                <span className="gantt-print-legend-swatch" style={{ backgroundColor: STATUS_COLORS.in_progress }} />
                進行中
              </div>
              <div className="gantt-print-legend-item">
                <span className="gantt-print-legend-swatch" style={{ backgroundColor: STATUS_COLORS.completed }} />
                完了
              </div>
              <div className="gantt-print-legend-item">
                <span className="gantt-print-legend-swatch" style={{ backgroundColor: STATUS_COLORS.on_hold }} />
                保留
              </div>
              <div className="gantt-print-legend-item">
                <span className="gantt-print-legend-swatch" style={{ backgroundColor: STATUS_COLORS.overdue }} />
                遅延
              </div>
              <div className="gantt-print-legend-item">
                <span className="gantt-print-legend-diamond" />
                マイルストーン
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default GanttPrintView;
