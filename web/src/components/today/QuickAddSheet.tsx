import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface QuickAddSheetProps {
  onAdd: (title: string, estimateMinutes: number | null, scheduled: boolean) => void;
}

const DURATION_OPTIONS = [
  { label: '15分', value: 15 },
  { label: '30分', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
  { label: '4h', value: 240 },
];

export function QuickAddSheet({ onAdd }: QuickAddSheetProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSubmit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed, estimate, false);
    setTitle('');
    setEstimate(null);
    // Keep sheet open for consecutive adds
  }, [title, estimate, onAdd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setTitle('');
    setEstimate(null);
  }, []);

  return (
    <>
      {/* FAB */}
      <button
        className="fixed w-14 h-14 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform md:hidden"
        style={{ bottom: 124, right: 20, zIndex: 20 }}
        onClick={() => setOpen(true)}
        aria-label="追加"
      >
        <Plus size={24} />
      </button>

      {/* Overlay + Sheet */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/20 md:hidden"
            style={{ zIndex: 50 }}
            onClick={handleClose}
          />
          <div
            className="fixed left-0 right-0 bottom-0 bg-white rounded-t-2xl px-5 pt-4 pb-8 md:hidden"
            style={{ zIndex: 50 }}
          >
            <div className="flex items-center justify-between mb-4">
              <button onClick={handleClose} className="p-1">
                <X size={20} className="text-gray-400" />
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-full disabled:opacity-30"
                disabled={!title.trim()}
              >
                保存
              </button>
            </div>

            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="タスク名を入力"
              className="w-full text-lg font-semibold text-gray-900 placeholder-gray-300 outline-none mb-4"
            />

            <div className="mb-2">
              <span className="text-xs text-gray-400 mb-2 block">所要時間</span>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      estimate === opt.value
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                    onClick={() => setEstimate(estimate === opt.value ? null : opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
