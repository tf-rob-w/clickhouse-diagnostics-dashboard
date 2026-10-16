import { TimeChart } from '../components/Charts';
import { Kpi, Panel, QText, Table } from '../components/ui';
import { num } from '../lib/format';
import type { Overview } from '../lib/types';

export default function Errors({ D }: { D: Overview }) {
  const hist = D.errors.history;
  const times = [...new Set(hist.flatMap(e => e.hours.map(x => x.time)))].sort();
  return <>
    <div className="grid kpis">{Object.entries(D.errors.events).map(([k, v]) => <Kpi key={k} l={k} v={num(v)} />)}</div>
    <div className="grid two">
      <Panel title="Errors per hour by type (7d)">
        <TimeChart labels={times} series={hist.map(e => ({ name: e.error, values: times.map(t => e.hours.find(x => x.time === t)?.n || 0) }))} />
      </Panel>
      <Panel title="Counters since server start">
        <div className="muted" style={{ marginBottom: 6 }}>Cumulative: compare with uptime ({D.meta.uptime}), not a rate.</div>
        <Table cols={[
          { h: 'Error', k: 'name', cls: 'mono' }, { h: 'Code', k: 'code', n: true }, { h: 'Count', f: r => num(r.value), n: true },
          { h: 'Last seen', k: 'last_error_time' }, { h: 'Message', f: r => <QText>{r.last_error_message}</QText> },
        ]} rows={D.errors.current} empty="No errors recorded." />
      </Panel>
    </div>
  </>;
}
