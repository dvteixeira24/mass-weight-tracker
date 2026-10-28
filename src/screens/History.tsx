import { useMemo } from 'react';
import {
  formatSigned,
  gramsToDisplay,
  KG_PER_LB,
  type WeightRecord,
  type WeightUnit,
} from '../domain/weight';
import HistoryRow from '../components/HistoryRow';
import EmptyState from '../components/EmptyState';

export default function History({
  records,
  unit,
  onEdit,
  onAdd,
}: {
  records: WeightRecord[];
  unit: WeightUnit;
  onEdit: (r: WeightRecord) => void;
  onAdd: () => void;
}) {
  const sorted = useMemo(
    () => [...records].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [records],
  );
  const groups = useMemo(() => {
    const map = new Map<string, WeightRecord[]>();
    [...sorted].reverse().forEach((r) => {
      const key = new Date(`${r.date}T12:00:00`).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return [...map.entries()];
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: 36 }}>History</h1>
        <div className="notice" role="status">
          Nothing logged yet. Your entries will appear here grouped by month.
        </div>
        <EmptyState onAdd={onAdd} />
      </div>
    );
  }

  const deltaFor = (index: number): string => {
    if (index <= 0) return 'First entry';
    const dKg = (sorted[index].weightGrams - sorted[index - 1].weightGrams) / 1000;
    const d = unit === 'lb' ? dKg / KG_PER_LB : dKg;
    void gramsToDisplay;
    return Math.abs(d) < 0.0005 ? `0.0 ${unit}` : formatSigned(d, unit);
  };

  return (
    <div>
      <h1 style={{ fontSize: 36 }}>History</h1>
      <p style={{ color: 'var(--mass-muted)', fontSize: 13 }}>
        {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'} · tap a row to edit
      </p>
      {groups.map(([month, rows]) => (
        <section key={month} aria-label={month}>
          <div className="history-group">
            <h2>{month}</h2>
          </div>
          {rows.map((r) => {
            const idx = sorted.findIndex((x) => x.id === r.id);
            return (
              <HistoryRow
                key={r.id}
                date={r.date}
                weightGrams={r.weightGrams}
                unit={unit}
                deltaText={deltaFor(idx)}
                onOpen={() => onEdit(r)}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
