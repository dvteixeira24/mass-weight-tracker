# MASS / MVP product specification

## Product intent
A minimal, mobile-first personal weight log. The user can save one weight for each day, see the trend graph over time, and understand total and average weekly change for a chosen period. It should take under a minute to enter today's weight without being distracting, gamified, or judgmental.

## Information architecture
- **Overview** (home)
  - Latest weight; last recorded date
  - Total change and average change per week for chosen time window
  - Graph with presets: 7D / 30D / 3M / 6M / 1Y / All
  - Last entry and link to history
- **Log weight** (modal sheet, reachable via central +)
  - Weight numeric input, unit suffix, date (defaults today), previous measurement context
  - Add / edit / delete
- **History**
  - Group by month; newest first; weight and delta from previous entry
  - Tap row to edit
- **Settings**
  - Unit preference; export CSV for a chosen date range; optional Google sign-in and sync; delete all; privacy note
- **Onboarding**
  - Select unit; optional starting entry; start tracking

## User journeys
1. First visit: choose preferred units; optionally enter first weight; enter overview. No mandatory registration.
2. Daily check-in: tap +; enter value; accept today's prefilled date; save; latest metric, trend, stats and history update immediately.
3. Backfill: tap +; set a past date; save. Chart/stat order is chronological, not input order.
4. Correction: open history; tap entry; change value/date; save. Collision with a recorded date prompts replacement.
5. Review: choose period; graph and change metrics update together, but latest recorded weight continues to show last overall measurement.
6. Backup: export CSV for a date range (or everything); saved weight entries leave the browser only through the CSV download or because the user signed in to sync.
7. Cross-device: sign in with Google; local entries are merged up on first sign-in, then changes flow both ways while the app is open. Sign out keeps local data.
8. Destruction: clear all entries requires explicit confirmation; when signed in it also clears the cloud copy and keeps the preference. Delete account removes synced entries and sign-in from the server, keeping this device's entries.

## Data model
```ts
export type WeightUnit = 'kg' | 'lb';
export interface WeightRecord {
  id: string;               // local identity for edit/delete UI; never synced
  date: string;             // YYYY-MM-DD local calendar date
  weightGrams: number;      // positive integer
  updatedAt?: number;       // epoch ms of the last local edit; absent on v1 rows, read as 0
}
export interface Tombstone { date: string; updatedAt: number; } // a deleted date
export interface UserPreferences { unit: WeightUnit; onboardingComplete: boolean; } // device-local, never synced
export interface StoredData {
  schemaVersion: 2;
  preferences: UserPreferences;
  records: WeightRecord[];
  tombstones: Tombstone[];
  resetAt: number;          // last server wipe observed by this device, 0 if none
}
```

- Local storage is a versioned schema with validation on read; v1 data upgrades in place (the key stays `mass-weight-tracker-v1`).
- Signed out, saving and charting work without a network connection; the app never contacts a server. Signed in, the app syncs with this app's Cloudflare Worker (D1): records, deletion tombstones and edit times keyed to the Google account. Preferences stay on the device.
- Conflicts merge per date by `updatedAt`, newest wins; on a tie a deletion wins. `resetAt` makes "delete all" stick across devices.
- The app must not send measurements anywhere unless the user has signed in, and must never do so silently otherwise.

## Dates and period semantics
- Local calendar date, not UTC timestamps. Entries are unique by date.
- `7D` includes today and the six preceding local dates; 30D=30 calendar days, 3M=90, 6M=180, 1Y=365. `All` includes all recorded entries.
- Chart includes only actual measurements in chronological order; empty days have no weight entry.
- Stats are computed from first/last measurement **within** selected period, using their actual separation in days.
- Average weekly rate = `((last.weightGrams - first.weightGrams) / 1000 / elapsedDays) * 7`, converted into chosen display units; if days=0, show no rate.
- Total change uses the same first and last weights as the rate. It can be positive, negative or zero.
- Chart should not imply that a no-data period has a constant zero trend.

## Definition of done
- Supported modern Chrome, Firefox, Safari and mobile browsers.
- Works at 320 / 375 / 390 / 430 / 768 px width with safe areas and keyboard open.
- Correct add/edit/delete/replace and stable chart stats across unit changes.
- Data survives reload, but the UI states clearly that local data can be lost if browser storage is cleared; CSV export is available with an optional date range.
- Keyboard accessible controls, modal focus handling, and alternative to non-text chart info.
- Unit tests for date windows, kg↔lb conversion, weekly average, missing days, duplicate records, CSV escaping, range filtering, and sync merge rules.
- Signed out, no network requests. Signed in, entries sync across devices and deletions stay deleted.
- Production build deploys as Cloudflare Workers static assets with SPA fallback plus a `/api/*` Worker backed by D1.
- No analytics, tracking, or external fonts; the only third party is Google sign-in, and only after the user chooses it.
