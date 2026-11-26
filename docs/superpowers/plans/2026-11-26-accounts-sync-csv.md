# Accounts, Sync, and Ranged CSV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Google sign-in with cross-device sync, ranged CSV export, and refreshed dependencies to the local-first weight tracker.

**Architecture:** The SPA stays static on Cloudflare Workers assets. One Worker entrypoint handles `/api/*` with D1 as storage; Google OAuth authorization-code flow runs in the Worker with an opaque session cookie. Local storage is the source of truth and the server is a merge target; a shared pure `mergeSnapshots` does per-date last-write-wins.

**Tech Stack:** React 19 + TypeScript + Vite, Vitest + Testing Library + Playwright, Cloudflare Workers + D1 + Wrangler 4, no Worker framework.

**Spec:** `docs/superpowers/specs/2026-11-26-accounts-sync-csv-design.md`

---

## File map

- Modify: `package.json` (dependencies, scripts)
- Modify: `src/domain/weight.ts` — `updatedAt?` on `WeightRecord`, `filterByRange`
- Create: `src/domain/sync.ts` — snapshot types, `toSnapshot`, `mergeSnapshots`
- Modify: `src/storage/weightRepository.ts` — schema v2, tombstones, `resetAt`, edit-date tombstone
- Modify: `src/hooks/useWeightStore.ts` — `dataRef`, `applyRemote`
- Create: `src/api.ts` — typed fetch wrappers for `/api`
- Create: `src/hooks/useSync.ts` — auth state, sync loop, clear/delete actions
- Modify: `src/screens/Settings.tsx` — range picker, account card, copy
- Modify: `src/App.tsx` — `useSync`, wire `sync.clearAll`
- Modify: `public/sw.js` — never cache `/api/*`, bump cache name
- Create: `worker/{types,http,auth,sync,index}.ts` — API
- Create: `migrations/0001_init.sql`
- Create: `.dev.vars.example`
- Modify: `wrangler.jsonc`, `vite.config.ts`, `tsconfig.json`
- Create: `src/domain/sync.test.ts`, `src/screens/Settings.test.tsx`, `worker/sync.test.ts`
- Modify: `src/domain/weight.test.ts`, `src/storage/weightRepository.test.ts`, `e2e/mvp.spec.ts`
- Modify: `README.md`, `PRODUCT_SPEC.md`, `CLOUDFLARE_DEPLOYMENT.md`

## Constraints

- Signed out, the app must behave exactly as today: no network calls, local data, CSV.
- Never change `STORAGE_KEY` (`mass-weight-tracker-v1`); only the inner `schemaVersion` becomes 2.
- Preferences (unit, onboarding) are never synced.
- `mergeSnapshots` is the only conflict logic; it is shared by client and Worker.
- No new runtime dependency for the Worker. No ORM, no auth library, no CSS framework.

---

### Task 1: Dependency refresh

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Confirm the current suite is green**

Run:

```bash
pnpm test
pnpm build
pnpm exec playwright test
```

Expected: all Vitest tests pass, `tsc --noEmit && vite build` succeeds, Playwright reports passing tests.

- [ ] **Step 2: Upgrade everything to latest**

Run:

```bash
pnpm up --latest
pnpm install
```

Expected `package.json` fields after the bump:

```json
{
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.65.1",
    "@testing-library/jest-dom": "^8.0.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.6.13",
    "@types/node": "^26.6.10",
    "@types/react": "^19.3.3",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.3.0",
    "jsdom": "^31.0.1",
    "typescript": "^7.0.2",
    "vite": "^8.3.8",
    "vitest": "^5.1.2",
    "wrangler": "^4.168.0"
  }
}
```

If pnpm warns about a missing `@testing-library/dom` peer, add it: `pnpm add -D @testing-library/dom`.

- [ ] **Step 3: Run the gates and fix fallout**

Run:

```bash
pnpm test
pnpm build
```

Expected: PASS. If `src/test/setup.ts` fails to resolve `@testing-library/jest-dom/vitest` under v8, replace its single line with:

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Isolate any failing major**

If a gate still fails, revert only the offending major and re-run. Exact commands:

```bash
# TypeScript 7 incompatible
pnpm add -D typescript@^5.9.3
# Vite 8 / plugin-react 6 incompatible
pnpm add -D vite@^6.4.5 @vitejs/plugin-react@^4.7.0
# Vitest 5 incompatible
pnpm add -D vitest@^3.2.7
# jest-dom 8 incompatible
pnpm add -D @testing-library/jest-dom@^6.10.0
```

Record every reverted major in the commit message body. Do not mix this commit with feature work.

- [ ] **Step 5: Run Playwright**

Run:

```bash
pnpm build && pnpm exec playwright test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/test/setup.ts
git commit -m "chore: refresh dependencies to current releases"
```

---

### Task 2: CSV export with a date range

**Files:**
- Modify: `src/domain/weight.ts`
- Test: `src/domain/weight.test.ts`
- Modify: `src/screens/Settings.tsx`
- Create: `src/screens/Settings.test.tsx`
- Test: `e2e/mvp.spec.ts`

- [ ] **Step 1: Write the failing domain test**

Add to `src/domain/weight.test.ts` (import `filterByRange` in the existing import list):

```ts
describe('filterByRange', () => {
  const recs = [
    { id: 'a', date: '2026-09-20', weightGrams: 70000 },
    { id: 'b', date: '2026-10-20', weightGrams: 72000 },
    { id: 'c', date: '2026-11-20', weightGrams: 71000 },
  ];

  test('both bounds inclusive, sorted oldest first', () => {
    expect(filterByRange(recs, '2026-10-01', '2026-10-31').map((r) => r.date)).toEqual(['2026-10-20']);
    expect(filterByRange(recs, '2026-09-20', '2026-10-20').map((r) => r.date)).toEqual([
      '2026-09-20',
      '2026-10-20',
    ]);
  });

  test('empty bound is unbounded', () => {
    expect(filterByRange(recs, '', '2026-10-20').map((r) => r.date)).toEqual(['2026-09-20', '2026-10-20']);
    expect(filterByRange(recs, '2026-10-01', '').map((r) => r.date)).toEqual(['2026-10-20', '2026-11-20']);
    expect(filterByRange(recs, '', '')).toHaveLength(3);
  });

  test('empty result and empty input', () => {
    expect(filterByRange(recs, '2027-01-01', '2027-02-01')).toEqual([]);
    expect(filterByRange([], '', '')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/domain/weight.test.ts`

Expected: FAIL — `filterByRange is not a function` / no export.

- [ ] **Step 3: Implement `filterByRange`**

Add to `src/domain/weight.ts` after `filterByPeriod`:

```ts
export function filterByRange(records: WeightRecord[], from: string, to: string): WeightRecord[] {
  const lo = from || null;
  const hi = to || null;
  return [...records]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .filter((r) => (!lo || r.date >= lo) && (!hi || r.date <= hi));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run src/domain/weight.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing Settings test**

Create `src/screens/Settings.test.tsx`:

```tsx
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Settings from './Settings';

afterEach(() => cleanup());

const records = [
  { id: 'a', date: '2026-09-20', weightGrams: 70000 },
  { id: 'b', date: '2026-10-20', weightGrams: 72000 },
];

function renderSettings() {
  render(
    <Settings
      records={records}
      unit="kg"
      storageBlocked={false}
      onUnit={() => {}}
      onClear={() => {}}
    />,
  );
}

describe('Settings CSV range', () => {
  test('counts entries inside the range', () => {
    renderSettings();
    expect(screen.getByText(/2 entries in range/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: '2026-10-31' } });
    expect(screen.getByText(/1 entry in range/i)).toBeInTheDocument();
  });

  test('inverted range disables export and explains why', () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: '2026-10-01' } });
    expect(screen.getByText(/start date must be on or before end date/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeDisabled();
  });

  test('empty result disables export', () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: '2027-01-01' } });
    expect(screen.getByText(/0 entries in range/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeDisabled();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm exec vitest run src/screens/Settings.test.tsx`

Expected: FAIL — no `From`/`To` labels, no range text.

- [ ] **Step 7: Replace `src/screens/Settings.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { filterByRange, toCsv, todayLocal, type WeightRecord, type WeightUnit } from '../domain/weight';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Settings({
  records,
  unit,
  storageBlocked,
  onUnit,
  onClear,
}: {
  records: WeightRecord[];
  unit: WeightUnit;
  storageBlocked: boolean;
  onUnit: (u: WeightUnit) => void;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const earliest = useMemo(
    () => [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0]?.date ?? '',
    [records],
  );
  const [from, setFrom] = useState(earliest);
  const [to, setTo] = useState(todayLocal());
  const ranged = useMemo(() => filterByRange(records, from, to), [records, from, to]);
  const rangeValid = !from || !to || from <= to;
  const canExport = records.length > 0 && rangeValid && ranged.length > 0;

  const download = () => {
    const csv = toCsv(ranged, unit);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mass-weight-export-${from || 'all'}_${to || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 style={{ fontSize: 36 }}>Settings</h1>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="stat-caption">Units</div>
        <p className="stat-sub">Switching units never changes stored values.</p>
        <div className="unit-toggle" role="group" aria-label="Units">
          {(['kg', 'lb'] as WeightUnit[]).map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => onUnit(u)}>
              {u}
            </button>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="stat-caption">Backup</div>
        <p className="stat-sub">Export weight entries as CSV (date, kg, lb — oldest first).</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="field">
            <label htmlFor="export-from">From</label>
            <input
              id="export-from"
              type="date"
              max={todayLocal()}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="export-to">To</label>
            <input
              id="export-to"
              type="date"
              max={todayLocal()}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <p className="stat-sub" role={rangeValid ? undefined : 'alert'}>
          {rangeValid
            ? `${ranged.length} ${ranged.length === 1 ? 'entry' : 'entries'} in range. Leave a date empty for no limit.`
            : 'Start date must be on or before end date.'}
        </p>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={download} disabled={!canExport}>
            Export CSV
          </button>
        </div>
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="stat-caption">Storage</div>
        <p className="stat-sub" role={storageBlocked ? 'alert' : undefined}>
          {storageBlocked
            ? 'Browser storage is blocked — entries cannot be saved on this device. Nothing was deleted.'
            : 'Entries live only in this browser/device (localStorage). They can be cleared by the browser and do not sync. Keep a CSV backup.'}
        </p>
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="stat-caption">Delete</div>
        <div className="btn-row">
          <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
            Delete all entries
          </button>
        </div>
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Delete all entries?"
          body={<p>This removes all weight entries from this browser. Your unit preference is kept. Consider exporting CSV first.</p>}
          confirmLabel="Delete everything"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            onClear();
            setConfirming(false);
          }}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 8: Run the Settings test**

Run: `pnpm exec vitest run src/screens/Settings.test.tsx`

Expected: PASS.

- [ ] **Step 9: Add the e2e coverage**

In `e2e/mvp.spec.ts`, add `import { readFileSync } from 'node:fs';` at the top and add this test inside the describe block:

```ts
test('CSV export honours a date range', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem(
      'mass-weight-tracker-v1',
      JSON.stringify({
        schemaVersion: 1,
        preferences: { unit: 'kg', onboardingComplete: true },
        records: [
          { id: 'a', date: '2026-09-20', weightGrams: 70000 },
          { id: 'b', date: '2026-10-20', weightGrams: 72000 },
        ],
      }),
    ),
  );
  await page.reload();
  await page.getByRole('button', { name: /open settings/i }).click();
  await page.getByLabel(/^from$/i).fill('2026-10-01');
  await page.getByLabel(/^to$/i).fill('2026-10-31');
  await expect(page.getByText(/1 entry in range/i)).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /export csv/i }).click();
  const download = await downloadPromise;
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv).toContain('2026-10-20');
  expect(csv).not.toContain('2026-09-20');
});
```

- [ ] **Step 10: Run all gates**

Run:

```bash
pnpm test
pnpm build && pnpm exec playwright test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/domain/weight.ts src/domain/weight.test.ts src/screens/Settings.tsx src/screens/Settings.test.tsx e2e/mvp.spec.ts
git commit -m "feat: export CSV for a date range"
```

---

### Task 3: Local schema v2, tombstones, and the merge rule

**Files:**
- Modify: `src/domain/weight.ts` (only the `WeightRecord` type)
- Create: `src/domain/sync.ts`
- Test: `src/domain/sync.test.ts`
- Modify: `src/storage/weightRepository.ts`
- Test: `src/storage/weightRepository.test.ts`
- Modify: `src/hooks/useWeightStore.ts`

- [ ] **Step 1: Write the failing merge test**

Create `src/domain/sync.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/domain/sync.test.ts`

Expected: FAIL — cannot resolve `./sync`.

- [ ] **Step 3: Add the optional timestamp and implement `src/domain/sync.ts`**

In `src/domain/weight.ts`, change the interface to:

```ts
export interface WeightRecord {
  id: string;
  date: string; // YYYY-MM-DD local
  weightGrams: number; // positive integer
  updatedAt?: number; // epoch ms; absent on legacy v1 rows, read as 0
}
```

Create `src/domain/sync.ts`:

```ts
// Conflict-free merge shared by the SPA and the Worker. Local dates, epoch-ms timestamps.
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
  // shortcut: resetAt uses client edit timestamps, so a badly skewed clock can lose a post-reset edit; upgrade to server sequence numbers if that ever matters
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
```

- [ ] **Step 4: Run the merge test**

Run: `pnpm exec vitest run src/domain/sync.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing storage v2 tests**

Add to `src/storage/weightRepository.test.ts`:

```ts
describe('schema v2 and tombstones', () => {
  test('v1 payload migrates on read without losing records', () => {
    const v1 = {
      schemaVersion: 1,
      preferences: { unit: 'lb', onboardingComplete: true },
      records: [{ id: 'a', date: '2026-10-20', weightGrams: 70000 }],
    };
    const repo = createRepository(memStorage({ [STORAGE_KEY]: JSON.stringify(v1) }));
    const loaded = repo.load();
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.records).toHaveLength(1);
    expect(loaded.records[0].updatedAt).toBeUndefined();
    expect(loaded.tombstones).toEqual([]);
    expect(loaded.resetAt).toBe(0);
    expect(loaded.preferences.unit).toBe('lb');
  });

  test('upsert stamps updatedAt and clears a tombstone for that date', () => {
    const repo = createRepository(memStorage());
    let data = repo.load();
    data = { ...data, tombstones: [{ date: '2026-10-20', updatedAt: 5 }] };
    data = repo.upsert(data, { date: '2026-10-20', weightGrams: 70000 });
    expect(data.records[0].updatedAt).toBeGreaterThan(0);
    expect(data.tombstones).toEqual([]);
  });

  test('remove creates a tombstone; moving a date tombstones the old date', () => {
    const repo = createRepository(memStorage());
    let data = repo.load();
    data = repo.upsert(data, { date: '2026-10-20', weightGrams: 70000 });
    const id = data.records[0].id;
    data = repo.upsert(data, { id, date: '2026-10-21', weightGrams: 71000 });
    expect(data.tombstones.map((t) => t.date)).toEqual(['2026-10-20']);
    data = repo.remove(data, id);
    expect(data.records).toEqual([]);
    expect(data.tombstones.map((t) => t.date)).toEqual(['2026-10-20', '2026-10-21']);
  });

  test('clearEntries drops records and tombstones, keeps preferences', () => {
    const repo = createRepository(memStorage());
    let data = repo.load();
    data = repo.upsert(data, { date: '2026-10-20', weightGrams: 70000 });
    data = repo.remove(data, data.records[0].id);
    data = repo.clearEntries(data);
    expect(data.records).toEqual([]);
    expect(data.tombstones).toEqual([]);
    expect(data.preferences.unit).toBe('kg');
  });
});
```

Also in the existing "sanitizes bad records" test, change its `const bad: StoredData = { schemaVersion: 1, ... }` to `schemaVersion: 2` and add `tombstones: [], resetAt: 0`.

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm exec vitest run src/storage/weightRepository.test.ts`

Expected: FAIL — `schemaVersion` is 1 / `tombstones` undefined / no tombstones produced.

- [ ] **Step 7: Replace `src/storage/weightRepository.ts`**

```ts
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
```

- [ ] **Step 8: Run the storage tests**

Run: `pnpm exec vitest run src/storage/weightRepository.test.ts src/domain/sync.test.ts`

Expected: PASS.

- [ ] **Step 9: Refactor the store to read current state from a ref**

Replace `src/hooks/useWeightStore.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    }),
    [persist],
  );

  return { data, blocked, notice, setNotice, ...actions };
}

export type WeightStore = ReturnType<typeof useWeightStore>;
```

- [ ] **Step 10: Run every gate**

Run:

```bash
pnpm test
pnpm build && pnpm exec playwright test
```

Expected: PASS. Removing a record now writes a tombstone; the existing e2e delete-all test only inspects `records`, so it stays green.

- [ ] **Step 11: Commit**

```bash
git add src/domain/weight.ts src/domain/sync.ts src/domain/sync.test.ts src/storage/weightRepository.ts src/storage/weightRepository.test.ts src/hooks/useWeightStore.ts
git commit -m "feat: schema v2 with edit timestamps, tombstones, and a shared merge rule"
```

---

### Task 4: Worker, D1 schema, and Google OAuth

**Files:**
- Create: `worker/types.ts`, `worker/http.ts`, `worker/auth.ts`, `worker/sync.ts`, `worker/index.ts`
- Create: `worker/sync.test.ts`
- Create: `migrations/0001_init.sql`
- Create: `.dev.vars.example`
- Modify: `wrangler.jsonc`, `package.json`, `vite.config.ts`, `tsconfig.json`

- [ ] **Step 1: Write the failing snapshot-validation test**

Create `worker/sync.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run worker/sync.test.ts`

Expected: FAIL — cannot resolve `./http`.

- [ ] **Step 3: Create `worker/types.ts` and `worker/http.ts`**

`worker/types.ts`:

```ts
// Minimal D1/Workers surface used by this Worker; keeps DOM lib types without workers-types.
export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_ORIGIN?: string;
}
```

`worker/http.ts`:

```ts
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'invalid json');
  }
}
```

- [ ] **Step 4: Create `worker/sync.ts`**

```ts
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
```

- [ ] **Step 5: Run the validation test**

Run: `pnpm exec vitest run worker/sync.test.ts`

Expected: PASS.

- [ ] **Step 6: Create `worker/auth.ts`**

```ts
import type { Env } from './types';

export const SESSION_COOKIE = 'mass_session';
export const STATE_COOKIE = 'mass_oauth_state';
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function cookieHeader(name: string, value: string, maxAgeSeconds: number, path = '/'): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearCookieHeader(name: string, path = '/'): string {
  return `${name}=; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function randomToken(bytes = 32): string {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  let text = '';
  for (const byte of array) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function originFor(env: Env, request: Request): string {
  return env.APP_ORIGIN || new URL(request.url).origin;
}

export interface SessionUser {
  sub: string;
  email: string;
  name: string | null;
  resetAt: number;
  sessionHash: string;
}

export function startSignIn(env: Env, request: Request): Response {
  const state = randomToken(16);
  const origin = originFor(env, request);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${origin}/api/auth/google/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'online');
  const headers = new Headers();
  headers.append('Set-Cookie', cookieHeader(STATE_COOKIE, state, 600, '/api/auth'));
  headers.set('Location', url.toString());
  return new Response(null, { status: 302, headers });
}

function failure(message: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Sign-in failed</title><p>${message}</p><p><a href="/">Back to mass.</a></p>`,
    { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

export async function finishSignIn(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = getCookie(request, STATE_COOKIE);
  if (!code || !state || !expected || !constantTimeEqual(state, expected)) {
    return failure('Invalid sign-in response. Try again.');
  }

  const redirectUri = `${originFor(env, request)}/api/auth/google/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return failure('Google rejected the sign-in. Try again.');
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return failure('Google did not return an access token.');

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) return failure('Could not read your Google profile.');
  const info = (await infoRes.json()) as { sub?: string; email?: string; name?: string };
  if (!info.sub || !info.email) return failure('Google profile is missing an id or email.');

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO users (sub, email, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(sub) DO UPDATE SET email = excluded.email, name = excluded.name',
    ).bind(info.sub, info.email, info.name ?? null, now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
  ]);

  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), info.sub, now, now + SESSION_TTL_MS)
    .run();

  const headers = new Headers();
  headers.append('Set-Cookie', cookieHeader(SESSION_COOKIE, token, SESSION_TTL_MS / 1000));
  headers.append('Set-Cookie', clearCookieHeader(STATE_COOKIE, '/api/auth'));
  headers.set('Location', '/');
  return new Response(null, { status: 302, headers });
}

export async function currentUser(env: Env, request: Request): Promise<SessionUser | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const sessionHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT u.sub, u.email, u.name, u.reset_at AS resetAt, s.token_hash AS sessionHash FROM sessions s JOIN users u ON u.sub = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
  )
    .bind(sessionHash, Date.now())
    .first<SessionUser>();
  return row ?? null;
}
```

- [ ] **Step 7: Create `worker/index.ts`**

```ts
import { clearCookieHeader, currentUser, finishSignIn, SESSION_COOKIE, startSignIn } from './auth';
import { HttpError, json, readJson } from './http';
import { parseSnapshot, readSnapshot, writeSnapshot } from './sync';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/api/auth/google' && request.method === 'GET') return startSignIn(env, request);
      if (path === '/api/auth/google/callback' && request.method === 'GET') return finishSignIn(env, request);

      if (path === '/api/me' && request.method === 'GET') {
        const user = await currentUser(env, request);
        if (!user) return json({ error: 'unauthorized' }, 401);
        return json({ email: user.email, name: user.name });
      }

      if (path === '/api/auth/logout' && request.method === 'POST') {
        const user = await currentUser(env, request);
        if (!user) return json({ error: 'unauthorized' }, 401);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.sessionHash).run();
        const headers = new Headers();
        headers.append('Set-Cookie', clearCookieHeader(SESSION_COOKIE));
        return new Response(null, { status: 204, headers });
      }

      const user = await currentUser(env, request);

      if (path === '/api/sync' && request.method === 'POST') {
        if (!user) return json({ error: 'unauthorized' }, 401);
        const snapshot = parseSnapshot(await readJson(request), Date.now());
        await writeSnapshot(env, user.sub, snapshot, user.resetAt);
        const merged = await readSnapshot(env, user.sub);
        return json({ ...merged, resetAt: user.resetAt });
      }

      if (path === '/api/records' && request.method === 'DELETE') {
        if (!user) return json({ error: 'unauthorized' }, 401);
        const resetAt = Date.now();
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET reset_at = ? WHERE sub = ?').bind(resetAt, user.sub),
          env.DB.prepare('DELETE FROM entries WHERE user_id = ?').bind(user.sub),
        ]);
        return json({ resetAt });
      }

      if (path === '/api/account' && request.method === 'DELETE') {
        if (!user) return json({ error: 'unauthorized' }, 401);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM entries WHERE user_id = ?').bind(user.sub),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.sub),
          env.DB.prepare('DELETE FROM users WHERE sub = ?').bind(user.sub),
        ]);
        const headers = new Headers();
        headers.append('Set-Cookie', clearCookieHeader(SESSION_COOKIE));
        return new Response(null, { status: 204, headers });
      }

      return json({ error: 'not found' }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      return json({ error: 'internal error' }, 500);
    }
  },
};
```

- [ ] **Step 8: Add the D1 migration**

Create `migrations/0001_init.sql`:

```sql
CREATE TABLE users (
  sub        TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT,
  created_at INTEGER NOT NULL,
  reset_at   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE entries (
  user_id      TEXT NOT NULL,
  date         TEXT NOT NULL,
  weight_grams INTEGER,
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
```

- [ ] **Step 9: Wire configuration**

`wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "mass-weight-tracker",
  "compatibility_date": "2026-10-28",
  "main": "./worker/index.ts",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "mass-weight-tracker",
      "database_id": "REPLACE_WITH_WRANGLER_D1_CREATE_ID",
      "migrations_dir": "./migrations"
    }
  ]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
```

`tsconfig.json` `include` becomes:

```json
"include": ["src", "worker", "vite.config.ts", "vitest.config.ts"]
```

`package.json` scripts gain:

```json
"dev:worker": "wrangler dev --port 8787",
"db:migrate:local": "wrangler d1 migrations apply mass-weight-tracker --local",
"db:migrate": "wrangler d1 migrations apply mass-weight-tracker --remote"
```

Create `.dev.vars.example`:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
APP_ORIGIN=http://localhost:5173
```

- [ ] **Step 10: Typecheck, create the local database, and verify unauthenticated routes**

Run:

```bash
pnpm test
pnpm build
pnpm exec wrangler d1 migrations apply mass-weight-tracker --local
```

Expected: tests pass, build passes, migration applied locally.

Then start `pnpm dev:worker` and, in another terminal:

```bash
curl -i http://127.0.0.1:8787/api/me
curl -i http://127.0.0.1:8787/api/auth/google
curl -i -X POST http://127.0.0.1:8787/api/sync
```

Expected: `401` JSON for `/api/me`; `302` with `Location: https://accounts.google.com/...` and a `Set-Cookie: mass_oauth_state=...` for the auth URL; `401` JSON for `/api/sync`.

- [ ] **Step 11: Get the OAuth client credentials**

Ask the user for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` with the secret card, then write them to `.dev.vars` (never commit; it is already in `.gitignore`). The Google client must be type **Web application** with redirect URIs:

```
http://localhost:5173/api/auth/google/callback
http://localhost:8787/api/auth/google/callback
```

Consent screen scopes: `openid`, `email`, `profile`.

- [ ] **Step 12: Verify the full sign-in and sync by hand**

With `pnpm dev:worker` and `pnpm dev` both running, open `http://localhost:5173`, click Settings → Sign in with Google, complete consent, and confirm:

- the app returns to `/` and Settings shows the Google email;
- adding an entry writes a row: `pnpm exec wrangler d1 execute mass-weight-tracker --local --command "SELECT user_id, date, weight_grams, updated_at, deleted FROM entries"`;
- "Delete all entries" clears the rows and a second device (or a cleared localStorage) stays empty after signing in.

If Google rejects the redirect, the URI registered in the console does not exactly match `origin + /api/auth/google/callback`.

- [ ] **Step 13: Commit**

```bash
git add worker migrations wrangler.jsonc vite.config.ts tsconfig.json package.json .dev.vars.example
git commit -m "feat: worker API with d1 storage and google oauth"
```

---

### Task 5: Client sync loop and account UI

**Files:**
- Create: `src/api.ts`, `src/hooks/useSync.ts`
- Modify: `src/hooks/useWeightStore.ts` (add `applyRemote`)
- Modify: `src/screens/Settings.tsx`, `src/screens/Onboarding.tsx`, `src/App.tsx`
- Test: `src/screens/Settings.test.tsx`
- Modify: `public/sw.js`

- [ ] **Step 1: Write the failing Settings account test**

Add to `src/screens/Settings.test.tsx`:

```tsx
const signedOut = {
  status: 'signed-out' as const,
  onSyncNow: () => {},
  onSignOut: () => {},
  onDeleteAccount: () => {},
};

function renderWithSync(sync: Parameters<typeof Settings>[0]['sync']) {
  render(
    <Settings
      records={records}
      unit="kg"
      storageBlocked={false}
      onUnit={() => {}}
      onClear={() => {}}
      sync={sync}
    />,
  );
}

test('signed out shows a Google sign-in link and no sync controls', () => {
  renderWithSync(signedOut);
  expect(screen.getByRole('link', { name: /sign in with google/i })).toHaveAttribute(
    'href',
    '/api/auth/google',
  );
  expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument();
});

test('signed in shows the account, sync status, and sign-out', () => {
  renderWithSync({
    status: 'idle',
    email: 'person@example.com',
    lastSyncedAt: 1_800_000_000_000,
    onSyncNow: () => {},
    onSignOut: () => {},
    onDeleteAccount: () => {},
  });
  expect(screen.getByText(/person@example.com/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
});
```

Also update the existing `renderSettings()` helper to pass `sync={signedOut}` so the old tests keep compiling.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/screens/Settings.test.tsx`

Expected: FAIL — `sync` prop missing / no sign-in link.

- [ ] **Step 3: Create `src/api.ts`**

```ts
import type { Snapshot } from './domain/sync';

export interface Me {
  email: string;
  name: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getMe(): Promise<Me | null> {
  try {
    return await request<Me>('/api/me');
  } catch {
    return null;
  }
}

export function logout(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' });
}

export function syncNow(snapshot: Snapshot): Promise<Snapshot & { resetAt: number }> {
  return request<Snapshot & { resetAt: number }>('/api/sync', {
    method: 'POST',
    body: JSON.stringify(snapshot),
  });
}

export function clearRemote(): Promise<{ resetAt: number }> {
  return request<{ resetAt: number }>('/api/records', { method: 'DELETE' });
}

export function deleteAccount(): Promise<void> {
  return request<void>('/api/account', { method: 'DELETE' });
}
```

- [ ] **Step 4: Add `applyRemote` to the store**

In `src/hooks/useWeightStore.ts`, import `mergeSnapshots`, `toSnapshot`, `Snapshot` from `../domain/sync` and `newId` from `../domain/weight`. Add before `actions`:

```ts
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
```

Add `applyRemote` to the `actions` useMemo entry and its dependency array.

- [ ] **Step 5: Create `src/hooks/useSync.ts`**

```ts
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
```

`signIn` returns a handler so Settings can keep a plain link for right-click/open-in-new-tab.

- [ ] **Step 6: Add the account card to Settings**

In `src/screens/Settings.tsx`:

Add to the props type:

```tsx
  sync: {
    status: 'signed-out' | 'syncing' | 'idle' | 'error';
    email?: string;
    lastSyncedAt?: number;
    onSyncNow: () => void;
    onSignOut: () => void;
    onDeleteAccount: () => void;
  };
```

Switch `confirming` from a boolean to `useState<'entries' | 'account' | null>(null)` and update the two existing references (`setConfirming(true)` → `setConfirming('entries')`, `{confirming ?` → `{confirming === 'entries' ?`).

Insert this card after the Units card:

```tsx
      <div className="card" style={{ marginTop: 8 }}>
        <div className="stat-caption">Account &amp; sync</div>
        {sync.status === 'signed-out' ? (
          <>
            <p className="stat-sub">Entries stay on this device. Sign in to use them on all your devices.</p>
            <div className="btn-row">
              <a className="btn primary" href="/api/auth/google">
                Sign in with Google
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="stat-sub">Signed in as {sync.email ?? 'your Google account'}.</p>
            <p className="stat-sub" role={sync.status === 'error' ? 'alert' : 'status'}>
              {sync.status === 'syncing'
                ? 'Syncing…'
                : sync.status === 'error'
                  ? 'Not synced — will retry when you are online.'
                  : sync.lastSyncedAt
                    ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString()}.`
                    : 'Not synced yet.'}
            </p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={sync.onSyncNow}>
                Sync now
              </button>
              <button type="button" className="btn" onClick={sync.onSignOut}>
                Sign out
              </button>
            </div>
            <div className="btn-row">
              <button type="button" className="btn danger" onClick={() => setConfirming('account')}>
                Delete account and cloud data
              </button>
            </div>
          </>
        )}
      </div>
```

Change the Storage card body to:

```tsx
          {storageBlocked
            ? 'Browser storage is blocked — entries cannot be saved on this device. Nothing was deleted.'
            : sync.status === 'signed-out'
              ? 'Entries live only in this browser/device (localStorage). They can be cleared by the browser and do not sync. Keep a CSV backup.'
              : 'Entries are saved in this browser and synced to this app’s Cloudflare database for your Google account. Sign out or delete the account to stop syncing.'}
```

Add the second dialog next to the existing one:

```tsx
      {confirming === 'account' ? (
        <ConfirmDialog
          title="Delete account and cloud data?"
          body={<p>Removes your synced entries and sign-in from the server. Entries on this device are kept. You can sign in again later.</p>}
          confirmLabel="Delete cloud data"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            void sync.onDeleteAccount();
            setConfirming(null);
          }}
        />
      ) : null}
```

In `src/screens/Onboarding.tsx`, change the privacy line to:

```tsx
      <p style={{ color: 'var(--mass-muted)' }}>Private by design — entries stay in this browser unless you sign in.</p>
```

- [ ] **Step 7: Wire it in `src/App.tsx`**

Add `import { useSync } from './hooks/useSync';` and, after `const store = useWeightStore();`:

```tsx
  const sync = useSync(store);
```

`useSync` must be called before the onboarding early return.

Replace the Settings props:

```tsx
        <Settings
          records={store.data.records}
          unit={unit}
          storageBlocked={store.blocked}
          onUnit={store.setUnit}
          onClear={sync.clearAll}
          sync={{
            status: sync.status,
            email: sync.me?.email,
            lastSyncedAt: sync.lastSyncedAt,
            onSyncNow: sync.syncNow,
            onSignOut: sync.signOut,
            onDeleteAccount: sync.deleteAccount,
          }}
        />
```

- [ ] **Step 8: Stop the service worker caching the API**

In `public/sw.js`, change the cache name to `mass-weight-tracker-v2` and, after the same-origin check, add:

```js
  if (url.pathname.startsWith('/api/')) return; // never cache API responses
```

- [ ] **Step 9: Run the gates**

Run:

```bash
pnpm test
pnpm build && pnpm exec playwright test
```

Expected: PASS. The existing e2e suite runs signed out, so it must not make API calls that affect the assertions.

- [ ] **Step 10: Verify two-device sync by hand**

With `pnpm dev:worker` and `pnpm dev` running and `.dev.vars` filled:

1. Sign in, add an entry, confirm the Settings status says "Last synced".
2. In a second browser profile, sign in with the same Google account and reload: the entry appears.
3. In the second profile delete the entry; back in the first, press "Sync now": the entry disappears.
4. In profile one press "Delete all entries", confirm; reload profile two and sync: it is empty.
5. Sign out in profile one, add an entry offline (DevTools → Network → Offline), reload: the entry persists locally and syncs when back online.

- [ ] **Step 11: Commit**

```bash
git add src/api.ts src/hooks/useSync.ts src/hooks/useWeightStore.ts src/screens/Settings.tsx src/screens/Settings.test.tsx src/screens/Onboarding.tsx src/App.tsx public/sw.js
git commit -m "feat: optional google sign-in with local-first sync"
```

---

### Task 6: Documentation and final verification

**Files:**
- Modify: `README.md`, `PRODUCT_SPEC.md`, `CLOUDFLARE_DEPLOYMENT.md`

- [ ] **Step 1: Update `PRODUCT_SPEC.md`**

Replace the two privacy bullets (data model section and "No data collection" line) with:

```markdown
- Signed out, entries stay in the browser and leave it only through an explicit CSV download. Signed in, entries (local date, weight in grams, last-edit time) are stored for that Google account on this app's Cloudflare Worker. No analytics, no third-party requests beyond Google sign-in.
```

Update the Settings bullet to mention account/sync and ranged export, and the data model block to schema v2 with `updatedAt`, `tombstones`, `resetAt`.

- [ ] **Step 2: Update `README.md`**

Replace the "Storage & limits" and "Future" claims with the real behaviour: local by default, optional Google sign-in, D1 storage, tombstones, signed-out offline launch still works, CSV range export. Add local dev commands:

```bash
pnpm dev:worker   # Worker API on :8787 (D1 local)
pnpm db:migrate:local
pnpm dev          # Vite UI on :5173, proxies /api
```

- [ ] **Step 3: Update `CLOUDFLARE_DEPLOYMENT.md`**

Replace the "no server-side database" topology with the Worker + D1 diagram from the spec, and add the deploy runbook from the spec (D1 create, migrations, secrets, Google redirect URIs). Keep the "never build images on a server" rule irrelevant here.

- [ ] **Step 4: Full verification**

Run:

```bash
pnpm test
pnpm build
pnpm exec playwright test
git status --short
```

Expected: all tests pass, build succeeds, no uncommitted files.

- [ ] **Step 5: Commit**

```bash
git add README.md PRODUCT_SPEC.md CLOUDFLARE_DEPLOYMENT.md
git commit -m "docs: describe accounts, sync, and ranged csv"
```

---

## Deploy checklist (user-run)

1. `pnpm exec wrangler d1 create mass-weight-tracker` → paste `database_id` into `wrangler.jsonc`.
2. `pnpm exec wrangler d1 migrations apply mass-weight-tracker --remote`.
3. `pnpm exec wrangler secret put GOOGLE_CLIENT_ID` and `pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET`.
4. Add `https://<worker-host>/api/auth/google/callback` to the Google OAuth client.
5. `pnpm build && pnpm deploy`.
