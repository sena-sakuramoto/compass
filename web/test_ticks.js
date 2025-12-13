
const { format, addDays, startOfDay, endOfDay, isWeekend } = require('date-fns');
const { ja } = require('date-fns/locale');

function calculateDateTicks(startDate, endDate, viewMode) {
  const ticks = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const date = new Date(current);
    const isWk = isWeekend(date);

    let label = '';
    if (viewMode === 'day') {
      label = format(date, 'M/d', { locale: ja });
    } else if (viewMode === 'week') {
      label = format(date, 'M/d', { locale: ja });
    } else {
      label = format(date, 'M月', { locale: ja });
    }

    ticks.push({ date, label, isWeekend: isWk });

    // 次の日付へ
    if (viewMode === 'day') {
      current.setDate(current.getDate() + 1);
    } else if (viewMode === 'week') {
      current.setDate(current.getDate() + 7);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }

  return ticks;
}

const start = new Date('2025-11-20T00:00:00');
const end = new Date('2025-11-30T00:00:00');
const ticks = calculateDateTicks(start, end, 'day');

console.log(ticks.map(t => `${format(t.date, 'yyyy-MM-dd')} ${t.label} ${t.isWeekend ? 'WE' : ''}`).join('\n'));
