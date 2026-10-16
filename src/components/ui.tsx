import type { ReactNode } from 'react';

export const Kpi = ({ l, v, n }: { l: ReactNode; v: ReactNode; n?: ReactNode }) => (
  <div className="card kpi"><div className="v">{v}</div><div className="l">{l}</div>{n ? <div className="n">{n}</div> : null}</div>
);
export const Pill = ({ cls, children }: { cls: string; children: ReactNode }) => <span className={`pill ${cls}`}>{children}</span>;
export const Panel = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <div className="card"><h2>{title}</h2>{children}</div>
);
export const Gap = () => <div className="row-gap" />;
export const Banners = ({ items }: { items: string[] }) => <>{items.map((w, i) => <div className="banner" key={i}>{w}</div>)}</>;
export const QText = ({ children }: { children: ReactNode }) => <div className="q mono">{children}</div>;

export interface Col<T> { h: ReactNode; k?: keyof T & string; f?: (r: T) => ReactNode; n?: boolean; cls?: string }

export function Table<T>({ cols, rows, empty = 'Nothing to show.' }: { cols: Col<T>[]; rows: T[]; empty?: string }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="scroll"><table>
      <thead><tr>{cols.map((c, i) => <th key={i} className={c.n ? 'n' : ''}>{c.h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}>{cols.map((c, j) => (
          <td key={j} className={`${c.n ? 'n ' : ''}${c.cls || ''}`}>{c.f ? c.f(r) : r[c.k!] == null ? '' : String(r[c.k!])}</td>
        ))}</tr>
      ))}</tbody>
    </table></div>
  );
}
