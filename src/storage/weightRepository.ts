// Versioned localStorage adapter: validate / sanitize / migrate. Never throws on blocked storage.
import { isValidDateString, newId, type WeightRecord, type WeightUnit } from '../domain/weight';

export const STORAGE_KEY = 'mass-weight-tracker-v1';

export interface UserPreferences {
  unit: WeightUnit;
  onboardingComplete: boolean;
}

export interface StoredData {
  schemaVersion: 1;
  preferences: UserPreferences;
  records: WeightRecord[];
}

export interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultData(): StoredData {
  return { schemaVersion: 1, preferences: { unit: 'kg', onboardingComplete: false }, records: [] };
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
    byDate.set(rec.date, { id: rec.id, date: rec.date, weightGrams: rec.weightGrams }); // last wins
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
      return {
        schemaVersion: 1,
        preferences: sanitizePreferences(parsed.preferences),
        records: sanitizeRecords(parsed.records),
      };
    } catch {
      return fallback; // corrupt → recover, keep prefs default
    }
  }

  function save(data: StoredData): void {
    if (!store || blocked) return;
    try {
      const clean: StoredData = {
        schemaVersion: 1,
        preferences: sanitizePreferences(data.preferences),
        records: sanitizeRecords(data.records),
      };
      store.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      blocked = true; // quota/blocked → non-destructive, no crash
    }
  }

  function upsert(data: StoredData, entry: { id?: string; date: string; weightGrams: number }): StoredData {
    if (!isValidDateString(entry.date)) throw new Error('invalid date');
    if (!Number.isInteger(entry.weightGrams) || entry.weightGrams <= 0) throw new Error('invalid weight');
    const records = [...data.records];
    if (entry.id) {
      const idx = records.findIndex((r) => r.id === entry.id);
      if (idx === -1) throw new Error('entry not found');
      if (records.some((r) => r.id !== entry.id && r.date === entry.date)) throw new Error('date already exists');
      records[idx] = { ...records[idx], date: entry.date, weightGrams: entry.weightGrams };
    } else {
      const existing = records.findIndex((r) => r.date === entry.date);
      const rec: WeightRecord = { id: newId(), date: entry.date, weightGrams: entry.weightGrams };
      if (existing >= 0) records[existing] = { ...rec, id: records[existing].id };
      else records.push(rec);
    }
    return { ...data, records: records.sort((a, b) => (a.date < b.date ? -1 : 1)) };
  }

  function remove(data: StoredData, id: string): StoredData {
    return { ...data, records: data.records.filter((r) => r.id !== id) };
  }

  function clearEntries(data: StoredData): StoredData {
    return { ...data, records: [] }; // preferences preserved
  }

  return { load, save, isBlocked: () => blocked, upsert, remove, clearEntries };
}
