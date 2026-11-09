import { useEffect, useRef, useState } from 'react';
import { money } from '../calc.js';

const SERIES = [
  { key: 'revenue', label: 'Виручка', color: 'var(--series-1)' },
  { key: 'profit', label: 'Валовий прибуток', color: 'var(--series-2)' },
];
const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Згруповані стовпчики «виручка / прибуток» з підказкою при наведенні. */
export default function BarChart({ data, byMonth, currency }) {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = 240;
  const pad = { l: 56, r: 8, t: 12, b: 28 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const maxV = niceMax(Math.max(0, ...data.map((d) => Math.max(d.revenue, d.profit))));
  const minV = Math.min(0, ...data.map((d) => d.profit));
  const lo = minV < 0 ? -niceMax(-minV) : 0;
  const y = (v) => pad.t + ih - ((v - lo) / (maxV - lo)) * ih;
  const step = iw / data.length;
  const bw = Math.max(1, Math.min(18, (step - 4) / 2));
  const ticks = [lo, ...[0.25, 0.5, 0.75, 1].map((k) => lo + (maxV - lo) * k)].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(iw / 44)));
  const fmtLabel = (d) => (byMonth ? `${MONTHS[d.date.getMonth()]} ${String(d.date.getFullYear()).slice(2)}` : `${d.date.getDate()}.${String(d.date.getMonth() + 1).padStart(2, '0')}`);
  const short = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v));

  const bar = (x, v, color, key) => {
    const y0 = y(0);
    const y1 = y(v);
    const top = Math.min(y0, y1);
    const height = Math.max(Math.abs(y1 - y0), v === 0 ? 0 : 1);
    const r = Math.min(4, bw / 2, height);
    // скруглений лише «вільний» кінець стовпчика
    const path = v >= 0
      ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y0} Z`
      : `M${x},${y0} V${top + height - r} Q${x},${top + height} ${x + r},${top + height} H${x + bw - r} Q${x + bw},${top + height} ${x + bw},${top + height - r} V${y0} Z`;
    return <path key={key} d={path} fill={color} />;
  };

  const hv = hover != null ? data[hover] : null;

  return (
    <div className="chart viz-root" ref={ref}>
      <div className="legend">
        {SERIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <svg width={w} height={h} role="img" aria-label="Графік виручки та прибутку">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis-text">{short(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = pad.l + i * step + (step - (bw * 2 + 2)) / 2;
          return (
            <g key={d.key}>
              {hover === i && <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} className="hover-band" />}
              {bar(x0, d.revenue, SERIES[0].color, 'r')}
              {bar(x0 + bw + 2, d.profit, SERIES[1].color, 'p')}
              {i % labelEvery === 0 && <text x={pad.l + i * step + step / 2} y={h - 8} textAnchor="middle" className="axis-text">{fmtLabel(d)}</text>}
              <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)} />
            </g>
          );
        })}
        <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} className="axis-line" />
      </svg>
      {hv && (
        <div className="tooltip" style={{ left: Math.min(w - 170, Math.max(0, pad.l + hover * step + step / 2 - 80)) }}>
          <div className="tt-title">{byMonth ? fmtLabel(hv) : hv.date.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' })}</div>
          {SERIES.map((s) => <div key={s.key} className="tt-row"><i style={{ background: s.color }} /><span>{s.label}</span><b>{money(hv[s.key], currency)}</b></div>)}
          <div className="tt-row"><span className="muted">Продано</span><b>{hv.qty} шт</b></div>
        </div>
      )}
    </div>
  );
}
