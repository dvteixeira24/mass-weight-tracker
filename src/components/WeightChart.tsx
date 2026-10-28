import { useState } from 'react';
import { gramsToDisplay, type WeightRecord, type WeightUnit } from '../domain/weight';

function parseLocal(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export default function WeightChart({
  entries,
  unit,
}: {
  entries: WeightRecord[];
  unit: WeightUnit;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  if (entries.length < 2) {
    return (
      <div className="chart-wrap" role="img" aria-label="Weight chart unavailable">
        <p style={{ color: 'var(--mass-muted)' }}>
          {entries.length === 0
            ? 'No measurements in this period. Add your first entry to start the trend.'
            : 'Only one measurement in this period. Add another day to draw the trend.'}
        </p>
      </div>
    );
  }
  const vals = entries.map((r) => gramsToDisplay(r.weightGrams, unit));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max((max - min) * 0.25, unit === 'kg' ? 0.5 : 1);
  const floor = min - pad;
  const ceil = max + pad;
  const W = 350;
  const H = 190;
  const left = 8;
  const right = 318;
  const top = 12;
  const bottom = 158;
  const t0 = parseLocal(entries[0].date).getTime();
  const t1 = parseLocal(entries[entries.length - 1].date).getTime();
  const span = Math.max(1, t1 - t0);
  const px = (r: WeightRecord) => left + ((parseLocal(r.date).getTime() - t0) / span) * (right - left);
  const py = (v: number) => bottom - ((v - floor) / (ceil - floor)) * (bottom - top);
  const pts = entries.map((r, i) => ({ x: px(r), y: py(vals[i]), r, v: vals[i] }));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L${pts[pts.length - 1].x.toFixed(1)},${bottom} L${pts[0].x.toFixed(1)},${bottom} Z`;
  const fmtTick = (d: string) =>
    parseLocal(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const sel = selected !== null ? pts[selected] : null;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weight trend, ${entries.length} entries`}>
        <defs>
          <linearGradient id="massArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c5f17c" stopOpacity="0.21" />
            <stop offset="100%" stopColor="#c5f17c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.33, 0.66, 1].map((t) => {
          const y = top + (bottom - top) * t;
          const label = (ceil - (ceil - floor) * t).toFixed(1);
          return (
            <g key={t}>
              <line x1="0" y1={y} x2={W} y2={y} stroke="#344138" strokeDasharray="2 5" />
              <text x={W - 2} y={y - 4} textAnchor="end" fill="#77877a" fontSize="9">
                {label}
              </text>
            </g>
          );
        })}
        <path d={area} fill="url(#massArea)" />
        <path d={path} fill="none" stroke="#c5f17c" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={p.r.id}>
            <circle
              className="chart-point"
              cx={p.x}
              cy={p.y}
              r={10}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${p.r.date}, ${p.v.toFixed(1)} ${unit}`}
              onClick={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(i);
                }
              }}
            />
            <circle cx={p.x} cy={p.y} r={i === selected ? 4.5 : 2.4} fill="#c5f17c" pointerEvents="none" />
          </g>
        ))}
        <text x={0} y={H - 4} fill="#9aa59b" fontSize="10">
          {fmtTick(entries[0].date)}
        </text>
        <text x={W / 2} y={H - 4} textAnchor="middle" fill="#9aa59b" fontSize="10">
          {fmtTick(entries[Math.floor((entries.length - 1) / 2)].date)}
        </text>
        <text x={W} y={H - 4} textAnchor="end" fill="#9aa59b" fontSize="10">
          {fmtTick(entries[entries.length - 1].date)}
        </text>
      </svg>
      <div aria-live="polite" style={{ minHeight: 22, fontSize: 13, color: 'var(--mass-muted)' }}>
        {sel ? `${sel.r.date}: ${sel.v.toFixed(1)} ${unit}` : `${entries.length} entries`}
      </div>
      <details>
        <summary style={{ cursor: 'pointer', minHeight: 44 }}>Data table</summary>
        <table className="sr-only" style={{ position: 'static', width: '100%', clip: 'auto' }}>
          <caption>Weight entries in period</caption>
          <tbody>
            {entries.map((r, i) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>
                  {vals[i].toFixed(1)} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ol style={{ fontSize: 13, color: 'var(--mass-muted)', paddingLeft: 18 }}>
          {entries.map((r, i) => (
            <li key={r.id}>
              {r.date}: {vals[i].toFixed(1)} {unit}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
