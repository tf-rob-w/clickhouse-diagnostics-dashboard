import { TimeChart } from '../components/Charts';
import { Panel, Pill, Table } from '../components/ui';
import { ms, to } from '../lib/format';
import type { Overview } from '../lib/types';

export default function Keeper({ D }: { D: Overview }) {
  const s = D.series;
  return (
    <div className="grid two">
      <Panel title="Keeper transactions per hour (7d)">
        <TimeChart labels={s.time} kind="line" series={[{ name: 'Transactions', values: s.zk_tx }]} />
      </Panel>
      <Panel title="Keeper hardware exceptions per hour">
        <TimeChart labels={s.time} series={[{ name: 'Hardware exceptions', values: s.zk_hw, color: 'var(--crit)' }]} />
      </Panel>
      <Panel title="Connections">
        <Table cols={[
          { h: 'Host', k: 'host', cls: 'mono' }, { h: 'Connected', k: 'connected_time' },
          { h: 'Session age', f: r => ms(to(r.session_uptime_elapsed_seconds) * 1000), n: true },
          { h: 'State', f: r => to(r.is_expired) ? <Pill cls="crit">expired</Pill> : <Pill cls="ok">connected</Pill> },
        ]} rows={D.keeper.connections} empty="No Keeper connection rows." />
      </Panel>
      <Panel title="Keeper probes (ruok / srvr / mntr)">
        <Table cols={[
          { h: 'Target', k: 'target', cls: 'mono' },
          { h: 'Status', f: r => <Pill cls={r.status === 'ok' ? 'ok' : 'warn'}>{r.status}</Pill> },
          { h: 'Detail', f: r => <span className="muted mono">{Object.values(r.errors)[0] || ''}</span> },
        ]} rows={D.keeper.files} empty="No keeper/ files." />
      </Panel>
    </div>
  );
}
