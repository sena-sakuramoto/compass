import { describe, it, expect } from 'vitest';
import {
  computeTimelinePlacements,
  computeFreeSlots,
  suggestChips,
} from '../timeline';

describe('computeTimelinePlacements', () => {
  const DAY_START = 8 * 60;
  const DAY_END = 20 * 60;
  const GAP = 20;

  it('places a task with startTime at its specified time', () => {
    const tasks = [
      { id: '1', name: 'Meeting', startTime: '10:00', estimateMinutes: 60 },
    ];
    const result = computeTimelinePlacements(tasks, DAY_START, DAY_END, GAP);
    expect(result[0].startMinutes).toBe(600);
    expect(result[0].endMinutes).toBe(660);
  });

  it('auto-places tasks without startTime sequentially from day start', () => {
    const tasks = [
      { id: '1', name: 'Task A', startTime: null, estimateMinutes: 60 },
      { id: '2', name: 'Task B', startTime: null, estimateMinutes: 30 },
    ];
    const result = computeTimelinePlacements(tasks, DAY_START, DAY_END, GAP);
    expect(result[0].startMinutes).toBe(DAY_START);
    expect(result[0].endMinutes).toBe(DAY_START + 60);
    expect(result[1].startMinutes).toBe(DAY_START + 60 + GAP);
  });

  it('auto-placed tasks avoid fixed-time tasks', () => {
    const tasks = [
      { id: '1', name: 'Fixed', startTime: '08:00', estimateMinutes: 60 },
      { id: '2', name: 'Auto', startTime: null, estimateMinutes: 30 },
    ];
    const result = computeTimelinePlacements(tasks, DAY_START, DAY_END, GAP);
    const auto = result.find(r => r.id === '2')!;
    expect(auto.startMinutes).toBe(DAY_START + 60 + GAP);
  });

  it('uses default 30min for tasks without estimate', () => {
    const tasks = [
      { id: '1', name: 'No estimate', startTime: null, estimateMinutes: null },
    ];
    const result = computeTimelinePlacements(tasks, DAY_START, DAY_END, GAP);
    expect(result[0].endMinutes - result[0].startMinutes).toBe(30);
  });
});

describe('computeFreeSlots', () => {
  const DAY_START = 8 * 60;
  const DAY_END = 20 * 60;

  it('returns full day as free when no tasks', () => {
    const result = computeFreeSlots([], DAY_START, DAY_END);
    expect(result).toEqual([{ startMinutes: DAY_START, endMinutes: DAY_END, durationMinutes: 720 }]);
  });

  it('returns gaps between tasks', () => {
    const placements = [
      { id: '1', startMinutes: 480, endMinutes: 540 },
      { id: '2', startMinutes: 660, endMinutes: 720 },
    ];
    const result = computeFreeSlots(placements, DAY_START, DAY_END);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ startMinutes: 540, endMinutes: 660, durationMinutes: 120 });
    expect(result[1]).toEqual({ startMinutes: 720, endMinutes: DAY_END, durationMinutes: 480 });
  });
});

describe('suggestChips', () => {
  it('returns items that fit in the free slot, sorted by deadline', () => {
    const trayItems = [
      { id: 'a', name: 'Big', estimateMinutes: 240, deadline: '2026-03-20' },
      { id: 'b', name: 'Small', estimateMinutes: 30, deadline: '2026-03-19' },
      { id: 'c', name: 'Medium', estimateMinutes: 60, deadline: '2026-03-18' },
    ];
    const result = suggestChips(trayItems, 120);
    expect(result.map(r => r.id)).toEqual(['c', 'b']);
  });

  it('returns max 3 chips', () => {
    const trayItems = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`, name: `Task ${i}`, estimateMinutes: 15, deadline: '2026-03-20',
    }));
    const result = suggestChips(trayItems, 120);
    expect(result).toHaveLength(3);
  });
});
