import { formatWeight, type WeightUnit } from '../domain/weight';

export default function HistoryRow({
  date,
  weightGrams,
  unit,
  deltaText,
  onOpen,
}: {
  date: string;
  weightGrams: number;
  unit: WeightUnit;
  deltaText: string;
  onOpen: () => void;
}) {
  const d = new Date(`${date}T12:00:00`);
  const day = d.toLocaleDateString('en-GB', { day: '2-digit' });
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  return (
    <button type="button" className="history-row" onClick={onOpen} aria-label={`Edit entry ${date}`}>
      <span>
        <strong style={{ fontSize: 20 }}>{day}</strong>{' '}
        <span style={{ color: 'var(--mass-muted)', fontSize: 13 }}>
          {weekday} · {date}
        </span>
      </span>
      <span style={{ textAlign: 'right' }}>
        <strong>{formatWeight(weightGrams, unit)}</strong>
        <small>{deltaText}</small>
      </span>
    </button>
  );
}
