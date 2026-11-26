import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';
import { toSnapshot, type Snapshot } from '../domain/sync';
import type { WeightStore } from './useWeightStore';

export type SyncStatus = 'signed-out' | 'syncing' | 'idle' | 'error';

export function useSync(store: WeightStore) {
  const [me, setMe] = useState<api.Me | null>(null);
  const [status, setStatus] = useState<SyncStatus>('signed-out');
  const [lastSyncedAt, setLastSyncedAt] = useState<number>();

  const snapshotRef = useRef<Snapshot>(toSnapshot(store.data));
  const meRef = useRef<api.Me | null>(null);
  const busy = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    snapshotRef.current = toSnapshot(store.data);
  }, [store.data]);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  const run = useCallback(async () => {
    if (!meRef.current) return;
    if (busy.current) {
      pending.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        pending.current = false;
        setStatus('syncing');
        const result = await api.syncNow(snapshotRef.current);
        store.applyRemote(result, result.resetAt);
        setLastSyncedAt(Date.now());
        setStatus('idle');
      } while (pending.current);
    } catch {
      setStatus('error');
    } finally {
      busy.current = false;
    }
  }, [store.applyRemote]);

  useEffect(() => {
    let alive = true;
    void api.getMe().then((user) => {
      if (!alive) return;
      setMe(user);
      if (!user) setStatus('signed-out');
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (me) void run();
  }, [me, store.data, run]);

  useEffect(() => {
    if (!me) return;
    const online = () => void run();
    const visible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [me, run]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* cookie may already be gone */
    }
    meRef.current = null;
    setMe(null);
    setStatus('signed-out');
    setLastSyncedAt(undefined);
  }, []);

  const clearAll = useCallback(async () => {
    if (meRef.current) {
      try {
        const { resetAt } = await api.clearRemote();
        store.clearEntries();
        store.applyRemote({ records: [], tombstones: [] }, resetAt);
        return;
      } catch {
        /* offline: clear this device only */
      }
    }
    store.clearEntries();
  }, [store.clearEntries, store.applyRemote]);

  const deleteAccount = useCallback(async () => {
    try {
      await api.deleteAccount();
    } catch {
      /* leave local data untouched even if the request fails */
    }
    meRef.current = null;
    setMe(null);
    setStatus('signed-out');
  }, []);

  return { me, status, lastSyncedAt, signOut, syncNow: () => void run(), clearAll, deleteAccount };
}
