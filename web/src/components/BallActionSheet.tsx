import React, { useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, CornerDownLeft, Send, UserRound, X } from 'lucide-react';

type BallActionKind = 'throw' | 'pull';

interface BallActionSheetProps {
  open: boolean;
  action: BallActionKind;
  committed: boolean;
  projectName: string;
  taskName: string;
  counterpartLabel: string;
  initialNote?: string | null;
  initialFollowUpOn?: string | null;
  recipientValue?: string;
  recipientEditable?: boolean;
  recipientOptions?: string[];
  onRecipientChange?(value: string): void;
  onOpenChange(open: boolean): void;
  onSave(values: { note: string; followUpOn: string | null; recipient: string }): void | Promise<void>;
}

const notePresets: Record<BallActionKind, string[]> = {
  throw: ['確認お願いします', '承認ください', '差し替え済みです', '金額確認お願いします'],
  pull: ['自分で確認します', '条件を見直します', 'いったん引き取ります', '差し戻し対応します'],
};

function offsetDateLabel(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function BallActionSheet({
  open,
  action,
  committed,
  projectName,
  taskName,
  counterpartLabel,
  initialNote,
  initialFollowUpOn,
  recipientValue = '',
  recipientEditable = false,
  recipientOptions = [],
  onRecipientChange,
  onOpenChange,
  onSave,
}: BallActionSheetProps) {
  const [note, setNote] = useState('');
  const [followUpOn, setFollowUpOn] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const recipientListId = useId();

  useEffect(() => {
    if (!open) return;
    setNote((initialNote ?? '').trim());
    setFollowUpOn(initialFollowUpOn ?? null);
    setSaving(false);
  }, [initialFollowUpOn, initialNote, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open, saving]);

  const followUpChoices = useMemo(
    () => [
      { label: '明日', value: offsetDateLabel(1) },
      { label: '3日後', value: offsetDateLabel(3) },
      { label: '来週', value: offsetDateLabel(7) },
    ],
    []
  );

  const title = action === 'throw'
    ? committed
      ? '渡したあとに一言'
      : '渡し先を入れて渡す'
    : '引き取ったあとに一言';
  const subtitle = action === 'throw'
    ? committed
      ? `${counterpartLabel} に渡しました。必要なら催促日を残せます。`
      : '返し先が未設定です。必要なら相手を入れて、そのまま渡せます。'
    : `${counterpartLabel} から引き取りました。必要なら一言だけ残せます。`;
  const accentIcon = action === 'throw'
    ? <Send className="h-4 w-4" />
    : <CornerDownLeft className="h-4 w-4" />;
  const canSave = !saving && (!recipientEditable || recipientValue.trim().length > 0);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0, y: -8 }}
          animate={{ height: 'auto', opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white">
                  {accentIcon}
                  {action === 'throw'
                    ? committed
                      ? '渡しました'
                      : '渡し先を入れる'
                    : '引き取りました'}
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
                <p className="mt-2 truncate text-[11px] text-slate-400">
                  {projectName} / {taskName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !saving && onOpenChange(false)}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-600"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {action === 'throw' && recipientEditable ? (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <UserRound className="h-3.5 w-3.5" />
                    渡し先
                  </label>
                  <input
                    type="text"
                    list={recipientListId}
                    value={recipientValue}
                    onChange={(event) => onRecipientChange?.(event.target.value)}
                    placeholder="相手名を入れる"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
                  />
                  {recipientOptions.length > 0 ? (
                    <datalist id={recipientListId}>
                      {recipientOptions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold text-slate-500">一言</label>
                <input
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={action === 'throw' ? '確認お願いします' : '引き取り理由を一言'}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {notePresets[action].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNote(preset)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        note === preset
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {action === 'throw' ? (
                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <CalendarClock className="h-3.5 w-3.5" />
                    催促日
                  </div>
                  <input
                    type="date"
                    value={followUpOn ?? ''}
                    onChange={(event) => setFollowUpOn(event.target.value || null)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {followUpChoices.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => setFollowUpOn(choice.value)}
                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                          followUpOn === choice.value
                            ? 'border-amber-300 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {choice.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFollowUpOn(null)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 transition hover:bg-slate-100"
                    >
                      なし
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-white disabled:opacity-50"
              >
                閉じる
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!canSave) return;
                  setSaving(true);
                  try {
                    await onSave({
                      note,
                      followUpOn: action === 'throw' ? followUpOn : null,
                      recipient: recipientValue.trim(),
                    });
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                disabled={!canSave}
              >
                {saving ? '保存中...' : committed || action === 'pull' ? '保存' : '渡す'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
