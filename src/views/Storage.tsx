import { useState } from 'react';
import { HBars } from '../components/Charts';
import { Gap, Panel, Table } from '../components/ui';
import { bytes, num } from '../lib/format';
import type { Overview } from '../lib/types';

export default function Storage({ D }: { D: Overview }) {
  const [filter, setFilter] = useState('');
  const f = filter.toLowerCase();
  const tables = D.storage.tables.filter(t => `${t.database}.${t.table}`.toLowerCase().includes(f));
  return <>
    <div className="grid two">
      <Panel title="Size by database"><HBars rows={D.storage.by_db} label={r => r.database} value={r => r.bytes} fmt={bytes} /></Panel>
      <Panel title="Disks">
        <Table cols={[
          { h: 'Disk', k: 'name' }, { h: 'Type', k: 'type' }, { h: 'Used', k: 'used_space', n: true },
          { h: 'Free', k: 'free_space', n: true }, { h: 'Free %', n: true, f: r => r.free_pct + '%' },
        ]} rows={D.storage.disks} />
      </Panel>
      <Panel title="Largest tables">
        <HBars rows={D.storage.tables.slice(0, 12)} label={r => `${r.database}.${r.table}`} value={r => r.bytes} fmt={bytes} color="var(--s3)" />
      </Panel>
      <Panel title="Most parts in one partition">
        <Table cols={[
          { h: 'Table', f: r => `${r.database}.${r.table}`, cls: 'mono' }, { h: 'Partition', f: r => String(r.partition), cls: 'mono' },
          { h: 'Parts', k: 'parts', n: true },
        ]} rows={D.storage.top_parts.slice(0, 10)} />
      </Panel>
    </div>
    <Gap />
    <Panel title="Tables">
      <input placeholder="Filter tables…" value={filter} onChange={e => setFilter(e.target.value)} style={{ marginBottom: 8, width: 260 }} />
      <Table cols={[
        { h: 'Table', f: r => `${r.database}.${r.table}`, cls: 'mono' }, { h: 'Engine', k: 'engine' },
        { h: 'Size', f: r => bytes(r.bytes), n: true }, { h: 'Rows', f: r => num(r.rows), n: true },
        { h: 'Parts', k: 'parts', n: true }, { h: 'Partitions', k: 'partitions', n: true },
        { h: 'Compression', f: r => r.ratio ? r.ratio + '×' : '–', n: true },
      ]} rows={tables} />
    </Panel>
  </>;
}
