// Pure weight domain: types, conversions, local-date math, period stats, CSV.
// UI-independent. Dates are local YYYY-MM-DD strings, never UTC timestamps.

export type WeightUnit = 'kg' | 'lb';
export type PeriodKey = '7D' | '30D' | '3M' | '6M' | '1Y' | 'All';

export interface WeightRecord {
  id: string;
  date: string; // YYYY-MM-DD local
  weightGrams: number; // positive integer
}

export interface PeriodStats {
  totalChange: number; // display units
  perWeek: number; // display units / week
  elapsedDays: number;
  count: number;
}

export const KG_PER_LB = 0.45359237;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function parseLocal(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0); // noon avoids DST midnight edge
}

export function toLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLocal(): string {
  return toLocalDateString(new Date());
}

export function addLocalDays(date: string, days: number): string {
  const d = parseLocal(date);
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

/** Difference in whole local calendar days (b - a), DST-safe via noon anchoring. */
export function diffLocalCalendarDays(a: string, b: string): number {
  const da = parseLocal(a);
  const db = parseLocal(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function gramsToDisplay(grams: number, unit: WeightUnit): number {
  return unit === 'lb' ? grams / 1000 / KG_PER_LB : grams / 1000;
}

export function displayToGrams(value: number, unit: WeightUnit): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('weight must be finite and positive');
  const kg = unit === 'lb' ? value * KG_PER_LB : value;
  const grams = Math.round(kg * 1000);
  if (!Number.isFinite(grams) || grams <= 0) throw new Error('weight must be finite and positive');
  if (grams > 1500000) throw new Error('weight unreasonably large');
  return grams;
}

export function isValidWeightInput(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= (2000 as number);
}

const PERIOD_DAYS: Record<Exclude<PeriodKey, 'All'>, number> = {
  '7D': 7,
  '30D': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
};

export function periodStart(period: PeriodKey, today: string): string | null {
  if (period === 'All') return null;
  return addLocalDays(today, -(PERIOD_DAYS[period] - 1));
}

export function filterByPeriod(records: WeightRecord[], period: PeriodKey, today: string): WeightRecord[] {
  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (period === 'All') return sorted;
  const from = periodStart(period, today)!;
  return sorted.filter((r) => r.date >= from && r.date <= today);
}

/** Stats from first/last measurement within window. Null when <2 distinct dates. */
export function periodStats(
  within: WeightRecord[],
  unit: WeightUnit,
): PeriodStats | null {
  const sorted = [...within].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const elapsedDays = diffLocalCalendarDays(first.date, last.date);
  if (elapsedDays <= 0) return null;
  const deltaKg = (last.weightGrams - first.weightGrams) / 1000;
  const totalChange = unit === 'lb' ? deltaKg / KG_PER_LB : deltaKg;
  return { totalChange, perWeek: (totalChange / elapsedDays) * 7, elapsedDays, count: sorted.length };
}

/** Round only for display; nonzero values get +/− prefix. */
export function formatSigned(value: number, unit: WeightUnit, decimals = 1): string {
  const factor = 10 ** decimals;
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * factor + Number.EPSILON) / factor;
  if (Object.is(rounded, -0)) return `0.0 ${unit}`;
  const prefix = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${prefix}${Math.abs(rounded).toFixed(decimals)} ${unit}`;
}

export function formatWeight(grams: number, unit: WeightUnit): string {
  return `${(Math.round((gramsToDisplay(grams, unit) + Number.EPSILON) * 10) / 10).toFixed(1)} ${unit}`;
}

export function toCsv(records: WeightRecord[], _unit: WeightUnit): string {
  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rows = ['date,weight_kg,weight_lb'];
  for (const r of sorted) {
    const kg = (r.weightGrams / 1000).toFixed(1);
    const lb = (r.weightGrams / 1000 / KG_PER_LB).toFixed(1);
    rows.push(`${r.date},${kg},${lb}`);
  }
  return rows.join('\n');
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
