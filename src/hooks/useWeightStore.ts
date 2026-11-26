import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createRepository,
  defaultData,
  type StoredData,
} from '../storage/weightRepository';
import { mergeSnapshots, toSnapshot, type Snapshot } from '../domain/sync';
import { newId, type WeightUnit } from '../domain/weight';

const repo = createRepository(typeof localStorage !== 'undefined' ? localStorage : null);

export type Screen = 'overview' | 'history' | 'settings';

export function useWeightStore() {
  const [data, setData] = useState<StoredData>(() => {
    try {
      return repo.load();
    } catch {
      return defaultData();
    }
  });
  const dataRef = useRef(data);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setBlocked(repo.isBlocked());
  }, []);

  const persist = useCallback((next: StoredData, msg?: string) => {
    dataRef.current = next;
    setData(next);
    try {
      repo.save(next);
    } catch {
      /* non-destructive */
    }
    setBlocked(repo.isBlocked());
    if (msg) setNotice(msg);
  }, []);

  const applyRemote = useCallback(
    (remote: Snapshot, resetAt: number): boolean => {
      const current = dataRef.current;
      const merged = mergeSnapshots(toSnapshot(current), remote, resetAt);
      if (!merged.changed && current.resetAt === resetAt) return false;
      const ids = new Map(current.records.map((r) => [r.date, r.id]));
      const records = merged.snapshot.records.map((r) => ({
        id: ids.get(r.date) ?? newId(),
        ...r,
      }));
      persist({ ...current, records, tombstones: merged.snapshot.tombstones, resetAt });
      return merged.changed;
    },
    [persist],
  );

  const actions = useMemo(
    () => ({
      setUnit: (unit: WeightUnit) =>
        persist({ ...dataRef.current, preferences: { ...dataRef.current.preferences, unit } }),
      completeOnboarding: (initial?: { date: string; weightGrams: number }) => {
        let next: StoredData = {
          ...dataRef.current,
          preferences: { ...dataRef.current.preferences, onboardingComplete: true },
        };
        if (initial) {
          try {
            next = repo.upsert(next, initial);
          } catch {
            /* ignore invalid initial */
          }
        }
        persist(next);
      },
      upsert: (entry: { id?: string; date: string; weightGrams: number }, msg = 'Saved.') =>
        persist(repo.upsert(dataRef.current, entry), msg),
      remove: (id: string) => persist(repo.remove(dataRef.current, id), 'Entry deleted.'),
      clearEntries: () => persist(repo.clearEntries(dataRef.current), 'All entries deleted.'),
      applyRemote,
    }),
    [persist, applyRemote],
  );

  return { data, blocked, notice, setNotice, ...actions };
}

export type WeightStore = ReturnType<typeof useWeightStore>;
