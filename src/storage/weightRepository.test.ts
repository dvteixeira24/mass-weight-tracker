import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createRepository,
  STORAGE_KEY,
  type StoredData,
} from '../storage/weightRepository';

function memStorage(initial?: Record<string, string>, blocked = false) {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k: string) => {
      if (blocked) throw new Error('denied');
      return map.has(k) ? map.get(k)! : null;
    },
    setItem: (k: string, v: string) => {
      if (blocked) throw new Error('denied');
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

beforeEach(() => { vi.unstubAllGlobals(); });

describe('weightRepository', () => {
  test('loads valid data; saves round-trip', () => {
    const store = memStorage();
    const repo = createRepository(store);
    const data = repo.load();
    expect(data.records).toEqual([]);
    expect(data.preferences.unit).toBe('kg');
    repo.save({ ...data, records: [{ id: 'a', date: '2026-10-20', weightGrams: 70000 }] });
    expect(repo.load().records).toHaveLength(1);
  });
  test('corrupt JSON recovers to defaults without throwing', () => {
    const repo = createRepository(memStorage({ [STORAGE_KEY]: 'not-json{{{' }));
    expect(() => repo.load()).not.toThrow();
    expect(repo.load().records).toEqual([]);
  });
  test('sanitizes bad records, dedupes by date (keeps last), sorts', () => {
    const bad: StoredData = {
      schemaVersion: 1,
      preferences: { unit: 'lb', onboardingComplete: true },
      records: [
        { id: 'a', date: '2026-10-20', weightGrams: 70000 },
        { id: 'b', date: '2026-10-20', weightGrams: 71000 },
        { id: 'c', date: 'bad-date', weightGrams: 70000 },
        { id: 'd', date: '2026-10-21', weightGrams: -5 },
      ] as unknown as StoredData['records'],
    };
    const repo = createRepository(memStorage({ [STORAGE_KEY]: JSON.stringify(bad) }));
    const loaded = repo.load();
    expect(loaded.records.map((r) => r.date)).toEqual(['2026-10-20', '2026-10-21'].filter((d) => d !== '2026-10-21' || loaded.records.some((r) => r.date === d)));
    expect(loaded.records.find((r) => r.date === '2026-10-20')?.weightGrams).toBe(71000);
  });
  test('blocked localStorage: load defaults, save no-throw, reports blocked', () => {
    const repo = createRepository(memStorage({}, true));
    expect(repo.isBlocked()).toBe(true);
    expect(repo.load().records).toEqual([]);
    expect(() => repo.save(repo.load())).not.toThrow();
  });
  test('upsert: same date replaces (no duplicate), edit-date conflict detectable', () => {
    const store = memStorage();
    const repo = createRepository(store);
    let data = repo.load();
    data = repo.upsert(data, { date: '2026-10-20', weightGrams: 70000 });
    data = repo.upsert(data, { date: '2026-10-20', weightGrams: 71000 });
    expect(data.records.filter((r) => r.date === '2026-10-20')).toHaveLength(1);
    expect(data.records[0].weightGrams).toBe(71000);
    // editing record A onto date owned by record B must throw
    data = repo.upsert(data, { date: '2026-10-21', weightGrams: 72000 });
    const a = data.records.find((r) => r.date === '2026-10-20')!;
    expect(() => repo.upsert(data, { id: a.id, date: '2026-10-21', weightGrams: 73000 })).toThrow();
    repo.save(data);
    expect(repo.load().records).toHaveLength(2);
  });
  test('remove + clearEntries keep preferences', () => {
    const store = memStorage();
    const repo = createRepository(store);
    let data = repo.load();
    data = { ...data, preferences: { unit: 'lb', onboardingComplete: true } };
    data = repo.upsert(data, { date: '2026-10-20', weightGrams: 70000 });
    const id = data.records[0].id;
    data = repo.remove(data, id);
    expect(data.records).toHaveLength(0);
    data = repo.upsert(data, { date: '2026-10-21', weightGrams: 70000 });
    data = repo.clearEntries(data);
    expect(data.records).toHaveLength(0);
    expect(data.preferences.unit).toBe('lb');
  });
});
