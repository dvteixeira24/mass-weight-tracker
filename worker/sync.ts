import { isValidDateString } from '../src/domain/weight';
import type { Snapshot, SnapshotRecord, Tombstone } from '../src/domain/sync';
import type { D1PreparedStatement, Env } from './types';
import { HttpError } from './http';

const MAX_ENTRIES = 10000;
const MAX_WEIGHT_GRAMS = 1500000;

function validTime(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function parseSnapshot(input: unknown, now: number): Snapshot {
  if (typeof input !== 'object' || input === null) throw new HttpError(400, 'invalid body');
  const body = input as { records?: unknown; tombstones?: unknown };
  const rawRecords = Array.isArray(body.records) ? body.records : [];
  const rawTombstones = Array.isArray(body.tombstones) ? body.tombstones : [];
  if (rawRecords.length > MAX_ENTRIES || rawTombstones.length > MAX_ENTRIES) {
    throw new HttpError(413, 'snapshot too large');
  }
  const clamp = (t: number) => Math.min(t, now + 5 * 60 * 1000);

  const records: SnapshotRecord[] = [];
  for (const raw of rawRecords) {
    if (typeof raw !== 'object' || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    if (typeof rec.date !== 'string' || !isValidDateString(rec.date)) continue;
    if (typeof rec.weightGrams !== 'number' || !Number.isInteger(rec.weightGrams)) continue;
    if (rec.weightGrams < 1 || rec.weightGrams > MAX_WEIGHT_GRAMS) continue;
    const updatedAt = validTime(rec.updatedAt);
    if (updatedAt === undefined) continue;
    records.push({ date: rec.date, weightGrams: rec.weightGrams, updatedAt: clamp(updatedAt) });
  }

  const tombstones: Tombstone[] = [];
  for (const raw of rawTombstones) {
    if (typeof raw !== 'object' || raw === null) continue;
    const tomb = raw as Record<string, unknown>;
    if (typeof tomb.date !== 'string' || !isValidDateString(tomb.date)) continue;
    const updatedAt = validTime(tomb.updatedAt);
    if (updatedAt === undefined) continue;
    tombstones.push({ date: tomb.date, updatedAt: clamp(updatedAt) });
  }

  return { records, tombstones };
}

const UPSERT = `INSERT INTO entries (user_id, date, weight_grams, updated_at, deleted)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(user_id, date) DO UPDATE SET
  weight_grams = excluded.weight_grams,
  updated_at   = excluded.updated_at,
  deleted      = excluded.deleted
WHERE excluded.updated_at > entries.updated_at
   OR (excluded.updated_at = entries.updated_at AND excluded.deleted = 1)`;

export async function writeSnapshot(env: Env, userId: string, snapshot: Snapshot, resetAt: number): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  for (const r of snapshot.records) {
    if (r.updatedAt <= resetAt) continue;
    statements.push(env.DB.prepare(UPSERT).bind(userId, r.date, r.weightGrams, r.updatedAt, 0));
  }
  for (const t of snapshot.tombstones) {
    if (t.updatedAt <= resetAt) continue;
    statements.push(env.DB.prepare(UPSERT).bind(userId, t.date, null, t.updatedAt, 1));
  }
  if (statements.length > 0) await env.DB.batch(statements);
}

interface EntryRow {
  date: string;
  weight_grams: number | null;
  updated_at: number;
  deleted: number;
}

export async function readSnapshot(env: Env, userId: string): Promise<Snapshot> {
  const { results = [] } = await env.DB.prepare(
    'SELECT date, weight_grams, updated_at, deleted FROM entries WHERE user_id = ? ORDER BY date',
  )
    .bind(userId)
    .all<EntryRow>();
  const records: SnapshotRecord[] = [];
  const tombstones: Tombstone[] = [];
  for (const row of results) {
    if (row.deleted === 1) tombstones.push({ date: row.date, updatedAt: row.updated_at });
    else if (row.weight_grams !== null) records.push({ date: row.date, weightGrams: row.weight_grams, updatedAt: row.updated_at });
  }
  return { records, tombstones };
}
