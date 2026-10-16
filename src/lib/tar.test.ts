import { describe, expect, it } from 'vitest';
import { readTar } from './tar';
import { collect } from './load';
import { computeOverview } from './bundle';

const enc = new TextEncoder();
function header(name: string, size: number, type = '0', prefix = '') {
  const h = new Uint8Array(512);
  h.set(enc.encode(name), 0);
  h.set(enc.encode(size.toString(8).padStart(11, '0')), 124);
  h[156] = type.charCodeAt(0);
  h.set(enc.encode('ustar'), 257);
  h.set(enc.encode(prefix), 345);
  return h;
}
function entry(name: string, body: string, type = '0', prefix = '') {
  const data = enc.encode(body);
  const pad = new Uint8Array((512 - (data.length % 512)) % 512);
  return [header(name, data.length, type, prefix), data, pad];
}
function tar(parts: Uint8Array[][]) {
  const all = [...parts.flat(), new Uint8Array(1024)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
const stream = (b: Uint8Array, chunk = 100) => new ReadableStream<Uint8Array>({
  start(c) { for (let i = 0; i < b.length; i += chunk) c.enqueue(b.subarray(i, i + chunk)); c.close(); },
});
async function gz(b: Uint8Array) {
  const s = stream(b).pipeThrough(new CompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

describe('readTar', () => {
  it('yields wanted entries across odd chunk boundaries, skips the rest, honours ustar prefix', async () => {
    const b = tar([
      entry('b', '', '5'),
      entry('a/skip.txt', 'x'.repeat(700)),
      entry('want.txt', 'hello'),
      entry('leaf.txt', 'deep', '0', 'some/long/prefix'),
    ]);
    const got: Record<string, string> = {};
    for await (const e of readTar(stream(b, 37), p => p !== 'a/skip.txt')) got[e.path] = new TextDecoder().decode(e.data);
    expect(got).toEqual({ 'want.txt': 'hello', 'some/long/prefix/leaf.txt': 'deep' });
  });
});

describe('collect + computeOverview', () => {
  it('reads a gzipped bundle archive end to end', async () => {
    const d = 'clickhouse_diagnostic_20260101_000000';
    const ts = '20260101_000000';
    const jsonl = (rows: object[]) => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
    const archive = await gz(tar([
      entry(`${d}/execution_log.txt`, 'started:  now\nmode: onprem\nSummary\ncollectors: 2 ok, 1 failed, 0 empty\n'),
      entry(`${d}/system.version_${ts}.jsonl`, jsonl([{ version: '24.8.1.1' }])),
      entry(`${d}/system.parts_${ts}.jsonl`, jsonl([
        { database: 'db', table: 't', partition_id: 'p', bytes_on_disk: '100', rows: '10', active: 1, engine: 'MergeTree', data_uncompressed_bytes: '300' },
        { database: 'db', table: 't', partition_id: 'p', bytes_on_disk: '50', rows: '5', active: 0, engine: 'MergeTree' },
      ])),
      entry(`${d}/system.columns_${ts}.jsonl`, '{"ignored":true}\n'),
    ]));
    const file = new File([archive as BlobPart], `${d}.tar.gz`);
    const bundles = await collect([{ path: file.name, file }]);
    expect([...bundles.keys()]).toEqual([d]);
    expect([...bundles.get(d)!.keys()].sort()).toEqual(['execution_log.txt', `system.parts_${ts}.jsonl`, `system.version_${ts}.jsonl`]);
    const o = computeOverview(d, bundles.get(d)!);
    expect(o.meta.version).toBe('24.8.1.1');
    expect(o.meta.collectors_failed).toBe(1);
    expect(o.kpis).toMatchObject({ active_parts: 1, bytes: 100, rows: 10 });
    expect(o.storage.tables[0]).toMatchObject({ database: 'db', table: 't', ratio: 3 });
  });
});
