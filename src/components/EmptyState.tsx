export default function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 24 }}>
      <h2>No measurements yet</h2>
      <p style={{ color: 'var(--mass-muted)' }}>Tap below to log your first weight.</p>
      <button type="button" className="btn primary" onClick={onAdd}>
        Add entry
      </button>
    </div>
  );
}
