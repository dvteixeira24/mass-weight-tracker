export default function StatCard({
  caption,
  value,
  sub,
}: {
  caption: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card">
      <div className="stat-caption">{caption}</div>
      <div className="stat-value" aria-live="polite">
        {value}
      </div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}
