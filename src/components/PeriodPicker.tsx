import type { PeriodKey } from '../domain/weight';
import './PeriodPicker.css';

const PERIODS: PeriodKey[] = ['7D', '30D', '3M', '6M', '1Y', 'All'];

export default function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (p: PeriodKey) => void;
}) {
  return (
    <div className="periods" role="group" aria-label="Chart period">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          className={p === value ? 'active' : ''}
          aria-pressed={p === value}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
