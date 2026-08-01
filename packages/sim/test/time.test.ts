import { describe, expect, it } from 'vitest';
import { MS_PER_DAY, utcDayKey, utcDayNumber } from '../src/time.js';

describe('utcDayKey', () => {
  it('agrees with the platform Date across a long span', () => {
    // The sim may not call `new Date()`, but a test may — and this is exactly the
    // property worth pinning: our arithmetic must match the calendar everyone else uses.
    for (let day = -20000; day < 30000; day += 7) {
      const ms = day * MS_PER_DAY;
      expect(utcDayKey(ms)).toBe(new Date(ms).toISOString().slice(0, 10));
    }
  });

  it('handles leap days and century rules', () => {
    expect(utcDayKey(Date.UTC(2024, 1, 29))).toBe('2024-02-29');
    expect(utcDayKey(Date.UTC(2000, 1, 29))).toBe('2000-02-29');
    expect(utcDayKey(Date.UTC(1900, 2, 1))).toBe('1900-03-01');
  });

  it('is stable within a day and rolls at midnight UTC', () => {
    const midnight = Date.UTC(2026, 7, 1);
    expect(utcDayKey(midnight)).toBe('2026-08-01');
    expect(utcDayKey(midnight + MS_PER_DAY - 1)).toBe('2026-08-01');
    expect(utcDayKey(midnight + MS_PER_DAY)).toBe('2026-08-02');
  });

  it('counts whole days from the epoch', () => {
    expect(utcDayNumber(0)).toBe(0);
    expect(utcDayNumber(MS_PER_DAY - 1)).toBe(0);
    expect(utcDayNumber(MS_PER_DAY)).toBe(1);
  });
});
