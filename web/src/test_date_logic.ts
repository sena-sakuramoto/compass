
import { format } from 'date-fns';

const today = new Date();
console.log('Today (Local):', today.toString());
console.log('Today (ISO):', today.toISOString());
console.log('Today (format):', format(today, 'yyyy-MM-dd'));

// Simulate a task due today at 00:00 JST (which is previous day 15:00 UTC)
// 2025-11-24 00:00:00 JST = 2025-11-23 15:00:00 UTC
const dueToday = new Date('2025-11-24T00:00:00+09:00');
console.log('Due Today (Local):', dueToday.toString());
console.log('Due Today (format):', format(dueToday, 'yyyy-MM-dd'));

const todayStr = format(today, 'yyyy-MM-dd');
const dueTodayStr = format(dueToday, 'yyyy-MM-dd');

console.log(`'${dueTodayStr}' < '${todayStr}'`, dueTodayStr < todayStr);

// Simulate a task due yesterday
const dueYesterday = new Date('2025-11-23T00:00:00+09:00');
console.log('Due Yesterday (format):', format(dueYesterday, 'yyyy-MM-dd'));
const dueYesterdayStr = format(dueYesterday, 'yyyy-MM-dd');
console.log(`'${dueYesterdayStr}' < '${todayStr}'`, dueYesterdayStr < todayStr);
