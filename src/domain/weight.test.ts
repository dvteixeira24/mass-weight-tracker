import { describe, expect, test } from 'vitest';
import {
  KG_PER_LB,
  gramsToDisplay,
  displayToGrams,
  formatSigned,
  isValidDateString,
  todayLocal,
  addLocalDays,
  diffLocalCalendarDays,
  filterByPeriod,
  periodStats,
  toCsv,
  type PeriodKey,
} from '../domain/weight';

describe('kg<->lb / integer grams', () => {
  test('1 kg = 1000 g; 1 lb converts and round-trips to integer grams', () => {
    expect(displayToGrams(1, 'kg')).toBe(1000);
    const g = displayToGrams(150, 'lb');
    expect(Number.isInteger(g)).toBe(true);
    expect(g).toBe(Math.round(150 * KG_PER_LB * 1000));
    expect(gramsToDisplay(1000, 'kg')).toBeCloseTo(1, 10);
    expect(gramsToDisplay(g, 'lb')).toBeCloseTo(150, 1);
  });
  test('rejects non-finite / non-positive', () => {
    expect(() => displayToGrams(0, 'kg')).toThrow();
    expect(() => displayToGrams(-5, 'kg')).toThrow();
    expect(() => displayToGrams(NaN, 'kg')).toThrow();
    expect(() => displayToGrams(Infinity, 'lb')).toThrow();
  });
});

describe('date-only across UTC/DST (no day shift)', () => {
  test('round-trip formatting keeps calendar day', () => {
    expect(isValidDateString('2026-03-29')).toBe(true);
    expect(isValidDateString('2026-10-25')).toBe(true);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(diffLocalCalendarDays('2026-03-28', '2026-03-30')).toBe(2); // DST weekend Europe
    expect(diffLocalCalendarDays('2026-10-24', '2026-10-26')).toBe(2);
  });
  test('addLocalDays inverts diff', () => {
    expect(addLocalDays('2026-10-28', -6)).toBe('2026-10-22');
    expect(diffLocalCalendarDays(addLocalDays('2026-10-28', -29), '2026-10-28')).toBe(29);
  });
  test('todayLocal matches local components', () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(todayLocal()).toBe(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  });
});

describe('period boundaries', () => {
  const today = '2026-10-28';
  const rec = (date: string, weightGrams = 70000) => ({ id: date, date, weightGrams });
  const cases: Array<[PeriodKey, string, boolean]> = [
    ['7D', addLocalDays(today, -6), true],
    ['7D', addLocalDays(today, -7), false],
    ['30D', addLocalDays(today, -29), true],
    ['30D', addLocalDays(today, -30), false],
    ['3M', addLocalDays(today, -89), true],
    ['3M', addLocalDays(today, -90), false],
    ['6M', addLocalDays(today, -179), true],
    ['6M', addLocalDays(today, -180), false],
    ['1Y', addLocalDays(today, -364), true],
    ['1Y', addLocalDays(today, -365), false],
  ];
  for (const [period, date, inside] of cases) {
    test(`${period} ${date} is ${inside ? 'in' : 'out'}`, () => {
      const out = filterByPeriod([rec(date)], period, today);
      expect(out.length).toBe(inside ? 1 : 0);
    });
  }
  test('future entries excluded; All includes everything sorted', () => {
    const rows = [rec('2026-10-29'), rec('2026-10-20'), rec('2026-10-28')];
    expect(filterByPeriod(rows, '7D', today).map((r) => r.date)).toEqual(['2026-10-28']);
    expect(filterByPeriod(rows, 'All', today).map((r) => r.date)).toEqual([
      '2026-10-20',
      '2026-10-28',
      '2026-10-29',
    ]);
  });
});

describe('sparse logs use (last-first)/elapsed*7', () => {
  test('two points 14 days apart', () => {
    const stats = periodStats(
      [
        { id: 'a', date: '2026-10-01', weightGrams: 70000 },
        { id: 'b', date: '2026-10-15', weightGrams: 71400 },
      ],
      'kg',
    );
    expect(stats).not.toBeNull();
    expect(stats!.totalChange).toBeCloseTo(1.4, 10);
    expect(stats!.elapsedDays).toBe(14);
    expect(stats!.perWeek).toBeCloseTo(0.7, 10);
  });
  test('0/1/equal/positive/negative', () => {
    expect(periodStats([], 'kg')).toBeNull();
    expect(periodStats([{ id: 'a', date: '2026-10-01', weightGrams: 70000 }], 'kg')).toBeNull();
    const sameDay = periodStats(
      [
        { id: 'a', date: '2026-10-01', weightGrams: 70000 },
        { id: 'b', date: '2026-10-01', weightGrams: 71000 },
      ],
      'kg',
    );
    expect(sameDay).toBeNull(); // distinct dates required
    const neg = periodStats(
      [
        { id: 'a', date: '2026-10-01', weightGrams: 72000 },
        { id: 'b', date: '2026-10-08', weightGrams: 71000 },
      ],
      'kg',
    );
    expect(neg!.totalChange).toBeCloseTo(-1, 10);
    expect(neg!.perWeek).toBeCloseTo(-1, 10);
    const eq = periodStats(
      [
        { id: 'a', date: '2026-10-01', weightGrams: 70000 },
        { id: 'b', date: '2026-10-08', weightGrams: 70000 },
      ],
      'kg',
    );
    expect(eq!.totalChange).toBe(0);
    expect(eq!.perWeek).toBe(0);
  });
  test('lb conversion applied to deltas', () => {
    const stats = periodStats(
      [
        { id: 'a', date: '2026-10-01', weightGrams: 70000 },
        { id: 'b', date: '2026-10-08', weightGrams: 71000 },
      ],
      'lb',
    );
    expect(stats!.totalChange).toBeCloseTo(1 / KG_PER_LB, 6);
  });
});

describe('formatting + csv', () => {
  test('signed display: +/− prefix, units, em-dash never +0.0', () => {
    expect(formatSigned(1.25, 'kg')).toBe('+1.3 kg');
    expect(formatSigned(-1.25, 'kg')).toBe('−1.3 kg');
    expect(formatSigned(0, 'kg')).toBe('0.0 kg');
    expect(formatSigned(0.001, 'kg')).toBe('0.0 kg');
  });
  test('csv ordered with ISO date + kg/lb', () => {
    const csv = toCsv(
      [
        { id: 'b', date: '2026-10-15', weightGrams: 71400 },
        { id: 'a', date: '2026-10-01', weightGrams: 70000 },
      ],
      'kg',
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('date,weight_kg,weight_lb');
    expect(lines[1]).toMatch(/^2026-10-01,70\.0,/);
    expect(lines[2]).toMatch(/^2026-10-15,71\.4,/);
  });
});
