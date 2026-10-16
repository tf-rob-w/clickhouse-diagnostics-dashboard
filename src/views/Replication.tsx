import { TimeChart, col } from '../components/Charts';
import { Gap, Kpi, Panel, Pill, Table } from '../components/ui';
import { to } from '../lib/format';
import type { Overview } from '../lib/types';

export default function Replication({ D }: { D: Overview }) {
  const s = D.replication.summary, ser = D.series, c = D.coord;
  return <>
    <div className="grid kpis">
      <Kpi l="Replicated tables" v={s.tables} /><Kpi l="Read-only" v={s.readonly} /><Kpi l="Max delay" v={`${s.max_delay} s`} />
      <Kpi l="Queue entries" v={s.queue_total} /><Kpi l="Missing replicas" v={s.degraded} />
    </div>
    <div className="grid two">
      <Panel title="Background pools (hourly avg tasks)">
        <TimeChart labels={ser.time} kind="line" fmt={v => (+v).toFixed(2)} series={[
          { name: 'Merge', values: ser.merge_pool }, { name: 'Fetch', values: ser.fetch_pool }, { name: 'Schedule', values: ser.schedule_pool }]} />
      </Panel>
      <Panel title="Delayed / rejected inserts (3d)">
        <TimeChart labels={c.time} series={[{ name: 'Delayed', values: c.delayed, color: col(3) }, { name: 'Rejected', values: c.rejected, color: 'var(--crit)' }]} />
      </Panel>
    </div>
    <Gap />
    <Panel title="Replicas">
      <Table cols={[
        { h: 'Table', f: r => `${r.database}.${r.table}`, cls: 'mono' },
        { h: 'State', f: r => to(r.is_readonly) ? <Pill cls="crit">read-only</Pill> : to(r.is_session_expired) ? <Pill cls="crit">expired</Pill>
            : to(r.active_replicas) < to(r.total_replicas) ? <Pill cls="warn">degraded</Pill> : <Pill cls="ok">ok</Pill> },
        { h: 'Replicas', f: r => `${r.active_replicas}/${r.total_replicas}`, n: true },
        { h: 'Delay', f: r => `${r.absolute_delay} s`, n: true }, { h: 'Queue', k: 'queue_size', n: true },
        { h: 'Inserts', k: 'inserts_in_queue', n: true }, { h: 'Merges', k: 'merges_in_queue', n: true },
        { h: 'Leader', f: r => to(r.is_leader) ? 'yes' : '' },
      ]} rows={D.replication.replicas} />
    </Panel>
  </>;
}
