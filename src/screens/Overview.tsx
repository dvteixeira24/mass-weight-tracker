import { useMemo, useState } from 'react';
import {
  filterByPeriod,
  formatSigned,
  formatWeight,
  periodStats,
  todayLocal,
  type PeriodKey,
  type WeightRecord,
  type WeightUnit,
} from '../domain/weight';
import PeriodPicker from '../components/PeriodPicker';
import StatCard from '../components/StatCard';
import WeightChart from '../components/WeightChart';
import EmptyState from '../components/EmptyState';

const PERIOD_LABEL: Record<PeriodKey, string> = {
  '7D': '7 days',
  '30D': '30 days',
  '3M': '90 days (3M)',
  '6M': '180 days (6M)',
  '1Y': '365 days',
  All: 'all entries',
};

export default function Overview({
  records,
  unit,
  onAdd,
  onOpenHistory,
  onEdit,
}: {
  records: WeightRecord[];
  unit: WeightUnit;
  onAdd: () => void;
  onOpenHistory: () => void;
  onEdit: (r: WeightRecord) => void;
}) {
  const [period, setPeriod] = useState<PeriodKey>('3M');
  const today = todayLocal();
  const within = useMemo(() => filterByPeriod(records, period, today), [records, period, today]);
  const stats = useMemo(() => periodStats(within, unit), [within, unit]);
  const sorted = useMemo(
    () => [...records].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [records],
  );
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  if (records.length === 0) {
    return (
      <div>
        <p style={{ color: 'var(--mass-muted)', fontSize: 12, letterSpacing: '0.12em' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}
        </p>
        <h1 style={{ fontSize: 40 }}>Your progress</h1>
        <div style={{ margin: '16px 0' }}>
          <EmptyState onAdd={onAdd} />
        </div>
      </div>
    );
  }

  const prevDelta =
    latest && prev ? (latest.weightGrams - prev.weightGrams) / 1000 / (unit === 'lb' ? 0.45359237 : 1) : null;

  return (
    <div>
      <p style={{ color: 'var(--mass-muted)', fontSize: 12, letterSpacing: '0.12em' }}>
        {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}
      </p>
      <h1 style={{ fontSize: 40 }}>Your progress</h1>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="stat-caption">Latest weight</div>
        <div style={{ fontSize: 44, fontFamily: 'var(--mass-editorial-font)' }}>
          {latest ? formatWeight(latest.weightGrams, unit).replace(` ${unit}`, '') : '—'}{' '}
          <span style={{ fontSize: 18, color: 'var(--mass-accent)' }}>{unit}</span>
        </div>
        <div className="stat-sub">
          {latest ? `Last recorded on ${latest.date}` : 'No entries yet.'}
        </div>
      </div>
      <div className="stat-grid">
        <StatCard
          caption={`Total · ${period}`}
          value={stats ? formatSigned(stats.totalChange, unit) : '—'}
          sub={stats ? `${stats.count} entries · ${PERIOD_LABEL[period]}` : 'Need 2 dated entries'}
        />
        <StatCard
          caption="Per week"
          value={stats ? formatSigned(stats.perWeek, unit) : '—'}
          sub={stats ? `${stats.elapsedDays}d elapsed` : 'No rate yet'}
        />
      </div>
      <PeriodPicker value={period} onChange={setPeriod} />
      <WeightChart entries={within} unit={unit} />
      <div className="card" style={{ marginTop: 12 }}>
        <div className="stat-caption">Recent entry</div>
        {latest ? (
          <button
            type="button"
            onClick={() => onOpenHistory()}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}
            aria-label={`Open history, latest ${latest.date}`}
          >
            <div style={{ fontSize: 18 }}>
              {formatWeight(latest.weightGrams, unit)} · {latest.date}
            </div>
            <div className="stat-sub">
              {prevDelta === null ? 'First entry' : formatSigned(prevDelta, unit)}
            </div>
          </button>
        ) : null}
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => latest && onEdit(latest)}>
            Edit latest
          </button>
        </div>
      </div>
    </div>
  );
}
