# Weight Tracker MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build working React+TS+Vite weight-tracker MVP per PRODUCT_SPEC.md, deployable as Cloudflare Workers static dist/.

**Architecture:** Pure domain math in src/domain/weight.ts (date-only strings, integer grams, period stats); versioned localStorage adapter in src/storage/weightRepository.ts with validate/sanitize/migrate; thin React shell (AppShell/BottomNav/screens/sheet/chart) styled by token CSS + CSS Modules, no UI lib.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest + Testing Library, wrangler v4 static assets.

---

## File map

- Create: `src/domain/weight.ts` — types, kg/lb↔grams, YYYY-MM-DD local dates, period windows, total/weekly stats, CSV builders
- Create: `src/storage/weightRepository.ts` — StoredData v1, load/save, validation/migration, useWeightStore hook support
- Create: `src/hooks/useWeightStore.ts` — preferences + records state, CRUD with duplicate-date handling
- Create: `src/components/AppShell.tsx/.module.css`, `BottomNav`, `PeriodPicker`, `StatCard`, `WeightChart`, `WeightEntrySheet`, `HistoryRow`, `EmptyState`, `ConfirmDialog`
- Create: `src/screens/Onboarding`, `Overview`, `History`, `Settings` (+ .module.css each)
- Create: `src/styles/tokens.css` (from design/tokens.css), `src/styles/globals.css`
- Create: `src/App.tsx`, `src/main.tsx`, `index.html`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `src/test/setup.ts`
- Modify: `package.json` (react build/test scripts), `wrangler.jsonc` (dist, valid name/date), `.gitignore`, `README.md`
- Test: `src/domain/weight.test.ts`, `src/storage/weightRepository.test.ts`

## Constraints (from handoff)

- Local YYYY-MM-DD only, unique id+date, sort by date. 7D=today+6 prior; 30/90/180/365 rolling; All=all. Stats from first/last in-window distinct dates; rate=(Δkg/days)*7; no rate if <2 distinct dates. Display-only rounding, +/− signs, units everywhere. Gaps≠zero.
- Canonical integer grams; unit toggle never rewrites grams. CSV ordered, ISO date + kg/lb columns.
- Colors: bg #151917, surface #1d2420, border #343d35, text #f2f3eb, accent #c5f17c; serif headings/sans UI; ~3px radius; tabular digits; 44px targets; safe-area; reduced-motion; focus visible.
- No login/D1/KV/backend/analytics/external fonts; no BMI/goals/calories/commentary.

### Task 1: Scaffold + domain/tests

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/domain/weight.ts`
- Test: `src/domain/weight.test.ts`

- [ ] Step 1: Write failing domain tests (conversions, date deltas across DST, period windows, stats incl. sparse/elapsed-days, CSV)
- [ ] Step 2: Run `pnpm exec vitest run src/domain/weight.test.ts` → FAIL (missing impl)
- [ ] Step 3: Implement minimal `weight.ts` to green
- [ ] Step 4: Re-run → PASS; run `pnpm build` smoke
- [ ] Step 5: Report (no commit — no git repo)

### Task 2: Storage adapter + tests

**Files:**
- Create: `src/storage/weightRepository.ts`
- Test: `src/storage/weightRepository.test.ts`

- [ ] Step 1: Failing tests: valid load, corrupt JSON recovery, schema migration, duplicate-date replace, edit-date conflict, CSV order/escaping
- [ ] Step 2: Run → FAIL
- [ ] Step 3: Minimal versioned adapter (key `mass-weight-tracker-v1`, validate/sanitize, blocked-storage non-throw)
- [ ] Step 4: Run → PASS

### Task 3: Shell + onboarding

**Files:** `src/styles/tokens.css`, `globals.css`, `src/components/AppShell.tsx`, `BottomNav.tsx`, `EmptyState.tsx`, `src/screens/Onboarding.tsx`, `src/App.tsx`, `src/hooks/useWeightStore.ts`

- [ ] Unit kg/lb radios (default kg), optional initial weight (number/inputMode/decimal/min/max/step), blank allowed; first visit only; save → Overview

### Task 4: Logging + storage wiring

**Files:** `src/components/WeightEntrySheet.tsx`, `ConfirmDialog.tsx`

- [ ] Bottom sheet mobile / dialog desktop, focus trap + restore, Escape/backdrop only when clean; local-today default, past ok future blocked; finite positive only; existing date → confirm replace; edit Delete → destructive confirm; Save → Overview

### Task 5: Overview + chart

**Files:** `src/screens/Overview.tsx`, `src/components/PeriodPicker.tsx`, `StatCard.tsx`, `WeightChart.tsx`

- [ ] Latest overall weight/date; period total + weekly cards (— when <2 distinct dates); 7D/30D/3M/6M/1Y/All; SVG time-proportional x, keyboard-accessible points + table alternative; empty/0/1 states; no +0.0

### Task 6: History + settings

**Files:** `src/screens/History.tsx`, `Settings.tsx`, `src/components/HistoryRow.tsx`

- [ ] Reverse-chrono monthly groups; delta vs preceding chronological entry (earliest "First entry"); row→edit; empty state. Settings: unit toggle (grams preserved), ordered CSV download, delete-all w/ confirm keeping prefs, local-storage explainer

### Task 7: Responsive/a11y + build/deploy

- [ ] 320/375/390/430/768/desktop, no h-overflow, nav/sheet/keyboard clearance, contrast/focus/reduced-motion; `pnpm build`, `wrangler deploy --dry-run` if supported; README + wrangler.jsonc + .gitignore; screenshot compare vs artboards if practical
