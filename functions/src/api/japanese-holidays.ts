import { Router } from 'express';
import { authMiddleware } from '../lib/auth';
import { getJapaneseHolidays } from '../lib/japaneseHolidays';

const router = Router();

router.use(authMiddleware());

function filterHolidays(
  holidays: { date: string; name: string }[],
  options: { year?: string; from?: string; to?: string }
) {
  const { year, from, to } = options;
  return holidays.filter((holiday) => {
    if (year && !holiday.date.startsWith(`${year}-`)) {
      return false;
    }
    if (from && holiday.date < from) {
      return false;
    }
    if (to && holiday.date > to) {
      return false;
    }
    return true;
  });
}

router.get('/', async (req, res) => {
  try {
    const { holidays, sourceUpdatedAt } = await getJapaneseHolidays(false);
    const { year, from, to } = req.query;
    const filtered = filterHolidays(holidays, {
      year: typeof year === 'string' ? year : undefined,
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
    });
    res.json({ holidays: filtered, sourceUpdatedAt });
  } catch (error) {
    console.error('[Holidays API] Failed to list holidays:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:date', async (req, res) => {
  try {
    const { holidays, sourceUpdatedAt } = await getJapaneseHolidays(false);
    const target = req.params.date?.replace(/\./g, '-');
    const holiday = holidays.find((h) => h.date === target) || null;
    res.json({ holiday, sourceUpdatedAt });
  } catch (error) {
    console.error('[Holidays API] Failed to fetch holiday:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
