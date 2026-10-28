import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createRepository,
  defaultData,
  type StoredData,
} from '../storage/weightRepository';
import type { WeightUnit } from '../domain/weight';

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
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setBlocked(repo.isBlocked());
  }, []);

  const persist = useCallback((next: StoredData, msg?: string) => {
    setData(next);
    try {
      repo.save(next);
    } catch {
      /* non-destructive */
    }
    setBlocked(repo.isBlocked());
    if (msg) setNotice(msg);
  }, []);

  const actions = useMemo(
    () => ({
      setUnit: (unit: WeightUnit) =>
        persist({ ...data, preferences: { ...data.preferences, unit } }),
      completeOnboarding: (initial?: { date: string; weightGrams: number }) => {
        let next: StoredData = {
          ...data,
          preferences: { ...data.preferences, onboardingComplete: true },
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
        persist(repo.upsert(data, entry), msg),
      remove: (id: string) => persist(repo.remove(data, id), 'Entry deleted.'),
      clearEntries: () => persist(repo.clearEntries(data), 'All entries deleted.'),
    }),
    [data, persist],
  );

  return { data, blocked, notice, setNotice, ...actions };
}

export type WeightStore = ReturnType<typeof useWeightStore>;
