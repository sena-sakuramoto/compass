interface SummaryCardProps {
  title: string;
  value: string;
  note?: string;
  delta: number | null;
  accent?: 'highlight';
}

export function SummaryCard({ title, value, note, delta, accent }: SummaryCardProps) {
  const deltaLabel =
    delta == null
      ? null
      : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
  const deltaTone =
    delta == null ? '' : delta >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';

  return (
    <div
      className={`flex flex-col rounded-2xl border p-4 ${
        accent === 'highlight'
          ? 'border-amber-200 bg-amber-50/70'
          : 'border-slate-100 bg-slate-50/70'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-2 flex items-center gap-2">
        {deltaLabel && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${deltaTone}`}>{deltaLabel}</span>
        )}
        {note && <span className="text-xs text-slate-500">{note}</span>}
      </div>
    </div>
  );
}
