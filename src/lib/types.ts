// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface Alert { name: string; title: string; severity: string; instances: number; message: string; sample: Row[] }
export interface QueryHash {
  hash: unknown; kind: string; user: string; table: unknown; count: number; failed: number; duration_ms: number;
  read_rows: number; read_bytes: number; written_rows: number; max_memory: number; query: string; exception: string;
  avg_ms: number;
}
export interface Overview {
  name: string;
  meta: {
    version: string; mode?: string; node?: string; server?: string; uptime?: string; uptime_seconds: number;
    started?: string; finished?: string; warnings: string[];
    collectors_ok?: number; collectors_failed?: number; collectors_empty?: number; alert_rules?: number;
    alerts_fired?: number; alerts_clean?: number; alerts_failed?: number; alerts_skipped?: number;
  };
  kpis: {
    databases: number; tables: number; active_parts: number; bytes: number; rows: number; max_parts_partition: number;
    memory_resident: number; memory_total: number; load1: number; cpus: number | null; queries_running: number;
    tcp_conn: number; http_conn: number;
  };
  alerts: Alert[];
  failed_collectors: { name: string; error: string }[];
  storage: {
    by_db: { database: string; bytes: number; rows: number; parts: number }[];
    tables: { database: string; table: string; engine: string; bytes: number; rows: number; parts: number; partitions: number; ratio: number | null }[];
    top_parts: { database: string; table: string; partition: unknown; parts: number }[];
    engines: { engine: string; count: number }[];
    disks: Row[];
  };
  replication: {
    summary: { tables: number; readonly: number; expired: number; max_delay: number; queue_total: number; degraded: number };
    replicas: Row[];
  };
  series: { time: string[]; merge_pool: number[]; fetch_pool: number[]; schedule_pool: number[]; memory: number[]; zk_tx: number[]; zk_hw: number[] };
  coord: { time: string[]; select: number[]; insert: number[]; failed: number[]; delayed: number[]; rejected: number[] };
  queries: {
    hourly: { time: string; ok: number; failed: number }[];
    users: { user: string; queries: number; failed: number; duration_ms: number; read_bytes: number }[];
    kinds: { kind: string; count: number }[];
    top_time: QueryHash[]; top_read: QueryHash[]; top_failed: QueryHash[];
  };
  part_log: {
    hourly: ({ time: string } & Record<string, number | string>)[];
    errors: { event_type: string; code: number; table: string; count: number; example: string }[];
  };
  mutations: Row[];
  detached: { database: string; table: string; reason: string; count: number; bytes: number }[];
  views: { view: string; target: string; executions: number; failed: number; written_rows: number; ms: number; exception: string }[];
  errors: {
    current: Row[];
    history: { error: string; total: number; hours: { time: string; n: number }[] }[];
    events: Record<string, number>;
  };
  keeper: {
    connections: Row[];
    files: { target: string; status: 'ok' | 'failed' | 'partial'; errors: Record<string, string>; mode: string | null }[];
  };
  clusters: Row[];
  host: Row;
}
