import { describe, expect, test } from 'vitest';
import { mergeSnapshots, toSnapshot, type Snapshot } from './sync';

const empty: Snapshot = { records: [], tombstones: [] };

describe('mergeSnapshots', () => {
  test('newer remote record replaces an older local record', () => {
    const local: Snapshot = {
      records: [{ date: '2026-10-20', weightGrams: 70000, updatedAt: 100 }],
      tombstones: [],
    };
    const remote: Snapshot = {
      records: [{ date: '2026-10-20', weightGrams: 71000, updatedAt: 200 }],
      tombstones: [],
    };
    const { snapshot, changed } = mergeSnapshots(local, remote, 0);
    expect(snapshot.records).toEqual([{ date: '2026-10-20', weightGrams: 71000, updatedAt: 200 }]);
    expect(changed).toBe(true);
  });

  test('newer local record survives an older remote copy', () => {
    const local: Snapshot = {
      records: [{ date: '2026-10-20', weightGrams: 72000, updatedAt: 300 }],
      tombstones: [],
    };
    const remote: Snapshot = {
      records: [{ date: '2026-10-20', weightGrams: 71000, updatedAt: 200 }],
      tombstones: [],
    };
    const { snapshot, changed } = mergeSnapshots(local, remote, 0);
    expect(snapshot.records).toEqual([{ date: '2026-10-20', weightGrams: 72000, updatedAt: 300 }]);
    expect(changed).toBe(false);
  });

  test('a delete wins against a record with the same timestamp', () => {
    const local: Snapshot = {
      records: [{ date: '2026-10-20', weightGrams: 70000, updatedAt: 500 }],
      tombstones: [],
    };
    const remote: Snapshot = { records: [], tombstones: [{ date: '2026-10-20', updatedAt: 500 }] };
    const { snapshot } = mergeSnapshots(local, remote, 0);
    expect(snapshot.records).toEqual([]);
    expect(snapshot.tombstones).toEqual([{ date: '2026-10-20', updatedAt: 500 }]);
  });

  test('a newer delete removes a local record; an older delete does not', () => {
    const local: Snapshot = {
      records: [{ date: '2026-10-20', weightGrams: 70000, updatedAt: 900 }],
      tombstones: [],
    };
    const newer: Snapshot = { records: [], tombstones: [{ date: '2026-10-20', updatedAt: 1000 }] };
    const older: Snapshot = { records: [], tombstones: [{ date: '2026-10-20', updatedAt: 800 }] };
    expect(mergeSnapshots(local, newer, 0).snapshot.records).toEqual([]);
    expect(mergeSnapshots(local, older, 0).snapshot.records).toHaveLength(1);
  });

  test('resetAt drops entries at or before it, but 0 drops nothing', () => {
    const local: Snapshot = {
      records: [
        { date: '2026-10-20', weightGrams: 70000, updatedAt: 400 },
        { date: '2026-10-21', weightGrams: 71000, updatedAt: 600 },
      ],
      tombstones: [{ date: '2026-10-19', updatedAt: 300 }],
    };
    expect(mergeSnapshots(local, empty, 0).snapshot.records).toHaveLength(2);
    const afterReset = mergeSnapshots(local, empty, 500).snapshot;
    expect(afterReset.records).toEqual([{ date: '2026-10-21', weightGrams: 71000, updatedAt: 600 }]);
    expect(afterReset.tombstones).toEqual([]);
  });

  test('union is sorted and a date appears in only one list', () => {
    const local: Snapshot = {
      records: [
        { date: '2026-10-22', weightGrams: 72000, updatedAt: 10 },
        { date: '2026-10-20', weightGrams: 70000, updatedAt: 10 },
      ],
      tombstones: [],
    };
    const remote: Snapshot = {
      records: [{ date: '2026-10-21', weightGrams: 71000, updatedAt: 10 }],
      tombstones: [{ date: '2026-10-22', updatedAt: 20 }],
    };
    const { snapshot } = mergeSnapshots(local, remote, 0);
    expect(snapshot.records.map((r) => r.date)).toEqual(['2026-10-20', '2026-10-21']);
    expect(snapshot.tombstones.map((t) => t.date)).toEqual(['2026-10-22']);
  });

  test('legacy local records without updatedAt are treated as 0', () => {
    const snapshot = toSnapshot({ records: [{ id: 'a', date: '2026-10-20', weightGrams: 70000 }], tombstones: [] });
    expect(snapshot.records[0].updatedAt).toBe(0);
  });
});
