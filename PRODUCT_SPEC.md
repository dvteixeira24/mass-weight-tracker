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
  - Unit preference; export CSV; delete all; local-data privacy note
- **Onboarding**
  - Select unit; optional starting entry; start tracking

## User journeys
1. First visit: choose preferred units; optionally enter first weight; enter overview. No mandatory registration.
2. Daily check-in: tap +; enter value; accept today's prefilled date; save; latest metric, trend, stats and history update immediately.
3. Backfill: tap +; set a past date; save. Chart/stat order is chronological, not input order.
4. Correction: open history; tap entry; change value/date; save. Collision with a recorded date prompts replacement.
5. Review: choose period; graph and change metrics update together, but latest recorded weight continues to show last overall measurement.
6. Backup: export CSV; saved weight entries leave the browser only when the user explicitly downloads the CSV.
7. Destruction: clear all entries requires explicit confirmation; preference remains, empty state appears.

## Data model
```ts
export type WeightUnit = 'kg' | 'lb';
export interface WeightRecord {
  id: string;               // UUID
  date: string;             // YYYY-MM-DD local calendar date
  weightGrams: number;      // positive integer
}
export interface UserPreferences { unit: WeightUnit; onboardingComplete: boolean; }
export interface StoredData {
  schemaVersion: 1;
  preferences: UserPreferences;
  records: WeightRecord[];
}
```

- For v1 use an in-browser storage adapter with explicit schema version and validation on read; localStorage is sufficient at this scale. Keep the adapter interface replaceable.
- Saving and charting work without a network connection once the app assets are cached; actual offline launch support is a separate PWA enhancement.
- The app must not silently send user measurements anywhere.

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
- Data survives reload, but the UI states clearly that local data can be lost if browser storage is cleared; CSV export is available.
- Keyboard accessible controls, modal focus handling, and alternative to non-text chart info.
- Unit tests for date windows, kg↔lb conversion, weekly average, missing days, duplicate records, CSV escaping.
- Production build deploys as Cloudflare Workers static assets with SPA fallback.
- No data collection, analytics, tracking, or external fonts by default.
