import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';
import type { TooltipProps } from 'recharts';
import { DAY_MS } from '../lib/date';

export interface GanttDatum {
  key: string;
  name: string;
  offset: number;
  duration: number;
  startLabel: string;
  endLabel: string;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  status?: string;
  isOverdue?: boolean;
  progressRatio?: number;
  projectLabel?: string;
  assigneeLabel?: string;
}

export interface GanttProps {
  data: GanttDatum[];
  ticks: number[];
  min: number;
  max: number;
  minDate: Date | null;
  maxDate: Date | null;
  todayX: number | null;
  interactive?: boolean;
  onChange?: (entry: GanttDatum, change: { startDate: Date; endDate: Date; offset: number; duration: number }, kind: InteractionKind) => void;
  onAssigneeChange?: (taskKey: string, assignee: string) => void;
  draggedAssignee?: string | null;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  完了: '#10b981',      // Emerald - より明るく
  進行中: '#3b82f6',    // Blue - より鮮やか
  確認待ち: '#f59e0b',  // Amber - より目立つ
  保留: '#ef4444',      // Red - より明確
  未着手: '#94a3b8',    // Slate - 控えめ
};

const DEFAULT_STATUS_COLOR = '#6366f1';  // Indigo
const OVERDUE_COLOR = '#dc2626';
const DEFAULT_STATUS_LABEL = 'ステータス未設定';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function getBarColor(entry: GanttDatum) {
  if (entry.isOverdue && entry.status !== '完了') {
    return OVERDUE_COLOR;
  }
  if (entry.status && STATUS_COLOR_MAP[entry.status]) {
    return STATUS_COLOR_MAP[entry.status];
  }
  return DEFAULT_STATUS_COLOR;
}

function getLegendLabel(entry: GanttDatum) {
  if (entry.isOverdue && entry.status !== '完了') {
    return '期限超過';
  }
  return entry.status ?? DEFAULT_STATUS_LABEL;
}

function getBarOpacity(entry: GanttDatum) {
  if (entry.status === '完了') return 0.6;
  if (entry.status === '未着手') return 0.7;
  return 1;
}

function formatTooltipDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const weekday = WEEKDAYS[date.getDay()];
  return `${year}/${month}/${day} (${weekday})`;
}

function GanttXAxisTick({ x, y, payload, minDate }: { x: number; y: number; payload: any; minDate: Date | null }) {
  if (!minDate) return null;
  const value = Number(payload?.value ?? 0);
  const date = new Date(minDate.getTime() + value * DAY_MS);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdayIndex = date.getDay();
  const weekday = WEEKDAYS[weekdayIndex];
  const isWeekend = weekdayIndex === 0 || weekdayIndex === 6;
  const primaryColor = isWeekend ? '#f43f5e' : '#475569';
  const secondaryColor = isWeekend ? '#fb7185' : '#94a3b8';
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={-4} textAnchor="middle" fontSize={11} fontWeight={600} fill={primaryColor}>
        {`${month}/${day}`}
      </text>
      <text x={0} y={10} textAnchor="middle" fontSize={10} fill={secondaryColor}>
        {weekday}
      </text>
    </g>
  );
}

function GanttYAxisTick({ x, y, payload, width }: { x: number; y: number; payload: any; width?: number }) {
  const datum = (payload?.payload ?? {}) as GanttDatum;
  
  // projectLabelがあればそれを使用、なければnameを使用
  const project = (datum.projectLabel || datum.name || '（無題）');
  // projectLabelがある場合はnameをタスク名として表示
  const taskName = datum.projectLabel ? datum.name : undefined;
  const assignee = datum.assigneeLabel;
  const maxWidth = (width ?? 300) - 20; // 左右のマージンを考慮
  
  // テキストを切り詰める関数
  const truncateText = (text: string, maxLen: number) => {
    if (!text || text.length <= maxLen) return text;
    return text.substring(0, maxLen - 1) + '…';
  };
  
  const maxProjectChars = Math.floor(maxWidth / 8); // おおよその文字幅
  const maxTaskChars = Math.floor(maxWidth / 7);
  
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} y={-4} textAnchor="end" fontSize={12} fontWeight={600} fill="#0f172a">
        {truncateText(project, maxProjectChars)}
      </text>
      {taskName ? (
        <text x={-8} y={10} textAnchor="end" fontSize={10} fill="#64748b">
          {truncateText(taskName + (assignee ? ` ｜ ${assignee}` : ''), maxTaskChars)}
        </text>
      ) : assignee ? (
        <text x={-8} y={10} textAnchor="end" fontSize={10} fill="#64748b">
          {truncateText(assignee, maxTaskChars)}
        </text>
      ) : null}
    </g>
  );
}

function GanttTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload as GanttDatum;
  const progress = typeof entry.progressRatio === 'number' ? Math.round(entry.progressRatio * 100) : null;
  return (
    <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-xl backdrop-blur">
      <div className="text-sm font-semibold text-slate-800">{entry.name}</div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
        <span>{formatTooltipDate(entry.startDate)}</span>
        <span>→</span>
        <span>{formatTooltipDate(entry.endDate)}</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">期間: {entry.durationDays}日</div>
      {entry.status ? (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getBarColor(entry) }} />
            {entry.status}
          </span>
          {entry.isOverdue ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-600">期限超過</span>
          ) : null}
        </div>
      ) : null}
      {typeof progress === 'number' ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-1.5 bg-slate-800" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11px] font-medium text-slate-700">{progress}%</span>
        </div>
      ) : null}
    </div>
  );
}

type InteractionKind = 'move' | 'resize-start' | 'resize-end';

interface DragState {
  entry: GanttDatum;
  kind: InteractionKind;
  startX: number;
  initialOffset: number;
  initialDuration: number;
  currentOffset: number;
  currentDuration: number;
  pointerId: number;
}

export function GanttChartView({
  data,
  ticks,
  min,
  max,
  minDate,
  todayX,
  interactive = false,
  onChange,
  onAssigneeChange,
  draggedAssignee,
}: GanttProps) {
  const [chartWidth, setChartWidth] = useState(0);
  const [yAxisWidth, setYAxisWidth] = useState(300);
  const [preview, setPreview] = useState<Record<string, { offset: number; duration: number }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const configRef = useRef({ minDate, max, chartWidth });
  const onChangeRef = useRef(typeof onChange === 'function' ? onChange : undefined);

  const noData = data.length === 0;

  useEffect(() => {
    configRef.current = { minDate, max, chartWidth };
  }, [minDate, max, chartWidth]);

  useEffect(() => {
    onChangeRef.current = typeof onChange === 'function' ? onChange : undefined;
  }, [onChange]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setChartWidth(containerRef.current.clientWidth);
        // 画面幅に応じてY軸の幅を調整
        const viewportWidth = window.innerWidth;
        if (viewportWidth < 768) {
          setYAxisWidth(150); // モバイル
        } else if (viewportWidth < 1024) {
          setYAxisWidth(200); // タブレット
        } else if (viewportWidth < 1440) {
          setYAxisWidth(250); // 小型デスクトップ
        } else {
          setYAxisWidth(300); // 大型デスクトップ
        }
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [data, ticks]);

  useEffect(() => {
    if (!data.length) {
      setPreview({});
      return;
    }
    setPreview((prev) => {
      const keep = new Set(data.map((item) => item.key));
      const next: Record<string, { offset: number; duration: number }> = {};
      let changed = false;
      Object.entries(prev).forEach(([key, value]) => {
        if (keep.has(key)) {
          next[key] = value;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [data]);

  const displayData = useMemo(() => {
    if (!Object.keys(preview).length) return data;
    return data.map((item) => {
      const override = preview[item.key];
      if (!override) return item;
      return { ...item, offset: override.offset, duration: override.duration };
    });
  }, [data, preview]);

  const legendItems = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string }>();
    displayData.forEach((entry) => {
      const label = getLegendLabel(entry);
      const color = getBarColor(entry);
      if (!map.has(label)) {
        map.set(label, { key: label, label, color });
      }
    });
    return Array.from(map.values());
  }, [displayData]);

  const handleWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;

      const { chartWidth: width, max: spanRaw } = configRef.current;
      if (!width || width <= 0) return;
      const span = Math.max(1, spanRaw || 1);
      const pixelsPerDay = width / span;
      if (!Number.isFinite(pixelsPerDay) || pixelsPerDay === 0) return;

      // 滑らかな移動のため、より細かい精度で計算
      const deltaPixels = event.clientX - state.startX;
      const exactDeltaDays = deltaPixels / pixelsPerDay;

      // ピクセル単位で15px以上動いたらスナップ
      const deltaDays = pixelsPerDay > 15 ? Math.round(exactDeltaDays) : Math.floor(exactDeltaDays);

      let newOffset = state.initialOffset;
      let newDuration = state.initialDuration;

      if (state.kind === 'move') {
        newOffset = state.initialOffset + deltaDays;
        const maxOffset = Math.max(0, span - state.initialDuration);
        if (newOffset < 0) newOffset = 0;
        if (newOffset > maxOffset) newOffset = maxOffset;
      } else if (state.kind === 'resize-start') {
        newOffset = state.initialOffset + deltaDays;
        const maxOffset = state.initialOffset + state.initialDuration - 1;
        if (newOffset < 0) newOffset = 0;
        if (newOffset > maxOffset) newOffset = maxOffset;
        newDuration = state.initialDuration + (state.initialOffset - newOffset);
        if (newDuration < 1) {
          newDuration = 1;
          newOffset = state.initialOffset + state.initialDuration - 1;
        }
        if (newOffset + newDuration > span) {
          const overflow = newOffset + newDuration - span;
          newOffset = Math.max(0, newOffset - overflow);
          newDuration = span - newOffset;
        }
      } else {
        // resize-end
        newDuration = state.initialDuration + deltaDays;
        if (newDuration < 1) newDuration = 1;
        const maxDuration = Math.max(1, span - state.initialOffset);
        if (newDuration > maxDuration) newDuration = maxDuration;
        newOffset = state.initialOffset;
      }

      if (newOffset === state.currentOffset && newDuration === state.currentDuration) return;

      state.currentOffset = newOffset;
      state.currentDuration = newDuration;
      setPreview((prev) => ({
        ...prev,
        [state.entry.key]: { offset: newOffset, duration: newDuration },
      }));
    },
    []
  );

  const handleWindowPointerEnd = useCallback(
    (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;

      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);

      dragRef.current = null;
      setActiveId(null);
      setPreview((prev) => {
        const next = { ...prev };
        delete next[state.entry.key];
        return next;
      });

      const { minDate: baseline } = configRef.current;
      if (!baseline) return;

      const offset = state.currentOffset;
      const duration = state.currentDuration;
      if (offset === state.initialOffset && duration === state.initialDuration) return;

      const startDate = new Date(baseline.getTime() + offset * DAY_MS);
      const endDate = new Date(startDate.getTime() + (duration - 1) * DAY_MS);

      onChangeRef.current?.(state.entry, { startDate, endDate, offset, duration }, state.kind);
    },
    [handleWindowPointerMove]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
    };
  }, [handleWindowPointerEnd, handleWindowPointerMove]);

  const handlePointerDown = useCallback(
    (entry: GanttDatum, kind: InteractionKind, event: React.PointerEvent<SVGRectElement>) => {
      if (!interactive) return;
      if (!configRef.current.minDate) return;
      const span = Math.max(1, configRef.current.max || 1);
      if (span <= 0) return;

      event.preventDefault();
      event.stopPropagation();

      dragRef.current = {
        entry,
        kind,
        startX: event.clientX,
        initialOffset: entry.offset,
        initialDuration: entry.duration,
        currentOffset: entry.offset,
        currentDuration: entry.duration,
        pointerId: event.pointerId,
      };

      try {
        (event.currentTarget as SVGRectElement).setPointerCapture?.(event.pointerId);
      } catch (err) {
        // ignore if pointer capture is not supported
      }

      setActiveId(entry.key);
      setPreview((prev) => ({
        ...prev,
        [entry.key]: { offset: entry.offset, duration: entry.duration },
      }));

      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', handleWindowPointerEnd);
      window.addEventListener('pointercancel', handleWindowPointerEnd);
    },
    [interactive, handleWindowPointerEnd, handleWindowPointerMove]
  );

  if (noData) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
        表示できるスケジュールがありません
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[320px] flex-col gap-3">
      {legendItems.length ? (
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {legendItems.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative flex-1" ref={containerRef}>
        {/* 独自のY軸ラベル */}
        <div 
          className="absolute left-0 top-0 bottom-0 bg-white" 
          style={{ width: yAxisWidth, zIndex: 9999, pointerEvents: 'none' }}
        >
          {displayData.map((entry, index) => {
            const barSize = 24;
            const barCategoryGap = 8;
            const itemHeight = barSize + barCategoryGap;
            const xAxisHeight = 48; // XAxisのheight
            const marginTop = 20;
            const yPosition = marginTop + xAxisHeight + index * itemHeight + barSize / 2; // XAxisを考慮
            
            // シンプルな1行表示
            const labelText = entry.name || '（無題）';
            
            return (
              <div
                key={entry.key}
                className="absolute right-2 text-right"
                style={{ 
                  top: `${yPosition}px`, 
                  maxWidth: yAxisWidth - 16,
                  transform: 'translateY(-50%)' // 中央揃え
                }}
              >
                <div className="text-sm font-medium text-slate-700 truncate">
                  {labelText}
                </div>
              </div>
            );
          })}
        </div>
        <ResponsiveContainer
          width="100%"
          height="100%"
          onResize={(width) => {
            if (typeof width === 'number' && !Number.isNaN(width)) {
              setChartWidth(width);
            }
          }}
        >
          <BarChart
            data={displayData}
            layout="vertical"
            margin={{ left: yAxisWidth, right: 32, top: 20, bottom: 20 }}
            barCategoryGap={8}
            barSize={24}
          >
            <CartesianGrid horizontal vertical={false} stroke="#e2e8f0" strokeDasharray="2 4" />
            <XAxis
              type="number"
              domain={[min, max]}
              ticks={ticks}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              tick={(props) => <GanttXAxisTick {...props} minDate={minDate} />}
              tickMargin={12}
              interval={0}
              height={48}
              orientation="top"
            />

            <Bar dataKey="offset" stackId="g" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="duration"
              stackId="g"
              radius={[8, 8, 8, 8]}
              minPointSize={2}
              isAnimationActive={false}
              shape={(shapeProps: any) => {
                const entry = shapeProps.payload as GanttDatum;
                const color = getBarColor(entry);
                const opacity = getBarOpacity(entry);
                return (
                  <InteractiveBarShape
                    {...shapeProps}
                    color={color}
                    fillOpacity={opacity}
                    entry={entry}
                    interactive={interactive && (!entry.status || entry.status !== '完了')}
                    isActive={entry.key === activeId}
                    isDropTarget={entry.key === dropTargetId}
                    onPointerDown={handlePointerDown}
                    onDragOver={(e) => {
                      if (draggedAssignee) {
                        e.preventDefault();
                        setDropTargetId(entry.key);
                      }
                    }}
                    onDragLeave={() => {
                      if (draggedAssignee) {
                        setDropTargetId(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedAssignee && onAssigneeChange) {
                        onAssigneeChange(entry.key, draggedAssignee);
                      }
                      setDropTargetId(null);
                    }}
                  />
                );
              }}
            />
            {typeof todayX === 'number' ? (
              <>
                <ReferenceArea x1={todayX} x2={todayX + 1} fill="rgba(37, 99, 235, 0.08)" strokeOpacity={0} />
                <ReferenceLine x={todayX} stroke="#2563eb" strokeDasharray="3 3" strokeWidth={1.2} />
              </>
            ) : null}
            <Tooltip
              content={<GanttTooltip />}
              cursor={{ fill: 'rgba(148, 163, 184, 0.14)' }}
              wrapperClassName="!outline-none"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface InteractiveBarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number | [number, number, number, number];
  color: string;
  fillOpacity: number;
  entry: GanttDatum;
  interactive: boolean;
  onPointerDown: (entry: GanttDatum, kind: InteractionKind, event: React.PointerEvent<SVGRectElement>) => void;
  isActive: boolean;
  isDropTarget?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

function InteractiveBarShape(props: InteractiveBarShapeProps) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    color,
    fillOpacity,
    entry,
    interactive,
    onPointerDown,
    isActive,
    isDropTarget,
    onDragOver,
    onDragLeave,
    onDrop,
  } = props;
  const [isHovered, setIsHovered] = React.useState(false);
  const handleWidth = Math.min(14, Math.max(8, width / 4));
  const cornerRadius = 10;
  const handle = (kind: InteractionKind, rectX: number) => (
    <rect
      x={rectX}
      y={0}
      width={handleWidth}
      height={height}
      fill="transparent"
      style={{ cursor: interactive ? 'ew-resize' : 'default' }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!interactive) return;
        onPointerDown(entry, kind, event);
      }}
    />
  );

  return (
    <g transform={`translate(${x},${y})`}>
      {/* シャドウ効果 */}
      {(isHovered || isActive) && (
        <rect
          x={0}
          y={2}
          width={Math.max(width, 2)}
          height={height}
          rx={cornerRadius}
          ry={cornerRadius}
          fill="rgba(0, 0, 0, 0.15)"
          filter="blur(4px)"
          pointerEvents="none"
        />
      )}

      {/* メインバー */}
      <rect
        x={0}
        y={0}
        width={Math.max(width, 2)}
        height={height}
        rx={cornerRadius}
        ry={cornerRadius}
        fill={color}
        fillOpacity={isHovered && !isActive ? Math.min(1, fillOpacity + 0.15) : fillOpacity}
        stroke={isActive ? 'rgba(37, 99, 235, 0.8)' : isDropTarget ? 'rgba(16, 185, 129, 0.9)' : 'transparent'}
        strokeWidth={isActive || isDropTarget ? 3 : 0}
        style={{
          cursor: interactive ? (isActive ? 'grabbing' : 'grab') : 'default',
          transition: 'all 0.15s ease-out'
        }}
        onPointerDown={(event) => {
          if (!interactive) return;
          onPointerDown(entry, 'move', event);
        }}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      />

      {/* 進捗バー */}
      {typeof entry.progressRatio === 'number' && entry.progressRatio > 0 && entry.progressRatio < 1 && (
        <rect
          x={2}
          y={2}
          width={Math.max(0, (Math.max(width, 2) - 4) * entry.progressRatio)}
          height={height - 4}
          rx={cornerRadius - 2}
          ry={cornerRadius - 2}
          fill="rgba(255, 255, 255, 0.3)"
          pointerEvents="none"
        />
      )}
      {interactive && width > handleWidth * 2 ? (
        <>
          {handle('resize-start', 0)}
          {handle('resize-end', width - handleWidth)}
          {/* 左ハンドル */}
          <rect
            x={2}
            y={height / 2 - 8}
            width={handleWidth - 4}
            height={16}
            fill="rgba(255, 255, 255, 0.25)"
            pointerEvents="none"
            rx={4}
            ry={4}
          />
          {/* 右ハンドル */}
          <rect
            x={width - handleWidth + 2}
            y={height / 2 - 8}
            width={handleWidth - 4}
            height={16}
            fill="rgba(255, 255, 255, 0.25)"
            pointerEvents="none"
            rx={4}
            ry={4}
          />
        </>
      ) : null}
    </g>
  );
}
