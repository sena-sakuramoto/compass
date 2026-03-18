import React, { useMemo } from 'react';
import { startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DateHeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_MS = 86400000;

export function DateHeader({ selectedDate, onDateChange }: DateHeaderProps) {
  const today = useMemo(() => new Date(), []);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [selectedDate]);

  const goToday = () => onDateChange(new Date());
  const goPrev = () => onDateChange(new Date(selectedDate.getTime() - DAY_MS));
  const goNext = () => onDateChange(new Date(selectedDate.getTime() + DAY_MS));

  const day = selectedDate.getDate();
  const monthYear = format(selectedDate, 'M月 yyyy', { locale: ja });
  const isToday = isSameDay(selectedDate, today);

  return (
    <div className="px-5 pt-4 pb-2">
      {/* Date + Navigation */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-[44px] font-bold leading-none tracking-tight text-gray-900">
            {day}
          </span>
          <span className="block text-sm text-gray-400 mt-0.5">{monthYear}</span>
        </div>
        <div className="flex items-center gap-1 mt-2">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-full hover:bg-gray-100 active:bg-gray-200"
            aria-label="前日"
          >
            <ChevronLeft size={18} className="text-gray-500" />
          </button>
          <button
            onClick={goToday}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              isToday
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            今日
          </button>
          <button
            onClick={goNext}
            className="p-1.5 rounded-full hover:bg-gray-100 active:bg-gray-200"
            aria-label="翌日"
          >
            <ChevronRight size={18} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Week row */}
      <div className="flex justify-between">
        {weekDays.map((d, i) => {
          const isSelected = isSameDay(d, selectedDate);
          return (
            <button
              key={i}
              className="flex flex-col items-center gap-1 w-10"
              onClick={() => onDateChange(d)}
            >
              <span className="text-[10px] text-gray-400">{DAY_LABELS[i]}</span>
              <span
                className={`text-sm w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                  isSelected
                    ? 'bg-gray-900 text-white font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
