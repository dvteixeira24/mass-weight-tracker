// Versioned localStorage adapter: validate / sanitize / migrate. Never throws on blocked storage.
// The key stays v1 on purpose so existing local data is upgraded in place, not orphaned.
import { isValidDateString, newId, type WeightRecord, type WeightUnit } from '../domain/weight';
import type { Tombstone } from '../domain/sync';

export const STORAGE_KEY = 'mass-weight-tracker-v1';

export interface UserPreferences {
  unit: WeightUnit;
  onboardingComplete: boolean;
}

export interface StoredData {
  schemaVersion: 2;
  preferences: UserPreferences;
  records: WeightRecord[];
  tombstones: Tombstone[];
  resetAt: number;
}

export interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultData(): StoredData {
  return {
    schemaVersion: 2,
    preferences: { unit: 'kg', onboardingComplete: false },
    records: [],
    tombstones: [],
    resetAt: 0,
  };
}

function validTime(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isInteger(input) && input >= 0 ? input : undefined;
}

function sanitizeRecords(input: unknown): WeightRecord[] {
  if (!Array.isArray(input)) return [];
  const byDate = new Map<string, WeightRecord>();
  for (const r of input) {
    if (typeof r !== 'object' || r === null) continue;
    const rec = r as Partial<WeightRecord>;
    if (typeof rec.id !== 'string' || !rec.id) continue;
    if (typeof rec.date !== 'string' || !isValidDateString(rec.date)) continue;
    if (typeof rec.weightGrams !== 'number' || !Number.isInteger(rec.weightGrams) || rec.weightGrams <= 0 || rec.weightGrams > 1500000) continue;
    const updatedAt = validTime(rec.updatedAt);
    byDate.set(rec.date, { id: rec.id, date: rec.date, weightGrams: rec.weightGrams, ...(updatedAt === undefined ? {} : { updatedAt }) }); // last wins
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function sanitizeTombstones(input: unknown): Tombstone[] {
  if (!Array.isArray(input)) return [];
  const byDate = new Map<string, Tombstone>();
  for (const t of input) {
    if (typeof t !== 'object' || t === null) continue;
    const tomb = t as Partial<Tombstone>;
    if (typeof tomb.date !== 'string' || !isValidDateString(tomb.date)) continue;
    const updatedAt = validTime(tomb.updatedAt);
    if (updatedAt === undefined) continue;
    byDate.set(tomb.date, { date: tomb.date, updatedAt });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function sanitizePreferences(input: unknown): UserPreferences {
  const p = (input ?? {}) as Partial<UserPreferences>;
  return {
    unit: p.unit === 'lb' ? 'lb' : 'kg',
    onboardingComplete: p.onboardingComplete === true,
  };
}

export interface WeightRepository {
  load(): StoredData;
  save(data: StoredData): void;
  isBlocked(): boolean;
  upsert(data: StoredData, entry: { id?: string; date: string; weightGrams: number }): StoredData;
  remove(data: StoredData, id: string): StoredData;
  clearEntries(data: StoredData): StoredData;
}

export function createRepository(storage?: MinimalStorage | null): WeightRepository {
  const store: MinimalStorage | null = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  let blocked = false;
  try {
    store?.getItem('__probe__');
  } catch {
    blocked = true;
  }

  function load(): StoredData {
    const fallback = defaultData();
    if (!store || blocked) return fallback;
    let raw: string | null = null;
    try {
      raw = store.getItem(STORAGE_KEY);
    } catch {
      blocked = true;
      return fallback;
    }
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredData>;
      const resetAt = validTime(parsed.resetAt);
      return {
        schemaVersion: 2,
        preferences: sanitizePreferences(parsed.preferences),
        records: sanitizeRecords(parsed.records),
        tombstones: sanitizeTombstones(parsed.tombstones),
        resetAt: resetAt ?? 0,
      };
    } catch {
      return fallback; // corrupt → recover, keep prefs default
    }
  }

  function save(data: StoredData): void {
    if (!store || blocked) return;
    try {
      const clean: StoredData = {
        schemaVersion: 2,
        preferences: sanitizePreferences(data.preferences),
        records: sanitizeRecords(data.records),
        tombstones: sanitizeTombstones(data.tombstones),
        resetAt: validTime(data.resetAt) ?? 0,
      };
      store.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      blocked = true; // quota/blocked → non-destructive, no crash
    }
  }

  function upsert(data: StoredData, entry: { id?: string; date: string; weightGrams: number }): StoredData {
    if (!isValidDateString(entry.date)) throw new Error('invalid date');
    if (!Number.isInteger(entry.weightGrams) || entry.weightGrams <= 0) throw new Error('invalid weight');
    const now = Date.now();
    const records = [...data.records];
    let tombstones = data.tombstones.filter((t) => t.date !== entry.date);
    if (entry.id) {
      const idx = records.findIndex((r) => r.id === entry.id);
      if (idx === -1) throw new Error('entry not found');
      if (records.some((r) => r.id !== entry.id && r.date === entry.date)) throw new Error('date already exists');
      const previousDate = records[idx].date;
      if (previousDate !== entry.date) tombstones = [...tombstones, { date: previousDate, updatedAt: now }];
      records[idx] = { ...records[idx], date: entry.date, weightGrams: entry.weightGrams, updatedAt: now };
    } else {
      const existing = records.findIndex((r) => r.date === entry.date);
      const rec: WeightRecord = { id: newId(), date: entry.date, weightGrams: entry.weightGrams, updatedAt: now };
      if (existing >= 0) records[existing] = { ...rec, id: records[existing].id };
      else records.push(rec);
    }
    return { ...data, records: records.sort((a, b) => (a.date < b.date ? -1 : 1)), tombstones };
  }

  function remove(data: StoredData, id: string): StoredData {
    const rec = data.records.find((r) => r.id === id);
    if (!rec) return data;
    const tombstones = [...data.tombstones.filter((t) => t.date !== rec.date), { date: rec.date, updatedAt: Date.now() }];
    return { ...data, records: data.records.filter((r) => r.id !== id), tombstones };
  }

  function clearEntries(data: StoredData): StoredData {
    return { ...data, records: [], tombstones: [] }; // preferences preserved; resetAt comes from the server when signed in
  }

  return { load, save, isBlocked: () => blocked, upsert, remove, clearEntries };
}
