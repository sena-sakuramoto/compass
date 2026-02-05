import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  ComposedChart,
  Area,
  Line,
} from 'recharts';
import { formatHours, formatCurrency } from '../../lib/formatting';

interface WorkloadChartProps {
  data: { assignee: string; est: number; count: number }[];
}

export function WorkloadChart({ data }: WorkloadChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: 8, right: 16, top: 16, bottom: 16 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="assignee" tick={{ fontSize: 12 }} />
        <YAxis />
        <Tooltip
          formatter={(value: number, _name, props) => [
            `${Math.round(value)} h`,
            `${props?.payload?.count ?? 0} 件のタスク`,
          ]}
        />
        <Bar dataKey="est" radius={[6, 6, 0, 0]} fill="#0f172a" />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface WorkloadTimelineChartProps {
  data: { label: string; hours: number; revenue: number }[];
}

export function WorkloadTimelineChart({ data }: WorkloadTimelineChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ left: 8, right: 16, top: 16, bottom: 16 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={40} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          width={60}
          tickFormatter={(value) => `¥${Math.round((value as number) / 1000)}k`}
        />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === 'hours' ? [`${formatHours(value)} h`, '稼働'] : [formatCurrency(value), '稼ぎ']
          }
        />
        <Area
          yAxisId="left"
          dataKey="hours"
          type="monotone"
          stroke="#2563eb"
          fill="#93c5fd"
          fillOpacity={0.4}
        />
        <Line yAxisId="right" dataKey="revenue" type="monotone" stroke="#f97316" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
