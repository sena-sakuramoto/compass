import { ChevronDown, X } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';

interface Option {
  label: string;
  value: string;
}

interface MultiSelectProps {
  options: Option[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder = '選択してください',
  allLabel = 'すべて',
  className = '',
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // クリックアウトサイドでドロップダウンを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleToggle = (value: string) => {
    if (value === 'all') {
      // 「すべて」を選択した場合は空配列にする
      onChange([]);
    } else {
      if (selectedValues.includes(value)) {
        // 既に選択されている場合は除外
        onChange(selectedValues.filter((v) => v !== value));
      } else {
        // 新しく追加
        onChange([...selectedValues, value]);
      }
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
    setIsOpen(false);
  };

  const isAllSelected = selectedValues.length === 0;

  // 表示用ラベルを作成
  const displayLabel = isAllSelected
    ? allLabel
    : selectedValues.length === 1
    ? options.find((opt) => opt.value === selectedValues[0])?.label || placeholder
    : `${selectedValues.length}件選択中`;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
      >
        <span className={isAllSelected ? 'text-slate-900' : 'font-medium text-slate-900'}>
          {displayLabel}
        </span>
        <div className="flex items-center gap-1">
          {!isAllSelected && (
            <X
              size={16}
              className="text-slate-400 hover:text-slate-600"
              onClick={handleClear}
            />
          )}
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {/* 「すべて」オプション */}
          <label
            className={`flex cursor-pointer items-center gap-2 px-3 py-2 transition hover:bg-slate-50 ${
              isAllSelected ? 'bg-slate-100' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={() => handleToggle('all')}
              className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-2 focus:ring-slate-800"
            />
            <span className={`text-sm ${isAllSelected ? 'font-medium' : ''}`}>{allLabel}</span>
          </label>

          <div className="border-t border-slate-100"></div>

          {/* 個別オプション */}
          {options
            .filter((opt) => opt.value !== 'all')
            .map((option) => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 transition hover:bg-slate-50 ${
                    isSelected ? 'bg-slate-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(option.value)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-2 focus:ring-slate-800"
                  />
                  <span className={`text-sm ${isSelected ? 'font-medium' : ''}`}>
                    {option.label}
                  </span>
                </label>
              );
            })}
        </div>
      )}
    </div>
  );
}
