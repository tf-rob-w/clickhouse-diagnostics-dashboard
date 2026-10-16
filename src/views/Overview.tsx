import { TimeChart, col } from '../components/Charts';
import { Banners, Gap, Kpi, Panel, Pill, Table } from '../components/ui';
import { bytes, num } from '../lib/format';
import type { Alert, Overview as O } from '../lib/types';

export function QueriesPerHour({ D }: { D: O }) {
  const hr = D.queries.hourly;
  return <TimeChart labels={hr.map(r => r.time)} series={[
    { name: 'Succeeded', values: hr.map(r => r.ok), color: col(0) },
    { name: 'Failed', values: hr.map(r => r.failed), color: 'var(--crit)' },
  ]} />;
}

export default function Overview({ D }: { D: O }) {
  const k = D.kpis, m = D.meta, rs = D.replication.summary;
  const fired = D.alerts.filter(a => a.instances > 0)
    .sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'));
  const clean = D.alerts.filter(a => !a.instances);
  const crit = fired.filter(a => a.severity === 'critical').length;
  return <>
    <Banners items={m.warnings} />
    <div className="grid kpis">
      <Kpi l="Version" v={m.version} n={`${m.mode} mode`} />
      <Kpi l="Uptime" v={m.uptime || '–'} n={`node ${(m.node || '').split('.')[0]}`} />
      <Kpi l="Data on disk" v={bytes(k.bytes)} n={`${num(k.rows)} rows`} />
      <Kpi l="Tables" v={k.tables} n={`${k.databases} user databases`} />
      <Kpi l="Active parts" v={num(k.active_parts)} n={`max ${k.max_parts_partition} per partition`} />
      <Kpi l="Memory" v={bytes(k.memory_resident)} n={k.memory_total ? `of ${bytes(k.memory_total)}` : ''} />
      <Kpi l="Alerts fired" v={fired.length} n={crit ? `${crit} critical` : `${m.alert_rules || D.alerts.length} rules checked`} />
      <Kpi l="Replicas" v={rs.tables} n={`${rs.readonly} read-only · max delay ${rs.max_delay}s`} />
    </div>
    <div className="grid two">
      <Panel title="Alerts">
        {fired.length ? <>
          <Table<Alert> cols={[
            { h: 'Severity', f: a => <Pill cls={a.severity}>{a.severity}</Pill> },
            { h: 'Rule', f: a => <><b>{a.title}</b><div className="muted mono">{a.name}</div></> },
            { h: 'Instances', k: 'instances', n: true },
          ]} rows={fired} />
          <details><summary>{clean.length} clean rules</summary>
            <div className="muted mono">{clean.map(a => a.name).join(', ')}</div></details>
        </> : <div><Pill cls="ok">No alerts fired</Pill></div>}
      </Panel>
      <Panel title="Queries per hour (7d)"><QueriesPerHour D={D} /></Panel>
      <Panel title="Server memory (hourly avg)">
        <TimeChart labels={D.series.time} series={[{ name: 'Tracked memory', values: D.series.memory }]} kind="line" fmt={bytes} />
      </Panel>
      <Panel title="Collection">
        <div>
          <Pill cls="ok">{m.collectors_ok || 0} collectors ok</Pill>{' '}
          {m.collectors_failed ? <Pill cls="warn">{m.collectors_failed} failed</Pill> : null}{' '}
          {m.collectors_empty ? <Pill cls="info">{m.collectors_empty} empty</Pill> : null}
        </div>
        <div className="muted" style={{ margin: '8px 0' }}>Started {m.started}</div>
        {D.failed_collectors.length > 0 && (
          <details><summary>Failed collectors</summary>
            {D.failed_collectors.map(f => (
              <div className="mono" style={{ marginTop: 6 }} key={f.name}><b>{f.name}</b><div className="muted">{f.error}</div></div>
            ))}
          </details>
        )}
      </Panel>
    </div>
    <Gap />
  </>;
}
