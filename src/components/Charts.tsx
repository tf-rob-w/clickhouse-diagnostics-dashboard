import { useRef, useState } from 'react';
import { bytes as fmtBytes, num } from '../lib/format';

const COLORS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
export const col = (i: number) => `var(${COLORS[i % 8]})`;

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export interface Series { name: string; values: number[]; color?: string }
interface TimeChartProps {
  labels: string[];
  series: Series[];
  kind?: 'bar' | 'line';
  fmt?: (v: number) => string;
  height?: number;
}

/** Stacked bars or lines over a shared time axis, with a hover crosshair and tooltip. */
export function TimeChart({ labels, series, kind = 'bar', fmt = num, height = 190 }: TimeChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; left: number; top: number } | null>(null);
  if (!labels.length) return <div className="empty">No data in this bundle.</div>;

  const W = 640, H = height, m = { l: 46, r: 8, t: 8, b: 22 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = labels.length;
  const totals = labels.map((_, i) => kind === 'bar'
    ? series.reduce((a, s) => a + (s.values[i] || 0), 0)
    : Math.max(...series.map(s => s.values[i] || 0)));
  let max = Math.max(...totals, 1e-9);
  const step = niceStep(max / 4);
  max = Math.ceil(max / step) * step;
  const x = (i: number) => m.l + (kind === 'bar' ? (i + .5) * iw / n : n === 1 ? iw / 2 : i * iw / (n - 1));
  const y = (v: number) => m.t + ih - v / max * ih;
  const every = Math.ceil(n / 8);
  const bw = Math.max(1, Math.min(18, iw / n - 1.5));
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current!, wrap = wrapRef.current!;
    const r = svg.getBoundingClientRect(), er = wrap.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W - m.l;
    const i = Math.max(0, Math.min(n - 1, kind === 'bar' ? Math.floor(px / iw * n) : Math.round(px / iw * (n - 1))));
    setHover({ i, left: x(i) / W * r.width + (r.left - er.left), top: e.clientY - er.top + 10 });
  };

  return (
    <div className="chart" ref={wrapRef}>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s, k) => <span key={s.name}><i style={{ background: s.color || col(k) }} />{s.name}</span>)}
        </div>
      )}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img">
        {ticks.map(v => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)">{fmt(v)}</text>
          </g>
        ))}
        {labels.map((l, i) => i % every === 0 && (
          <text key={i} x={x(i)} y={H - 5} textAnchor="middle" fontSize="10.5" fill="var(--muted)">
            {l.slice(5, 13).replace(' ', ' ')}{l.length > 10 ? 'h' : ''}
          </text>
        ))}
        {kind === 'bar'
          ? labels.map((_, i) => {
              let acc = 0;
              return series.map((s, k) => {
                const v = s.values[i] || 0;
                if (!v) return null;
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return <rect key={`${i}-${k}`} x={x(i) - bw / 2} y={y1} width={bw} height={Math.max(0, y0 - y1 - (acc > v ? 1 : 0))}
                  rx={k === series.length - 1 ? 2 : 0} fill={s.color || col(k)} />;
              });
            })
          : series.map((s, k) => (
              <polyline key={s.name} fill="none" stroke={s.color || col(k)} strokeWidth="2" strokeLinejoin="round"
                points={labels.map((_, i) => `${x(i)},${y(s.values[i] || 0)}`).join(' ')} />
            ))}
        {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={m.t} y2={m.t + ih} stroke="var(--muted)" strokeDasharray="3 3" />}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover && <Tip left={hover.left} top={hover.top} wrap={wrapRef.current!}>
        <b>{labels[hover.i]}</b>
        {series.map((s, k) => (
          <div key={s.name}><i style={{ background: s.color || col(k) }} />{s.name}: <b>{fmt(s.values[hover.i] || 0)}</b></div>
        ))}
      </Tip>}
    </div>
  );
}

function Tip({ left, top, wrap, children }: { left: number; top: number; wrap: HTMLElement; children: React.ReactNode }) {
  // Clamp inside the chart once the tooltip has a measured width.
  const ref = (el: HTMLDivElement | null) => {
    if (!el) return;
    el.style.left = Math.min(Math.max(left - el.offsetWidth / 2, 0), wrap.clientWidth - el.offsetWidth) + 'px';
    el.style.top = Math.max(top - el.offsetHeight - 10, 0) + 'px';
  };
  return <div className="tip" ref={ref} style={{ display: 'block' }}>{children}</div>;
}

/** Horizontal bars for a ranked list. */
export function HBars<T>({ rows, label, value, fmt = num, color = 'var(--s1)' }:
  { rows: T[]; label: (r: T) => string; value: (r: T) => number; fmt?: (v: number) => string; color?: string }) {
  if (!rows.length) return <div className="empty">Nothing to show.</div>;
  const max = Math.max(...rows.map(value), 1);
  return (
    <table><tbody>
      {rows.map((r, i) => (
        <tr key={i}>
          <td style={{ width: '38%' }} className="mono" title={label(r)}>{label(r)}</td>
          <td><div className="bar"><div style={{ width: `${value(r) / max * 100}%`, background: color }} /></div></td>
          <td className="n">{fmt(value(r))}</td>
        </tr>
      ))}
    </tbody></table>
  );
}

export const byteFmt = fmtBytes;
