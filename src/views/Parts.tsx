import { TimeChart } from '../components/Charts';
import { Gap, Panel, Pill, QText, Table } from '../components/ui';
import { bytes, ms, num } from '../lib/format';
import type { Overview } from '../lib/types';

export default function Parts({ D }: { D: Overview }) {
  const pl = D.part_log.hourly;
  const types = [...new Set(pl.flatMap(r => Object.keys(r).filter(k => k !== 'time')))];
  return <>
    <div className="grid two">
      <Panel title="Part activity per hour (3d)">
        <TimeChart labels={pl.map(r => r.time)} series={types.map(t => ({ name: t, values: pl.map(r => Number(r[t]) || 0) }))} />
      </Panel>
      <Panel title="Failed background operations">
        <Table cols={[
          { h: 'Event', k: 'event_type' }, { h: 'Code', k: 'code', n: true }, { h: 'Table', k: 'table', cls: 'mono' },
          { h: 'Count', k: 'count', n: true }, { h: 'Example', f: r => <QText>{r.example}</QText> },
        ]} rows={D.part_log.errors} empty="No failed merges, fetches or mutations." />
      </Panel>
      <Panel title="Pending mutations">
        <Table cols={[
          { h: 'Table', f: r => `${r.database}.${r.table}`, cls: 'mono' }, { h: 'Command', f: r => <QText>{r.command}</QText> },
          { h: 'Created', k: 'create_time' }, { h: 'Parts left', k: 'parts_to_do', n: true },
        ]} rows={D.mutations} empty="No mutations in progress." />
      </Panel>
      <Panel title="Detached parts">
        <Table cols={[
          { h: 'Table', f: r => `${r.database}.${r.table}`, cls: 'mono' }, { h: 'Reason', k: 'reason' },
          { h: 'Parts', k: 'count', n: true }, { h: 'Size', f: r => bytes(r.bytes), n: true },
        ]} rows={D.detached} empty="None." />
      </Panel>
    </div>
    <Gap />
    <Panel title="Materialized views (3d)">
      <Table cols={[
        { h: 'View', k: 'view', cls: 'mono' }, { h: 'Target', k: 'target', cls: 'mono' },
        { h: 'Runs', f: r => num(r.executions), n: true },
        { h: 'Failed', f: r => r.failed ? <Pill cls="crit">{r.failed}</Pill> : '0', n: true },
        { h: 'Rows written', f: r => num(r.written_rows), n: true }, { h: 'Time', f: r => ms(r.ms), n: true },
      ]} rows={D.views} empty="No materialized view activity." />
    </Panel>
  </>;
}
