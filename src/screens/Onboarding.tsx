import { useState } from 'react';
import { displayToGrams, todayLocal, type WeightUnit } from '../domain/weight';

export default function Onboarding({
  onDone,
}: {
  onDone: (unit: WeightUnit, initial?: { date: string; weightGrams: number }) => void;
}) {
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState('');

  const start = () => {
    const t = weight.trim();
    if (!t) {
      onDone(unit);
      return;
    }
    const v = Number(t);
    if (!Number.isFinite(v) || v <= 0) {
      setError('Enter a finite weight above zero, or leave blank.');
      return;
    }
    try {
      onDone(unit, { date: todayLocal(), weightGrams: displayToGrams(v, unit) });
    } catch {
      setError('Enter a finite weight above zero, or leave blank.');
    }
  };

  return (
    <div>
      <p style={{ color: 'var(--mass-muted)', fontSize: 12, letterSpacing: '0.12em' }}>WELCOME</p>
      <h1 style={{ fontSize: 40 }}>Start tracking</h1>
      <p style={{ color: 'var(--mass-muted)' }}>Private by design — entries stay in this browser.</p>
      <div className="field">
        <label id="unit-label">Units</label>
        <div className="unit-toggle" role="group" aria-labelledby="unit-label">
          {(['kg', 'lb'] as WeightUnit[]).map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>
              {u === 'kg' ? 'Kilograms (kg)' : 'Pounds (lb)'}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="ob-weight">Today&apos;s weight ({unit}) — optional</label>
        <input
          id="ob-weight"
          type="number"
          inputMode="decimal"
          min={1}
          max={1500}
          step="any"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="Leave blank to skip"
        />
      </div>
      <div className="error" role="alert">
        {error}
      </div>
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={start}>
          Start tracking
        </button>
      </div>
    </div>
  );
}
