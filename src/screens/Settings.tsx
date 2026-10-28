import { useState } from 'react';
import { toCsv, type WeightRecord, type WeightUnit } from '../domain/weight';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Settings({
  records,
  unit,
  storageBlocked,
  onUnit,
  onClear,
}: {
  records: WeightRecord[];
  unit: WeightUnit;
  storageBlocked: boolean;
  onUnit: (u: WeightUnit) => void;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const download = () => {
    const csv = toCsv(records, unit);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mass-weight-export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 style={{ fontSize: 36 }}>Settings</h1>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="stat-caption">Units</div>
        <p className="stat-sub">Switching units never changes stored values.</p>
        <div className="unit-toggle" role="group" aria-label="Units">
          {(['kg', 'lb'] as WeightUnit[]).map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => onUnit(u)}>
              {u}
            </button>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="stat-caption">Backup</div>
        <p className="stat-sub">
          Export {records.length} {records.length === 1 ? 'entry' : 'entries'} as CSV (date, kg, lb — oldest first).
        </p>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={download} disabled={records.length === 0}>
            Export CSV
          </button>
        </div>
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="stat-caption">Storage</div>
        <p className="stat-sub" role={storageBlocked ? 'alert' : undefined}>
          {storageBlocked
            ? 'Browser storage is blocked — entries cannot be saved on this device. Nothing was deleted.'
            : 'Entries live only in this browser/device (localStorage). They can be cleared by the browser and do not sync. Keep a CSV backup.'}
        </p>
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="stat-caption">Delete</div>
        <div className="btn-row">
          <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
            Delete all entries
          </button>
        </div>
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Delete all entries?"
          body={<p>This removes all weight entries from this browser. Your unit preference is kept. Consider exporting CSV first.</p>}
          confirmLabel="Delete everything"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            onClear();
            setConfirming(false);
          }}
        />
      ) : null}
    </div>
  );
}
