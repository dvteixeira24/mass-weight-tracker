import { useMemo, useState } from 'react';
import { filterByRange, toCsv, todayLocal, type WeightRecord, type WeightUnit } from '../domain/weight';
import ConfirmDialog from '../components/ConfirmDialog';

export interface SettingsProps {
  records: WeightRecord[];
  unit: WeightUnit;
  storageBlocked: boolean;
  onUnit: (u: WeightUnit) => void;
  onClear: () => void;
  sync: {
    status: 'signed-out' | 'syncing' | 'idle' | 'error';
    email?: string;
    lastSyncedAt?: number;
    onSyncNow: () => void;
    onSignOut: () => void;
    onDeleteAccount: () => void;
  };
}

export default function Settings({ records, unit, storageBlocked, onUnit, onClear, sync }: SettingsProps) {
  const [confirming, setConfirming] = useState<'entries' | 'account' | null>(null);
  const earliest = useMemo(
    () => [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0]?.date ?? '',
    [records],
  );
  const [from, setFrom] = useState(earliest);
  const [to, setTo] = useState(todayLocal());
  const ranged = useMemo(() => filterByRange(records, from, to), [records, from, to]);
  const rangeValid = !from || !to || from <= to;
  const canExport = records.length > 0 && rangeValid && ranged.length > 0;

  const download = () => {
    const csv = toCsv(ranged, unit);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mass-weight-export-${from || 'all'}_${to || 'all'}.csv`;
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
        <div className="stat-caption">Account &amp; sync</div>
        {sync.status === 'signed-out' ? (
          <>
            <p className="stat-sub">Entries stay on this device. Sign in to use them on all your devices.</p>
            <div className="btn-row">
              <a className="btn primary" href="/api/auth/google">
                Sign in with Google
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="stat-sub">Signed in as {sync.email ?? 'your Google account'}.</p>
            <p className="stat-sub" role={sync.status === 'error' ? 'alert' : 'status'}>
              {sync.status === 'syncing'
                ? 'Syncing…'
                : sync.status === 'error'
                  ? 'Not synced — will retry when you are online.'
                  : sync.lastSyncedAt
                    ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString()}.`
                    : 'Not synced yet.'}
            </p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={sync.onSyncNow}>
                Sync now
              </button>
              <button type="button" className="btn" onClick={sync.onSignOut}>
                Sign out
              </button>
            </div>
            <div className="btn-row">
              <button type="button" className="btn danger" onClick={() => setConfirming('account')}>
                Delete account and cloud data
              </button>
            </div>
          </>
        )}
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="stat-caption">Backup</div>
        <p className="stat-sub">Export weight entries as CSV (date, kg, lb — oldest first).</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="field">
            <label htmlFor="export-from">From</label>
            <input
              id="export-from"
              type="date"
              max={todayLocal()}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="export-to">To</label>
            <input
              id="export-to"
              type="date"
              max={todayLocal()}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <p className="stat-sub" role={rangeValid ? undefined : 'alert'}>
          {rangeValid
            ? `${ranged.length} ${ranged.length === 1 ? 'entry' : 'entries'} in range. Leave a date empty for no limit.`
            : 'Start date must be on or before end date.'}
        </p>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={download} disabled={!canExport}>
            Export CSV
          </button>
        </div>
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="stat-caption">Storage</div>
        <p className="stat-sub" role={storageBlocked ? 'alert' : undefined}>
          {storageBlocked
            ? 'Browser storage is blocked — entries cannot be saved on this device. Nothing was deleted.'
            : sync.status === 'signed-out'
              ? 'Entries live only in this browser/device (localStorage). They can be cleared by the browser and do not sync. Keep a CSV backup.'
              : 'Entries are saved in this browser and synced to this app’s Cloudflare database for your Google account. Sign out or delete the account to stop syncing.'}
        </p>
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="stat-caption">Delete</div>
        <div className="btn-row">
          <button type="button" className="btn danger" onClick={() => setConfirming('entries')}>
            Delete all entries
          </button>
        </div>
      </div>
      {confirming === 'entries' ? (
        <ConfirmDialog
          title="Delete all entries?"
          body={<p>This removes all weight entries from this browser. Your unit preference is kept. Consider exporting CSV first.</p>}
          confirmLabel="Delete everything"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            onClear();
            setConfirming(null);
          }}
        />
      ) : null}
      {confirming === 'account' ? (
        <ConfirmDialog
          title="Delete account and cloud data?"
          body={<p>Removes your synced entries and sign-in from the server. Entries on this device are kept. You can sign in again later.</p>}
          confirmLabel="Delete cloud data"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            void sync.onDeleteAccount();
            setConfirming(null);
          }}
        />
      ) : null}
    </div>
  );
}
