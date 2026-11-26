import { describe, expect, test } from 'vitest';
import { HttpError } from './http';
import { parseSnapshot } from './sync';

const now = 1_800_000_000_000;

describe('parseSnapshot', () => {
  test('keeps valid records and tombstones', () => {
    const parsed = parseSnapshot(
      {
        records: [{ date: '2026-10-20', weightGrams: 70000, updatedAt: 100 }],
        tombstones: [{ date: '2026-10-19', updatedAt: 50 }],
      },
      now,
    );
    expect(parsed.records).toEqual([{ date: '2026-10-20', weightGrams: 70000, updatedAt: 100 }]);
    expect(parsed.tombstones).toEqual([{ date: '2026-10-19', updatedAt: 50 }]);
  });

  test('drops invalid entries individually', () => {
    const parsed = parseSnapshot(
      {
        records: [
          { date: '2026-13-01', weightGrams: 70000, updatedAt: 1 },
          { date: '2026-10-20', weightGrams: 0, updatedAt: 1 },
          { date: '2026-10-20', weightGrams: 70000.5, updatedAt: 1 },
          { date: '2026-10-20', weightGrams: 70000, updatedAt: -1 },
          { date: '2026-10-21', weightGrams: 71000, updatedAt: 2 },
        ],
        tombstones: 'nope',
      },
      now,
    );
    expect(parsed.records.map((r) => r.date)).toEqual(['2026-10-21']);
    expect(parsed.tombstones).toEqual([]);
  });

  test('clamps a future timestamp to now + 5 minutes', () => {
    const parsed = parseSnapshot({ records: [{ date: '2026-10-20', weightGrams: 70000, updatedAt: now + 60 * 60 * 1000 }] }, now);
    expect(parsed.records[0].updatedAt).toBe(now + 5 * 60 * 1000);
  });

  test('rejects a non-object body with 400 and an oversized body with 413', () => {
    expect(() => parseSnapshot(null, now)).toThrow(HttpError);
    const tooMany = { records: Array.from({ length: 10001 }, (_, i) => ({ date: '2026-10-20', weightGrams: 70000, updatedAt: i })) };
    expect(() => parseSnapshot(tooMany, now)).toThrow(HttpError);
    try {
      parseSnapshot(tooMany, now);
    } catch (e) {
      expect((e as HttpError).status).toBe(413);
    }
  });
});
