// Conflict merge shared by the SPA and the Worker. Local dates, epoch-ms timestamps.
import type { WeightRecord } from './weight';

export interface SnapshotRecord {
  date: string;
  weightGrams: number;
  updatedAt: number;
}

export interface Tombstone {
  date: string;
  updatedAt: number;
}

export interface Snapshot {
  records: SnapshotRecord[];
  tombstones: Tombstone[];
}

interface Entry {
  date: string;
  weightGrams: number | null;
  updatedAt: number;
}

export function toSnapshot(data: { records: WeightRecord[]; tombstones: Tombstone[] }): Snapshot {
  return {
    records: data.records.map((r) => ({
      date: r.date,
      weightGrams: r.weightGrams,
      updatedAt: r.updatedAt ?? 0,
    })),
    tombstones: data.tombstones.map((t) => ({ date: t.date, updatedAt: t.updatedAt })),
  };
}

/** Per date, highest timestamp wins; on a tie a delete beats a record. */
function collapse(snapshot: Snapshot): Map<string, Entry> {
  const map = new Map<string, Entry>();
  const put = (date: string, weightGrams: number | null, updatedAt: number) => {
    const prev = map.get(date);
    const wins =
      !prev ||
      updatedAt > prev.updatedAt ||
      (updatedAt === prev.updatedAt && weightGrams === null && prev.weightGrams !== null);
    if (wins) map.set(date, { date, weightGrams, updatedAt });
  };
  for (const r of snapshot.records) put(r.date, r.weightGrams, r.updatedAt);
  for (const t of snapshot.tombstones) put(t.date, null, t.updatedAt);
  return map;
}

function fingerprint(snapshot: Snapshot): string {
  const byDate = (a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const recs = [...snapshot.records].sort(byDate).map((r) => `${r.date},${r.weightGrams},${r.updatedAt}`);
  const tombs = [...snapshot.tombstones].sort(byDate).map((t) => `${t.date},${t.updatedAt}`);
  return `${recs.join(';')}|${tombs.join(';')}`;
}

export function mergeSnapshots(
  local: Snapshot,
  remote: Snapshot,
  resetAt: number,
): { snapshot: Snapshot; changed: boolean } {
  const merged = collapse(local);
  for (const [date, entry] of collapse(remote)) {
    const prev = merged.get(date);
    const wins =
      !prev ||
      entry.updatedAt > prev.updatedAt ||
      (entry.updatedAt === prev.updatedAt && entry.weightGrams === null && prev.weightGrams !== null);
    if (wins) merged.set(date, entry);
  }
  // shortcut: resetAt compares client edit clocks, so a badly skewed clock can lose a post-reset edit; upgrade to server sequence numbers if that ever matters
  if (resetAt > 0) {
    for (const [date, entry] of merged) if (entry.updatedAt <= resetAt) merged.delete(date);
  }
  const byDate = (a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const records = [...merged.values()]
    .filter((e): e is Entry & { weightGrams: number } => e.weightGrams !== null)
    .map((e) => ({ date: e.date, weightGrams: e.weightGrams, updatedAt: e.updatedAt }))
    .sort(byDate);
  const tombstones = [...merged.values()]
    .filter((e) => e.weightGrams === null)
    .map((e) => ({ date: e.date, updatedAt: e.updatedAt }))
    .sort(byDate);
  const next: Snapshot = { records, tombstones };
  return { snapshot: next, changed: fingerprint(local) !== fingerprint(next) };
}
