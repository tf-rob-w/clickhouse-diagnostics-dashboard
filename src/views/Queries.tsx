import type { ReactNode } from 'react';
import { HBars, TimeChart } from '../components/Charts';
import { Gap, Panel, QText, Table, type Col } from '../components/ui';
import { bytes, ms, num } from '../lib/format';
import type { Overview, QueryHash } from '../lib/types';
import { QueriesPerHour } from './Overview';

function QueryTable({ rows, extra }: { rows: QueryHash[]; extra: Col<QueryHash>[] }) {
  return <Table cols={[
    { h: 'Query (sample)', f: r => <>
        <QText>{r.query || '(no text)'}</QText>
        <div className="muted">{r.user} · {r.kind} · {String(r.table ?? '')}</div></> },
    { h: 'Runs', f: r => num(r.count), n: true },
    ...extra,
  ]} rows={rows} />;
}
const Section = ({ title, children }: { title: string; children: ReactNode }) => <><Panel title={title}>{children}</Panel><Gap /></>;

export default function Queries({ D }: { D: Overview }) {
  const q = D.queries, c = D.coord;
  return <>
    <div className="grid two">
      <Panel title="Queries per hour"><QueriesPerHour D={D} /></Panel>
      <Panel title="Select / insert volume (3d, server counters)">
        <TimeChart labels={c.time} series={[{ name: 'Select', values: c.select }, { name: 'Insert', values: c.insert, color: 'var(--s2)' }]} />
      </Panel>
      <Panel title="By user"><HBars rows={q.users} label={r => r.user || '(unknown)'} value={r => r.queries} /></Panel>
      <Panel title="By kind"><HBars rows={q.kinds} label={r => r.kind} value={r => r.count} color="var(--s7)" /></Panel>
    </div>
    <Gap />
    <Section title="Top queries by total time">
      <QueryTable rows={q.top_time} extra={[
        { h: 'Avg', f: r => ms(r.avg_ms), n: true }, { h: 'Total', f: r => ms(r.duration_ms), n: true },
        { h: 'Max mem', f: r => bytes(r.max_memory), n: true }]} />
    </Section>
    <Section title="Top queries by data read">
      <QueryTable rows={q.top_read} extra={[{ h: 'Read', f: r => bytes(r.read_bytes), n: true }, { h: 'Rows', f: r => num(r.read_rows), n: true }]} />
    </Section>
    <Panel title="Failing queries">
      <QueryTable rows={q.top_failed} extra={[{ h: 'Failed', k: 'failed', n: true }, { h: 'Exception', f: r => <QText>{r.exception}</QText> }]} />
    </Panel>
  </>;
}
