import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { computeOverview } from './lib/bundle';
import { collect, fromDataTransfer, fromInput, type Picked } from './lib/load';
import type { Overview as O } from './lib/types';
import Overview from './views/Overview';
import Storage from './views/Storage';
import Queries from './views/Queries';
import Replication from './views/Replication';
import Parts from './views/Parts';
import Keeper from './views/Keeper';
import Errors from './views/Errors';
import Host from './views/Host';

const TABS: [string, string, ComponentType<{ D: O }>][] = [
  ['overview', 'Overview', Overview], ['storage', 'Storage', Storage], ['queries', 'Queries', Queries],
  ['replication', 'Replication', Replication], ['parts', 'Parts & merges', Parts], ['keeper', 'Keeper', Keeper],
  ['errors', 'Errors', Errors], ['host', 'Host & clusters', Host],
];
const tabFromHash = () => {
  const h = location.hash.slice(1);
  return TABS.some(t => t[0] === h) ? h : 'overview';
};
const tick = () => new Promise(r => setTimeout(r));

type Theme = 'light' | 'dark' | null;
const readTheme = (): Theme => {
  try { const t = localStorage.theme; return t === 'light' || t === 'dark' ? t : null; } catch { return null; }
};

export default function App() {
  const [bundles, setBundles] = useState<O[]>([]);
  const [current, setCurrent] = useState('');
  const [tab, setTab] = useState(tabFromHash);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const fileIn = useRef<HTMLInputElement>(null);
  const dirIn = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const r = document.documentElement;
    if (theme) r.dataset.theme = theme; else delete r.dataset.theme;
  }, [theme]);
  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const open = useCallback(async (picked: Picked[]) => {
    if (!picked.length) return;
    setError('');
    try {
      setStatus('Reading…');
      const raw = await collect(picked, setStatus);
      const loaded: O[] = [];
      for (const [name, files] of raw) {
        if (![...files.keys()].some(k => k === 'execution_log.txt' || k.endsWith('.jsonl'))) continue;
        setStatus(`Analysing ${name}…`);
        await tick();
        loaded.push(computeOverview(name, files));
      }
      if (!loaded.length) throw new Error('No clickhouse_diagnostic bundle found in that selection.');
      loaded.sort((a, b) => (a.name < b.name ? 1 : -1));
      setBundles(prev => [...loaded, ...prev.filter(p => !loaded.some(l => l.name === p.name))]
        .sort((a, b) => (a.name < b.name ? 1 : -1)));
      setCurrent(loaded[0].name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('');
    }
  }, []);

  // Window-wide drag & drop.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true); } };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false); } };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; setDragging(false);
      fromDataTransfer(e.dataTransfer!).then(open);
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over); window.removeEventListener('drop', drop);
    };
  }, [open]);

  const D = bundles.find(b => b.name === current) ?? null;
  const View = TABS.find(t => t[0] === tab)![2];
  const toggleTheme = () => {
    const dark = getComputedStyle(document.documentElement).colorScheme === 'dark';
    const next: Theme = dark ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.theme = next; } catch { /* storage unavailable */ }
  };
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    open(fromInput(e.target.files));
    e.target.value = '';
  };

  return <>
    <header>
      <h1>ClickHouse Diagnostics</h1>
      {bundles.length > 0 && (
        <select aria-label="Bundle" value={current} onChange={e => setCurrent(e.target.value)}>
          {bundles.map(b => <option key={b.name}>{b.name}</option>)}
        </select>
      )}
      {D && <span className="sub">{D.meta.version} · {D.meta.mode} · up {D.meta.uptime || '?'}</span>}
      <span className="sp" />
      {status && <span className="sub">{status}</span>}
      <button onClick={() => fileIn.current?.click()}>Open archive…</button>
      <button onClick={() => dirIn.current?.click()}>Open folder…</button>
      <button onClick={toggleTheme} title="Toggle theme">◐</button>
      <input ref={fileIn} type="file" hidden multiple accept=".gz,.tgz,.tar" onChange={pick} />
      <input ref={dirIn} type="file" hidden multiple onChange={pick}
        {...{ webkitdirectory: '', directory: '' } as Record<string, string>} />
    </header>
    {D && (
      <nav>
        {TABS.map(([k, label]) => (
          <button key={k} className={k === tab ? 'on' : ''} onClick={() => { location.hash = k; setTab(k); }}>{label}</button>
        ))}
      </nav>
    )}
    <main>
      {error && <div className="err">{error}</div>}
      {D ? <View D={D} /> : (
        <div className={`drop${dragging ? ' over' : ''}`}>
          <h2>Open a diagnostic bundle</h2>
          <p>Drop a <span className="mono">clickhouse_diagnostic_*.tar.gz</span>, an extracted bundle folder, or a whole <span className="mono">clickhouse_results</span> folder here.</p>
          <p className="muted">Everything is read and analysed in this browser tab. Nothing is uploaded.</p>
          <div className="actions">
            <button className="primary" onClick={() => fileIn.current?.click()} disabled={!!status}>Choose archive…</button>
            <button onClick={() => dirIn.current?.click()} disabled={!!status}>Choose folder…</button>
          </div>
          {status && <p>{status}</p>}
        </div>
      )}
    </main>
    {D && dragging && <div className="overlay">Drop to add bundle</div>}
  </>;
}
