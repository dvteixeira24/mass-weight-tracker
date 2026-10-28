import { useEffect, useRef, useState } from 'react';
import {
  displayToGrams,
  gramsToDisplay,
  isValidDateString,
  todayLocal,
  type WeightRecord,
  type WeightUnit,
} from '../domain/weight';

export interface SheetValue {
  record?: WeightRecord;
  conflictDate?: string;
}

export default function WeightEntrySheet({
  unit,
  last,
  initial,
  existingDates,
  onSave,
  onDelete,
  onClose,
}: {
  unit: WeightUnit;
  last?: WeightRecord;
  initial?: WeightRecord;
  existingDates: Set<string>;
  onSave: (entry: { id?: string; date: string; weightGrams: number }) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const [initialWeight] = useState(
    initial ? gramsToDisplay(initial.weightGrams, unit).toFixed(1) : '',
  );
  const [initialDate] = useState(initial?.date ?? todayLocal());
  const [weight, setWeight] = useState(initialWeight);
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);
  const dirty = weight !== initialWeight || date !== initialDate;

  useEffect(() => {
    opener.current = document.activeElement;
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dirty) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose, dirty]);

  const submit = (force = false) => {
    const v = Number(weight);
    if (!Number.isFinite(v) || v <= 0) {
      setError('Enter a finite weight above zero.');
      return;
    }
    if (!isValidDateString(date)) {
      setError('Enter a valid date.');
      return;
    }
    if (date > todayLocal()) {
      setError('Future dates are not allowed.');
      return;
    }
    let grams: number;
    try {
      grams = displayToGrams(v, unit);
    } catch {
      setError('Enter a finite weight above zero.');
      return;
    }
    const collides =
      existingDates.has(date) && (!initial || initial.date !== date);
    if (collides && !force) {
      setConfirmReplace(true);
      return;
    }
    onSave({ id: initial?.id, date, weightGrams: grams });
  };

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !dirty) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={initial ? 'Edit weight' : 'Log weight'} className="sheet">
        <h2>{initial ? 'Edit entry' : 'Log weight'}</h2>
        {last && !initial ? (
          <p style={{ color: 'var(--mass-muted)', fontSize: 13 }}>
            Last entry: {last.date} — {gramsToDisplay(last.weightGrams, unit).toFixed(1)} {unit}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="w-weight">Weight ({unit})</label>
          <input
            id="w-weight"
            ref={firstField}
            type="number"
            inputMode="decimal"
            min={1}
            max={1500}
            step="any"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={`e.g. ${unit === 'kg' ? '70.5' : '155.3'}`}
          />
        </div>
        <div className="field">
          <label htmlFor="w-date">Date</label>
          <input
            id="w-date"
            type="date"
            value={date}
            max={todayLocal()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="error" role="alert">
          {error}
        </div>
        {confirmReplace ? (
          <div className="notice" role="alert">
            <p>
              An entry for {date} already exists. Replace it?
            </p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => setConfirmReplace(false)}>
                Keep existing
              </button>
              <button type="button" className="btn primary" onClick={() => submit(true)}>
                Replace
              </button>
            </div>
          </div>
        ) : null}
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          {initial && onDelete ? (
            confirmDelete ? (
              <>
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
                <button type="button" className="btn danger" onClick={() => onDelete(initial.id)}>
                  Delete entry
                </button>
              </>
            ) : (
              <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )
          ) : null}
          <button type="button" className="btn primary" onClick={() => submit()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
