/**
 * Aggregation of one extracted clickhouse-diagnostic bundle into the dashboard's `Overview` model.
 * Ported from the former Python results server; reads only the bundle files `wantedFile` accepts.
 */
import type { Alert, Overview, QueryHash, Row } from './types';

export const BUNDLE_RE = /^clickhouse_(diagnostic|backup)_\d{8}_\d{6}$/;

/** Bundle-relative file path -> decoded text. Only files `wantedFile` accepts are ever loaded. */
export type BundleFiles = Map<string, string>;

const TABLES = [
  'version', 'asynchronous_metrics', 'metrics', 'events', 'parts', 'tables', 'databases', 'replicas',
  'metric_log_7_days', 'metric_log_coordination_3_days', 'query_log_details_7_days', 'part_log_3_days',
  'mutations', 'detached_parts', 'query_views_log_3_days', 'errors', 'error_log_7_days', 'disks',
  'zookeeper_connection', 'clusters',
];
const tableRe = (t: string) => new RegExp(`^system\\.${t}_(\\d+_days?_)?\\d{8}_\\d{6}\\.jsonl$`);
const TABLE_RES = TABLES.map(tableRe);

/** Files inside a bundle that the viewer needs; everything else (text_log, columns, …) is skipped. */
export function wantedFile(rel: string): boolean {
  return rel === 'execution_log.txt' || rel === 'dashboard.html' || rel === 'host_info.json' ||
    /^keeper\/[^/]+\.txt$/.test(rel) || TABLE_RES.some(re => re.test(rel));
}

export const toInt = (v: unknown, d = 0): number => {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v == null || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};
export const toFloat = (v: unknown, d = 0): number => {
  if (v == null || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Python-style truthiness for JSON values ([] and {} are falsy). */
const truthy = (v: unknown) =>
  Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v;
const str = (v: unknown, max?: number) => {
  const s = v == null ? '' : String(v);
  return max ? s.slice(0, max) : s;
};
/** Python-style round(x, digits): rounds the exact binary value (Math.round(x*10^d) can be off by one ulp). */
const round = (x: number, digits: number) => Number(x.toFixed(digits));
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const key = (...p: unknown[]) => p.map(String).join('\u0000');

function defaultMap<K, V>(make: () => V) {
  const m = new Map<K, V>();
  return { m, get(k: K) { let v = m.get(k); if (v === undefined) { v = make(); m.set(k, v); } return v; } };
}

class BundleData {
  constructor(readonly name: string, readonly files: BundleFiles) {}

  rows(table: string): Row[] {
    const re = tableRe(table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const hit = [...this.files.keys()].filter(k => re.test(k)).sort()[0];
    if (!hit) return [];
    const out: Row[] = [];
    for (const line of this.files.get(hit)!.split('\n')) {
      const l = line.trim();
      if (!l) continue;
      try { out.push(JSON.parse(l)); } catch { /* skip malformed line */ }
    }
    return out;
  }

  text(rel: string) { return this.files.get(rel) ?? ''; }

  executionLog() {
    const txt = this.text('execution_log.txt');
    const head: Record<string, string> = {};
    for (const line of txt.split('Summary')[0].split(/\r?\n/)) {
      const m = /^(\w[\w-]*):\s+(.*)$/.exec(line);
      if (m) head[m[1]] = m[2].trim();
    }
    const summ: Record<string, number> = {};
    let m = /collectors:\s+(\d+) ok, (\d+) failed, (\d+) empty/.exec(txt);
    if (m) { summ.collectors_ok = +m[1]; summ.collectors_failed = +m[2]; summ.collectors_empty = +m[3]; }
    m = /alerts:\s+(\d+) rules — (\d+) fired, (\d+) clean, (\d+) failed, (\d+) skipped/.exec(txt);
    if (m) {
      ['alert_rules', 'alerts_fired', 'alerts_clean', 'alerts_failed', 'alerts_skipped']
        .forEach((k, i) => { summ[k] = +m![i + 1]; });
    }
    const failed: { name: string; error: string }[] = [];
    const sec = /Failed collectors.*?\n-+\n(.*?)\n\n/s.exec(txt);
    if (sec) {
      for (const l0 of sec[1].split(/\r?\n/)) {
        const l = l0.trim();
        if (l) {
          const name = l.split(/\s+/)[0];
          failed.push({ name, error: l.slice(name.length).trim().slice(0, 300) });
        }
      }
    }
    return { head, summ, failed };
  }

  dashboardData(): Row {
    const m = /^const DATA = (\{.*\});?\s*$/m.exec(this.text('dashboard.html'));
    if (!m) return {};
    try { return JSON.parse(m[1]); } catch { return {}; }
  }

  keeperFiles(): Overview['keeper']['files'] {
    const out: Overview['keeper']['files'] = [];
    for (const p of [...this.files.keys()].filter(k => /^keeper\/[^/]+\.txt$/.test(k)).sort()) {
      const t = this.files.get(p)!;
      const target = /# target: (.*)/.exec(t);
      const cmds: Record<string, string> = {};
      for (const part of t.split(/^## /m).slice(1)) {
        const nl = part.indexOf('\n');
        const k = nl < 0 ? part : part.slice(0, nl);
        cmds[k.trim()] = (nl < 0 ? '' : part.slice(nl + 1)).trim();
      }
      const bad = Object.keys(cmds).filter(k => cmds[k].startsWith('error:'));
      out.push({
        target: target ? target[1] : p.split('/').pop()!,
        status: !bad.length ? 'ok' : bad.length === Object.keys(cmds).length ? 'failed' : 'partial',
        errors: Object.fromEntries(bad.map(k => [k, cmds[k]])),
        mode: (/Mode: (\w+)/.exec(t) || [null, null])[1],
      });
    }
    return out;
  }

  overview(): Overview {
    const { head, summ, failed } = this.executionLog();
    const dash = this.dashboardData();
    const version = (this.rows('version')[0] || {}).version ?? '';
    const am: Row = Object.fromEntries(this.rows('asynchronous_metrics').map(r => [r.metric, r.value]));
    const metrics: Row = Object.fromEntries(this.rows('metrics').map(r => [r.metric, r.value]));
    const events: Record<string, number> = Object.fromEntries(this.rows('events').map(r => [r.event, toInt(r.value)]));

    const parts = this.rows('parts').filter(p => (p.active ?? 1) === 1);
    const tablesMeta = new Map<string, Row>();
    for (const t of this.rows('tables')) tablesMeta.set(key(t.database, t.name), t);

    // ---- storage
    const byDb = defaultMap<string, { bytes: number; rows: number; parts: number }>(() => ({ bytes: 0, rows: 0, parts: 0 }));
    const byTbl = defaultMap<string, { d: string; t: string; bytes: number; rows: number; parts: number; uncompressed: number; partitions: Set<unknown>; engine: string }>(
      () => ({ d: '', t: '', bytes: 0, rows: 0, parts: 0, uncompressed: 0, partitions: new Set(), engine: '' }));
    const partCount = defaultMap<string, { d: string; t: string; pid: unknown; n: number }>(() => ({ d: '', t: '', pid: null, n: 0 }));
    for (const p of parts) {
      const b = toInt(p.bytes_on_disk), r = toInt(p.rows), d = p.database, t = p.table;
      const db = byDb.get(d); db.bytes += b; db.rows += r; db.parts += 1;
      const e = byTbl.get(key(d, t)); e.d = d; e.t = t;
      e.bytes += b; e.rows += r; e.parts += 1;
      e.uncompressed += toInt(p.data_uncompressed_bytes);
      e.partitions.add(p.partition_id);
      e.engine = p.engine ?? '';
      const pc = partCount.get(key(d, t, p.partition_id)); pc.d = d; pc.t = t; pc.pid = p.partition_id ?? null; pc.n += 1;
    }
    const tables: Overview['storage']['tables'] = [...byTbl.m.values()].map(e => ({
      database: e.d, table: e.t, engine: e.engine, bytes: e.bytes, rows: e.rows, parts: e.parts,
      partitions: e.partitions.size,
      ratio: e.bytes ? round(e.uncompressed / e.bytes, 1) : null,
    }));
    tables.sort((a, b) => b.bytes - a.bytes);
    const topParts = [...partCount.m.values()].map(x => ({ database: x.d, table: x.t, partition: x.pid, parts: x.n }))
      .sort((a, b) => b.parts - a.parts).slice(0, 15);
    const sysDbs = new Set(['system', 'INFORMATION_SCHEMA', 'information_schema']);
    const engines = defaultMap<string, number>(() => 0);
    for (const t of tablesMeta.values()) if (!sysDbs.has(t.database)) engines.m.set(t.engine, (engines.m.get(t.engine) ?? 0) + 1);

    // ---- replication
    const replicas = this.rows('replicas');
    for (const r of replicas) { r.absolute_delay = toInt(r.absolute_delay); r.queue_size = toInt(r.queue_size); }
    replicas.sort((a, b) => (toInt(b.is_readonly) - toInt(a.is_readonly)) || (b.absolute_delay - a.absolute_delay) || (b.queue_size - a.queue_size));
    const replSummary = {
      tables: replicas.length,
      readonly: replicas.filter(r => toInt(r.is_readonly)).length,
      expired: replicas.filter(r => toInt(r.is_session_expired)).length,
      max_delay: Math.max(0, ...replicas.map(r => r.absolute_delay)),
      queue_total: replicas.reduce((a, r) => a + r.queue_size, 0),
      degraded: replicas.filter(r => toInt(r.active_replicas) < toInt(r.total_replicas)).length,
    };

    // ---- time series from metric_log (hourly)
    const byTime = (a: Row, b: Row) => cmp(a.time, b.time);
    const ml = this.rows('metric_log_7_days').sort(byTime);
    const r3 = (v: unknown) => round(toFloat(v), 3);
    const series = {
      time: ml.map(r => r.time),
      merge_pool: ml.map(r => r3(r.avg_merge_pool_tasks)),
      fetch_pool: ml.map(r => r3(r.avg_fetch_pool_tasks)),
      schedule_pool: ml.map(r => r3(r.avg_schedule_pool_tasks)),
      memory: ml.map(r => Math.round(toFloat(r.avg_memory_tracking_bytes))),
      zk_tx: ml.map(r => toInt(r.zk_transactions)),
      zk_hw: ml.map(r => toInt(r.zk_hw_exceptions)),
    };
    const coord = this.rows('metric_log_coordination_3_days').sort(byTime);
    const cq = {
      time: coord.map(r => r.time),
      select: coord.map(r => toInt(r['sum(ProfileEvent_SelectQuery)'])),
      insert: coord.map(r => toInt(r['sum(ProfileEvent_InsertQuery)'])),
      failed: coord.map(r => toInt(r['sum(ProfileEvent_FailedQuery)'])),
      delayed: coord.map(r => toInt(r['sum(ProfileEvent_DelayedInserts)'])),
      rejected: coord.map(r => toInt(r['sum(ProfileEvent_RejectedInserts)'])),
    };

    // ---- queries: query_log_details repeats a row per table touched (LEFT ARRAY JOIN tables),
    // so keep one row per bucket+query identity.
    const seen = new Set<string>();
    const qrows: Row[] = [];
    for (const r of this.rows('query_log_details_7_days')) {
      const k = JSON.stringify([r.time, r.query_kind, r.user, r.type, r.interface, r.normalized_query_hash,
        r.exception_code, r.count, r.query_duration_ms, r.read_rows, r.written_rows].map(v => v ?? null));
      if (seen.has(k)) continue;
      seen.add(k);
      qrows.push(r);
    }
    const hourly = defaultMap<string, { ok: number; failed: number }>(() => ({ ok: 0, failed: 0 }));
    const users = defaultMap<string, { queries: number; failed: number; duration_ms: number; read_bytes: number }>(
      () => ({ queries: 0, failed: 0, duration_ms: 0, read_bytes: 0 }));
    const kinds = defaultMap<string, number>(() => 0);
    const hashes = new Map<unknown, QueryHash>();
    for (const r of qrows) {
      const n = toInt(r.count, 1);
      const t: string = r.type ?? '';
      if (t === 'QueryStart') continue;
      const failedQ = t.startsWith('Exception') || toInt(r.exception_code) !== 0;
      hourly.get(r.time)[failedQ ? 'failed' : 'ok'] += n;
      const u = users.get(r.user ?? '');
      u.queries += n; u.failed += failedQ ? n : 0;
      u.duration_ms += toInt(r.query_duration_ms); u.read_bytes += toInt(r.read_bytes);
      const kk = r.query_kind ?? '';
      kinds.m.set(kk, (kinds.m.get(kk) ?? 0) + n);
      let h = hashes.get(r.normalized_query_hash);
      if (!h) {
        h = {
          hash: r.normalized_query_hash, kind: r.query_kind, user: r.user,
          table: truthy(r.tables) ? r.tables : r.table, count: 0, failed: 0, duration_ms: 0,
          read_rows: 0, read_bytes: 0, written_rows: 0, max_memory: 0,
          query: str(r.query, 400), exception: '', avg_ms: 0,
        };
        hashes.set(r.normalized_query_hash, h);
      }
      h.count += n;
      h.duration_ms += toInt(r.query_duration_ms);
      h.read_rows += toInt(r.read_rows); h.read_bytes += toInt(r.read_bytes);
      h.written_rows += toInt(r.written_rows);
      h.max_memory = Math.max(h.max_memory, toInt(r.memory_usage));
      if (failedQ) {
        h.failed += n;
        h.exception = str(r.exception, 300) || h.exception;
      }
    }
    for (const h of hashes.values()) h.avg_ms = h.count ? round(h.duration_ms / h.count, 1) : 0;
    const hl = [...hashes.values()];
    const queries: Overview['queries'] = {
      hourly: [...hourly.m].sort((a, b) => cmp(a[0], b[0])).map(([time, v]) => ({ time, ...v })),
      users: [...users.m].map(([user, v]) => ({ user, ...v })).sort((a, b) => b.queries - a.queries).slice(0, 12),
      kinds: [...kinds.m].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
      top_time: [...hl].sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 15),
      top_read: [...hl].sort((a, b) => b.read_bytes - a.read_bytes).slice(0, 10),
      top_failed: hl.filter(h => h.failed).sort((a, b) => b.failed - a.failed).slice(0, 10),
    };

    // ---- parts / merges (part_log)
    const pl = defaultMap<string, Map<string, number>>(() => new Map());
    const plErr = defaultMap<string, { event_type: string; code: number; table: string; count: number; example: string }>(
      () => ({ event_type: '', code: 0, table: '', count: 0, example: '' }));
    for (const r of this.rows('part_log_3_days')) {
      const n = toInt(r.count, 1);
      const m = pl.get(r.time);
      m.set(r.event_type, (m.get(r.event_type) ?? 0) + n);
      if (toInt(r.error)) {
        const e = plErr.get(key(r.event_type, toInt(r.error), r.table_name));
        e.event_type = r.event_type; e.code = toInt(r.error); e.table = r.table_name;
        e.count += n; e.example = str(r.exception, 240);
      }
    }
    const partLog: Overview['part_log'] = {
      hourly: [...pl.m].sort((a, b) => cmp(a[0], b[0])).map(([time, v]) => ({ time, ...Object.fromEntries(v) })),
      errors: [...plErr.m.values()].sort((a, b) => b.count - a.count).slice(0, 15),
    };
    const mutations = this.rows('mutations').filter(m => toInt(m.parts_to_do) > 0);
    const det = defaultMap<string, { database: string; table: string; reason: string; count: number; bytes: number }>(
      () => ({ database: '', table: '', reason: '', count: 0, bytes: 0 }));
    for (const d of this.rows('detached_parts')) {
      const reason = str(d.reason) || '(manual / none)';
      const x = det.get(key(d.database, d.table, reason));
      x.database = d.database; x.table = d.table; x.reason = reason;
      x.count += 1; x.bytes += toInt(d.bytes_on_disk);
    }
    const detached = [...det.m.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 20);

    // ---- materialized views
    const vw = defaultMap<string, Overview['views'][number]>(
      () => ({ view: '', target: '', executions: 0, failed: 0, written_rows: 0, ms: 0, exception: '' }));
    for (const r of this.rows('query_views_log_3_days')) {
      const v = vw.get(key(r.view_name, r.view_target));
      v.view = r.view_name; v.target = r.view_target;
      const status: string = r.status ?? '';
      if (status === 'QueryFinish') {
        v.executions += toInt(r.executions); v.written_rows += toInt(r.written_rows); v.ms += toInt(r.view_duration_ms);
      } else if (status.startsWith('Exception')) {
        v.failed += toInt(r.executions); v.exception = str(r.exception, 240);
      }
    }
    const views = [...vw.m.values()].sort((a, b) => (b.failed - a.failed) || (b.executions - a.executions)).slice(0, 25);

    // ---- errors
    const errors = this.rows('errors');
    for (const e of errors) e.value = toInt(e.value);
    const errlog = defaultMap<string, Map<string, number>>(() => new Map());
    for (const r of this.rows('error_log_7_days')) {
      const m = errlog.get(r.error);
      m.set(r.time, (m.get(r.time) ?? 0) + toInt(r.errors));
    }
    const errorLog = [...errlog.m].map(([error, v]) => ({
      error, total: [...v.values()].reduce((a, b) => a + b, 0),
      hours: [...v].sort((a, b) => cmp(a[0], b[0])).map(([time, n]) => ({ time, n })),
    })).sort((a, b) => b.total - a.total).slice(0, 8);

    // ---- disks / keeper / clusters
    let host: Row = {};
    try { host = JSON.parse(this.text('host_info.json') || '{}'); } catch { /* ignore */ }

    const alerts: Alert[] = (dash.alerts ?? []).map((a: Row) => ({
      name: a.name, title: a.title, severity: a.severity, instances: (a.rows ?? []).length,
      message: a.message ?? '', sample: (a.rows ?? []).slice(0, 3),
    }));

    const userDbs = new Set(['system', 'INFORMATION_SCHEMA', 'information_schema']);
    const FAILURE_EVENTS = ['FailedQuery', 'FailedInsertQuery', 'FailedSelectQuery', 'RejectedInserts', 'DelayedInserts',
      'ReplicatedPartFailedFetches', 'ZooKeeperHardwareExceptions', 'ZooKeeperUserExceptions'];
    return {
      name: this.name,
      meta: {
        version, mode: head.mode, node: head.node, server: head.server, uptime: head.uptime,
        uptime_seconds: toInt(am.Uptime), started: head.started, finished: head.finished,
        warnings: (head.warnings ?? '').split('|').map(w => w.trim()).filter(Boolean),
        ...summ,
      },
      kpis: {
        databases: this.rows('databases').filter(d => !userDbs.has(d.name)).length,
        tables: [...tablesMeta.values()].filter(t => !userDbs.has(t.database)).length,
        active_parts: parts.length,
        bytes: tables.reduce((a, t) => a + t.bytes, 0),
        rows: tables.reduce((a, t) => a + t.rows, 0),
        max_parts_partition: toInt(am.MaxPartCountForPartition),
        memory_resident: toInt(am.MemoryResident),
        memory_total: toInt(am.OSMemoryTotal),
        load1: toFloat(am.LoadAverage1),
        cpus: toInt(am.NumberOfCPUCores) || null,
        queries_running: toInt(metrics.Query),
        tcp_conn: toInt(metrics.TCPConnection),
        http_conn: toInt(metrics.HTTPConnection),
      },
      alerts,
      failed_collectors: failed,
      storage: {
        by_db: [...byDb.m].map(([database, v]) => ({ database, ...v })).sort((a, b) => b.bytes - a.bytes),
        tables: tables.slice(0, 200), top_parts: topParts,
        engines: [...engines.m].map(([engine, count]) => ({ engine, count })).sort((a, b) => b.count - a.count),
        disks: this.rows('disks'),
      },
      replication: { summary: replSummary, replicas: replicas.slice(0, 100) },
      series, coord: cq, queries, part_log: partLog, mutations: mutations.slice(0, 30), detached, views,
      errors: {
        current: errors.slice(0, 30), history: errorLog,
        events: Object.fromEntries(FAILURE_EVENTS.filter(k => k in events).map(k => [k, events[k]])),
      },
      keeper: { connections: this.rows('zookeeper_connection'), files: this.keeperFiles() },
      clusters: this.rows('clusters'), host,
    };
  }
}

export function computeOverview(name: string, files: BundleFiles): Overview {
  return new BundleData(name, files).overview();
}
