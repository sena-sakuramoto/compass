import React, { useMemo } from 'react';
import { addDays, differenceInDays, format, startOfDay, getDay } from 'date-fns';
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

// 印刷用のモノクロ対応カラー
const PRINT_BAR_COLORS = {
  in_progress: '#3b82f6',    // 青
  completed: '#22c55e',      // 緑
  not_started: '#94a3b8',    // グレー
  on_hold: '#f59e0b',        // 黄
  overdue: '#ef4444',        // 赤
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

function formatDateShort(value: Date) {
  return format(value, 'yyyy/MM/dd', { locale: ja });
}

function formatDateCompact(value: Date) {
  return format(value, 'M/d', { locale: ja });
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

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

function buildMonthGroups(dayTicks: { date: Date }[]) {
  if (dayTicks.length === 0) return [];
  const groups: { label: string; span: number; year: number; month: number }[] = [];
  let currentKey = '';
  let count = 0;
  let currentYear = 0;
  let currentMonth = 0;

  dayTicks.forEach((tick) => {
    const year = tick.date.getFullYear();
    const month = tick.date.getMonth() + 1;
    const key = `${year}-${month}`;
    if (key !== currentKey) {
      if (currentKey) {
        groups.push({ label: `${currentYear}年${currentMonth}月`, span: count, year: currentYear, month: currentMonth });
      }
      currentKey = key;
      currentYear = year;
      currentMonth = month;
      count = 1;
    } else {
      count += 1;
    }
  });
  if (currentKey) {
    groups.push({ label: `${currentYear}年${currentMonth}月`, span: count, year: currentYear, month: currentMonth });
  }
  return groups;
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

        // バッファを追加して範囲を計算
        const bufferDays = 3;
        const range = {
          start: addDays(startOfDay(rangeMode === 'construction' ? minStart : baseRange.start), -bufferDays),
          end: addDays(startOfDay(rangeMode === 'construction' ? maxEnd : baseRange.end), bufferDays),
        };

        const totalDays = differenceInDays(range.end, range.start) + 1;
        const dayTicks = calculateDateTicks(range.start, range.end, 'day', holidaySet ?? undefined);
        const monthGroups = buildMonthGroups(dayTicks);

        const displayRangeLabel = `${formatDateShort(range.start)} 〜 ${formatDateShort(range.end)}`;
        const periodLabel = plannedStart || plannedEnd
          ? `${plannedStart || '-'} 〜 ${plannedEnd || '-'}`
          : '-';

        // プロジェクトマイルストーンを計算
        const projectMilestones: { date: Date; label: string; color: string }[] = [];
        const chakkoDate = parseDate(info?.着工日 ?? null);
        const shunkoDate = parseDate(info?.竣工予定日 ?? null);
        const hikiwatashiDate = parseDate(info?.引渡し予定日 ?? null);

        if (chakkoDate && chakkoDate >= range.start && chakkoDate <= range.end) {
          projectMilestones.push({ date: chakkoDate, label: '着工', color: '#059669' });
        }
        if (shunkoDate && shunkoDate >= range.start && shunkoDate <= range.end) {
          projectMilestones.push({ date: shunkoDate, label: '竣工', color: '#2563eb' });
        }
        if (hikiwatashiDate && hikiwatashiDate >= range.start && hikiwatashiDate <= range.end) {
          projectMilestones.push({ date: hikiwatashiDate, label: '引渡', color: '#dc2626' });
        }

        // マイルストーンの位置を計算
        const getMilestonePercent = (date: Date) => {
          const offset = differenceInDays(startOfDay(date), range.start);
          return (offset / totalDays) * 100;
        };

        return (
          <section key={project.id} className="print-sheet">
            {/* ヘッダー */}
            <header className="print-header">
              <div className="print-header-left">
                <div className="print-title">
                  <span className="print-title-main">工 程 表</span>
                  <span className="print-title-sub">CONSTRUCTION SCHEDULE</span>
                </div>
                <div className="print-project-name">{project.name}</div>
              </div>
              <div className="print-header-right">
                <div className="print-stamps">
                  <div className="print-stamp">
                    <span className="print-stamp-label">承認</span>
                    <div className="print-stamp-circle" />
                  </div>
                  <div className="print-stamp">
                    <span className="print-stamp-label">確認</span>
                    <div className="print-stamp-circle" />
                  </div>
                  <div className="print-stamp">
                    <span className="print-stamp-label">作成</span>
                    <div className="print-stamp-circle" />
                  </div>
                </div>
              </div>
            </header>

            {/* メタ情報 */}
            <div className="print-meta">
              <div className="print-meta-grid">
                <div className="print-meta-item">
                  <span className="print-meta-label">工事場所</span>
                  <span className="print-meta-value">{location || '-'}</span>
                </div>
                <div className="print-meta-item">
                  <span className="print-meta-label">発注者</span>
                  <span className="print-meta-value">{info?.クライアント || '-'}</span>
                </div>
                <div className="print-meta-item">
                  <span className="print-meta-label">工事工期</span>
                  <span className="print-meta-value">{periodLabel}</span>
                </div>
                <div className="print-meta-item">
                  <span className="print-meta-label">表示期間</span>
                  <span className="print-meta-value">{displayRangeLabel}</span>
                </div>
                <div className="print-meta-item">
                  <span className="print-meta-label">作成日</span>
                  <span className="print-meta-value">{format(new Date(), 'yyyy年MM月dd日')}</span>
                </div>
                <div className="print-meta-item">
                  <span className="print-meta-label">作成者</span>
                  <span className="print-meta-value">{generatedBy || '-'}</span>
                </div>
              </div>
            </div>

            {/* メインテーブル */}
            <div className="print-table">
              {/* テーブルヘッダー */}
              <div className="print-table-header">
                <div className="print-col print-col-task">作業項目</div>
                <div className="print-col print-col-assignee">担当</div>
                <div className="print-col print-col-period">期間</div>
                <div className="print-col print-col-days">日数</div>
                <div className="print-col print-col-progress">進捗</div>
                <div className="print-col print-col-timeline">
                  {/* 月ヘッダー */}
                  <div className="print-timeline-months" style={{ gridTemplateColumns: `repeat(${dayTicks.length}, 1fr)` }}>
                    {monthGroups.map((group, idx) => (
                      <div
                        key={`month-${idx}`}
                        className="print-timeline-month"
                        style={{ gridColumn: `span ${group.span}` }}
                      >
                        {group.label}
                      </div>
                    ))}
                  </div>
                  {/* 日付ヘッダー */}
                  <div className="print-timeline-days" style={{ gridTemplateColumns: `repeat(${dayTicks.length}, 1fr)` }}>
                    {dayTicks.map((tick, idx) => {
                      const day = tick.date.getDate();
                      const isMonthStart = day === 1;
                      return (
                        <div
                          key={`day-${idx}`}
                          className={`print-timeline-day ${isMonthStart ? 'is-month-start' : ''} ${tick.isWeekend ? 'is-weekend' : ''} ${tick.isHoliday ? 'is-holiday' : ''}`}
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>
                  {/* 曜日ヘッダー */}
                  <div className="print-timeline-weekdays" style={{ gridTemplateColumns: `repeat(${dayTicks.length}, 1fr)` }}>
                    {dayTicks.map((tick, idx) => {
                      const weekday = getDay(tick.date);
                      return (
                        <div
                          key={`wd-${idx}`}
                          className={`print-timeline-weekday ${tick.isWeekend ? 'is-weekend' : ''} ${tick.isHoliday ? 'is-holiday' : ''}`}
                        >
                          {WEEKDAY_LABELS[weekday]}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* テーブルボディ */}
              <div className="print-table-body">
                {project.tasks.map((task, rowIdx) => {
                    const safeStart = task.startDate instanceof Date && !Number.isNaN(task.startDate.getTime());
                    const safeEnd = task.endDate instanceof Date && !Number.isNaN(task.endDate.getTime());
                    const { left, width, durationDays } = safeStart && safeEnd
                      ? getTaskPercent(task, range)
                      : { left: 0, width: 0, durationDays: 0 };
                    const barColor = PRINT_BAR_COLORS[task.status as keyof typeof PRINT_BAR_COLORS] || PRINT_BAR_COLORS.in_progress;
                    const isStage = task.type === 'stage';
                    const isChild = Boolean(task.parentId) && !isStage;
                    const isMilestone = task.milestone;
                    const progressPct = Math.round(task.progress || 0);
                    const periodStr = safeStart && safeEnd
                      ? `${formatDateCompact(task.startDate)} - ${formatDateCompact(task.endDate)}`
                      : '-';
                    const isEven = rowIdx % 2 === 0;

                    return (
                      <div key={task.id} className={`print-row ${isStage ? 'is-stage' : ''} ${isChild ? 'is-child' : ''} ${isEven ? 'is-even' : 'is-odd'}`}>
                        <div className="print-col print-col-task">
                          <span className={`print-task-name ${isChild ? 'is-child' : ''}`}>
                            {isChild && <span className="print-task-indent">└ </span>}
                            {task.name || '無題'}
                          </span>
                        </div>
                        <div className="print-col print-col-assignee">{task.assignee || '-'}</div>
                        <div className="print-col print-col-period">{periodStr}</div>
                        <div className="print-col print-col-days">{durationDays ? `${durationDays}日` : '-'}</div>
                        <div className="print-col print-col-progress">{progressPct}%</div>
                        <div className="print-col print-col-timeline">
                          {/* グリッド背景 */}
                          <div className="print-timeline-grid" style={{ gridTemplateColumns: `repeat(${dayTicks.length}, 1fr)` }}>
                            {dayTicks.map((tick, idx) => {
                              const day = tick.date.getDate();
                              const isMonthStart = day === 1;
                              return (
                                <div
                                  key={`grid-${idx}`}
                                  className={`print-grid-cell ${isMonthStart ? 'is-month-start' : ''} ${tick.isWeekend ? 'is-weekend' : ''} ${tick.isHoliday ? 'is-holiday' : ''}`}
                                />
                              );
                            })}
                          </div>

                          {/* タスクバー or マイルストーン */}
                          {safeStart && safeEnd && !isMilestone && (
                            <div
                              className="print-bar"
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                backgroundColor: barColor,
                              }}
                            >
                              {/* 進捗バー */}
                              {progressPct > 0 && (
                                <div
                                  className="print-bar-progress"
                                  style={{ width: `${progressPct}%` }}
                                />
                              )}
                            </div>
                          )}

                          {/* マイルストーン */}
                          {isMilestone && safeStart && (
                            <div
                              className="print-milestone"
                              style={{ left: `${left}%` }}
                            >
                              <span className="print-milestone-label">{task.name}</span>
                            </div>
                          )}

                          {/* プロジェクトマイルストーン（着工・竣工・引渡）の縦線 */}
                          {projectMilestones.map((ms, msIdx) => (
                            <div
                              key={`pms-${msIdx}`}
                              className="print-project-milestone"
                              style={{
                                left: `${getMilestonePercent(ms.date)}%`,
                                borderColor: ms.color,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* プロジェクトマイルストーンのラベル行 */}
              {projectMilestones.length > 0 && (
                <div className="print-milestone-labels">
                  <div className="print-col print-col-task">
                    <span className="print-task-name" style={{ fontWeight: 700, color: '#475569' }}>
                      ▼ マイルストーン
                    </span>
                  </div>
                  <div className="print-col print-col-assignee" />
                  <div className="print-col print-col-period" />
                  <div className="print-col print-col-days" />
                  <div className="print-col print-col-progress" />
                  <div className="print-col print-col-timeline">
                    {projectMilestones.map((ms, msIdx) => (
                      <div
                        key={`pms-label-${msIdx}`}
                        className="print-project-milestone-marker"
                        style={{ left: `${getMilestonePercent(ms.date)}%` }}
                      >
                        <div
                          className="print-project-milestone-diamond"
                          style={{ backgroundColor: ms.color }}
                        />
                        <span className="print-project-milestone-text" style={{ color: ms.color }}>
                          {ms.label}
                          <br />
                          <span style={{ fontSize: '7px', color: '#64748b' }}>
                            {format(ms.date, 'M/d')}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 備考欄 */}
            <div className="print-remarks">
              <div className="print-remarks-header">備考</div>
              <div className="print-remarks-lines">
                <div className="print-remarks-line" />
                <div className="print-remarks-line" />
              </div>
            </div>

            {/* フッター */}
            <footer className="print-footer">
              <div className="print-footer-left">
                <div className="print-legend">
                  <span className="print-legend-title">凡例:</span>
                  <div className="print-legend-item">
                    <span className="print-legend-bar" style={{ backgroundColor: PRINT_BAR_COLORS.in_progress }} />
                    <span>進行中</span>
                  </div>
                  <div className="print-legend-item">
                    <span className="print-legend-bar" style={{ backgroundColor: PRINT_BAR_COLORS.completed }} />
                    <span>完了</span>
                  </div>
                  <div className="print-legend-item">
                    <span className="print-legend-bar" style={{ backgroundColor: PRINT_BAR_COLORS.not_started }} />
                    <span>未着手</span>
                  </div>
                  <div className="print-legend-item">
                    <span className="print-legend-bar" style={{ backgroundColor: PRINT_BAR_COLORS.on_hold }} />
                    <span>保留</span>
                  </div>
                  <div className="print-legend-item">
                    <span className="print-legend-bar" style={{ backgroundColor: PRINT_BAR_COLORS.overdue }} />
                    <span>遅延</span>
                  </div>
                  <div className="print-legend-item">
                    <span className="print-legend-diamond" />
                    <span>マイルストーン</span>
                  </div>
                  <span className="print-legend-divider">|</span>
                  <div className="print-legend-item">
                    <span className="print-legend-milestone-line" style={{ borderColor: '#059669' }} />
                    <span>着工</span>
                  </div>
                  <div className="print-legend-item">
                    <span className="print-legend-milestone-line" style={{ borderColor: '#2563eb' }} />
                    <span>竣工</span>
                  </div>
                  <div className="print-legend-item">
                    <span className="print-legend-milestone-line" style={{ borderColor: '#dc2626' }} />
                    <span>引渡</span>
                  </div>
                </div>
              </div>
              <div className="print-footer-right">
                <div className="print-footer-note">
                  ※ 本工程表は Project Compass により出力されました
                </div>
              </div>
            </footer>
          </section>
        );
      })}
    </div>
  );
};

export default GanttPrintView;
