import { useCallback, useState } from 'react';
import AppShell from './components/AppShell';
import BottomNav from './components/BottomNav';
import WeightEntrySheet from './components/WeightEntrySheet';
import Onboarding from './screens/Onboarding';
import Overview from './screens/Overview';
import History from './screens/History';
import Settings from './screens/Settings';
import { useWeightStore, type Screen } from './hooks/useWeightStore';
import type { WeightRecord } from './domain/weight';
import './components/PeriodPicker.css';

export default function App() {
  const store = useWeightStore();
  const [screen, setScreen] = useState<Screen>('overview');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<WeightRecord | undefined>(undefined);

  const openAdd = useCallback(() => {
    setEditing(undefined);
    setSheetOpen(true);
  }, []);
  const openEdit = useCallback((r: WeightRecord) => {
    setEditing(r);
    setSheetOpen(true);
  }, []);

  if (!store.data.preferences.onboardingComplete) {
    return (
      <AppShell>
        <Onboarding
          onDone={(unit, initial) => {
            const unitFirst =
              unit === store.data.preferences.unit
                ? store.data
                : { ...store.data, preferences: { ...store.data.preferences, unit } };
            // apply unit then complete
            if (unit !== store.data.preferences.unit) store.setUnit(unit);
            void unitFirst;
            store.completeOnboarding(initial);
          }}
        />
        {store.blocked ? (
          <div className="notice" role="alert">
            Browser storage is blocked — entries will not persist, but the app keeps working.
          </div>
        ) : null}
      </AppShell>
    );
  }

  const existingDates = new Set(store.data.records.map((r) => r.date));
  const unit = store.data.preferences.unit;

  return (
    <AppShell
      brandAction={
        <button
          type="button"
          className="icon-btn"
          aria-label="Open settings"
          onClick={() => setScreen('settings')}
        >
          ⚙
        </button>
      }
      nav={<BottomNav screen={screen === 'settings' ? 'overview' : screen} onNavigate={setScreen} onAdd={openAdd} />}
    >
      {store.notice ? (
        <div className="notice" role="status">
          {store.notice}{' '}
          <button type="button" className="btn" onClick={() => store.setNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {store.blocked ? (
        <div className="notice" role="alert">
          Browser storage is blocked — changes will not persist. Nothing was deleted.
        </div>
      ) : null}
      {screen === 'overview' ? (
        <Overview
          records={store.data.records}
          unit={unit}
          onAdd={openAdd}
          onOpenHistory={() => setScreen('history')}
          onEdit={openEdit}
        />
      ) : null}
      {screen === 'history' ? (
        <History records={store.data.records} unit={unit} onEdit={openEdit} onAdd={openAdd} />
      ) : null}
      {screen === 'settings' ? (
        <Settings
          records={store.data.records}
          unit={unit}
          storageBlocked={store.blocked}
          onUnit={store.setUnit}
          onClear={store.clearEntries}
        />
      ) : null}
      {sheetOpen ? (
        <WeightEntrySheet
          unit={unit}
          last={[...store.data.records].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1)}
          initial={editing}
          existingDates={existingDates}
          onClose={() => {
            setSheetOpen(false);
            setEditing(undefined);
          }}
          onSave={(entry) => {
            try {
              store.upsert(entry);
            } catch {
              return;
            }
            setSheetOpen(false);
            setEditing(undefined);
            setScreen('overview');
          }}
          onDelete={(id) => {
            store.remove(id);
            setSheetOpen(false);
            setEditing(undefined);
          }}
        />
      ) : null}
    </AppShell>
  );
}
