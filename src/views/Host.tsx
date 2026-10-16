import { Banners, Panel, Table } from '../components/ui';
import type { Overview } from '../lib/types';

export default function Host({ D }: { D: Overview }) {
  const hi = D.host, notes: string[] = hi.notes || [];
  return <>
    <Banners items={D.meta.warnings} />
    <div className="grid two">
      <Panel title="Host facts">
        {hi.cpu?.available || hi.memory?.available
          ? <pre className="mono">{JSON.stringify(hi, null, 2)}</pre>
          : <div className="empty">Host facts unavailable. {notes.join(' ')}</div>}
      </Panel>
      <Panel title="Clusters">
        <Table cols={[
          { h: 'Cluster', k: 'cluster' }, { h: 'Shard', k: 'shard_num', n: true }, { h: 'Replica', k: 'replica_num', n: true },
          { h: 'Host', k: 'host_name', cls: 'mono' }, { h: 'Local', f: r => r.is_local ? 'yes' : '' }, { h: 'Errors', k: 'errors_count', n: true },
        ]} rows={D.clusters} empty="No clusters." />
      </Panel>
    </div>
  </>;
}
