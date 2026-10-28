import type { Screen } from '../hooks/useWeightStore';

export default function BottomNav({
  screen,
  onNavigate,
  onAdd,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  onAdd: () => void;
}) {
  return (
    <nav className="nav" aria-label="Primary">
      <button
        type="button"
        aria-current={screen === 'overview' ? 'page' : undefined}
        onClick={() => onNavigate('overview')}
      >
        Overview
      </button>
      <button type="button" className="add" onClick={onAdd} aria-label="Log weight">
        +
      </button>
      <button
        type="button"
        aria-current={screen === 'history' ? 'page' : undefined}
        onClick={() => onNavigate('history')}
      >
        History
      </button>
    </nav>
  );
}
