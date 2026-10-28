# MASS / Component inventory

## Design principles
- Mobile-first; 390 x 844 px reference artboards; works from 320 px widths upward.
- Dark stone background, light readable type, pale lime accent.
- Almost-square edges, minimal elevation, clear section borders.
- Editorial serif for page headings; readable system sans-serif for data and controls.
- Strong hierarchy: most recent weight > total change / weekly rate > chart > history.
- No moral judgment about weight change: positive change uses the same accent whether gaining or losing is intended. Avoid red/green judgments of health. Red is for destructive actions only.

## Reusable UI pieces
| Component | Content | States | Interaction |
| --- | --- | --- | --- |
| AppShell | Brand, header action, main content, bottom navigation | Normal, onboarding | Max 480 px on desktop, fluid mobile |
| BottomNav | Overview, central Add, History | Selected, hover, focus | Add opens bottom sheet; other buttons navigate |
| LatestWeight | Value, unit, date | With data, empty | Updates after save/edit/delete |
| StatCard | Caption, signed value, context | Populated, insufficient data | Derived from selected period |
| PeriodControl | 7D/30D/3M/6M/1Y/All | Active, inactive, focus | Recomputes period and chart |
| WeightTrendChart | Line, points, date ticks, axis labels | 2+ data, 0–1 data | Time-proportional horizontal axis; optional focusable tooltip |
| HistoryRow | Day, date, weight, delta | Normal, focused | Open edit sheet |
| WeightEntrySheet | Weight, unit, date, save, delete on edit | Create, edit, invalid, submitting | Must be keyboard accessible and dismissible |
| UnitSelector | kg / lb | Selected | Display conversion; canonical stored unit unchanged |
| EmptyState | Guidance + Add CTA | No records, insufficient range | Start logging |
| Notice/Toast | Save, delete, export feedback | Visible, hidden | Announced to assistive technology |

## Screen inventory
1. **Onboarding**: unit preference and optional first measurement. Can be skipped with no entry.
2. **Overview**: latest measurement; selected-period total and weekly change; graph; latest entry.
3. **Log weight**: responsive bottom sheet/modal, add and edit variants.
4. **History**: all entries grouped by month, newest first. Tap row to edit.
5. **Settings**: preferred units; CSV export; clear data; privacy explanation.
6. **Overview empty state**: after initial setup without a measurement, or after clearing data.

## Layout rules
- Main content: 27 px horizontal gutters at 390 px; reduce to 20 px below 360 px.
- At wide viewport sizes the narrow app remains centered, but production can optionally add a desktop two-column data layout.
- Reserve bottom safe-area and navigation space on mobile; no content may be hidden behind controls.
- Use 44 x 44 px minimum interactive hit targets in production even if visual glyphs are smaller.
- Use numeric tabular figures; choose a stable axis range that never clips measurements.
- Never make chart color the sole means to communicate a numeric change.

## Data behavior
- One record per local calendar date; adding an existing date must ask to replace/edit rather than create a duplicate.
- Dates use `YYYY-MM-DD` strings, not timestamps, to avoid UTC date shifts.
- Weight must be finite and positive; restrict unreasonably large values without making medical claims.
- Record a canonical integer **weight in grams**; `lb` is display and input conversion only.
- Total change = last minus first *recorded* value within the selected period.
- Weekly rate = total change / actual elapsed calendar days between the two entries * 7. Never divide by period preset length or number of entries.
- If fewer than two measurements on distinct dates exist within the selected period, show `—` for both change statistics; render an empty/single-point chart state.
- Missing days are **not** zero values. Do not treat unrecorded days as weights or interpolate them when computing statistics.
- Periods: 7 calendar days, 30 calendar days, 90 days, 180 days, 365 days, All. Anchor fixed presets at the user's current local date.
- The latest weight at the top is the latest record overall, not the last record in the chart period. Clearly label its date.
- Display sign and units for changes, including negative changes. Never hide weight loss.
- Export CSV with ISO date and canonical kilograms, optionally pounds. Deleting requires confirmation.

## Accessibility
- Use real labels for inputs and role=dialog / aria-modal for the entry sheet.
- Move focus into the sheet when opened; trap focus and return focus to the initiating control on close.
- Expose an accessible data table or ordered list as an alternative to the trend chart.
- Respect prefers-reduced-motion; maintain contrast; announce saves/errors with role=status.
- Do not rely on small floating chart labels for essential information.

## Scope boundary
- V1: no login, no accounts, no server-side user-data persistence, no health analysis, no BMI, no push reminders, no goal recommendations, no third-party analytics.
- V2 candidates: authentication, Cloudflare D1 data sync, reminder notifications, optional target weight, 7-day smoothing, data import.
