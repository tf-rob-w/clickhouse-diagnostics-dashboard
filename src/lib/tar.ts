/** Streaming ustar/pax/GNU tar reader. Entries the caller does not want are skipped without buffering. */

class ChunkReader {
  private chunks: Uint8Array[] = [];
  private len = 0;
  private done = false;
  private r: ReadableStreamDefaultReader<Uint8Array>;
  constructor(s: ReadableStream<Uint8Array>) {
    this.r = s.getReader();
  }
  private async fill(n: number) {
    while (this.len < n && !this.done) {
      const { value, done } = await this.r.read();
      if (done) { this.done = true; break; }
      if (value && value.length) { this.chunks.push(value); this.len += value.length; }
    }
  }
  /** Reads up to n bytes (fewer only at end of stream). */
  async read(n: number): Promise<Uint8Array> {
    await this.fill(n);
    const take = Math.min(n, this.len);
    const out = new Uint8Array(take);
    let o = 0;
    while (o < take) {
      const c = this.chunks[0];
      const k = Math.min(c.length, take - o);
      out.set(c.subarray(0, k), o);
      o += k;
      if (k === c.length) this.chunks.shift(); else this.chunks[0] = c.subarray(k);
    }
    this.len -= take;
    return out;
  }
  async skip(n: number) {
    while (n > 0) {
      if (this.len === 0) { await this.fill(1); if (this.len === 0) return; }
      const c = this.chunks[0];
      const k = Math.min(c.length, n);
      if (k === c.length) this.chunks.shift(); else this.chunks[0] = c.subarray(k);
      this.len -= k;
      n -= k;
    }
  }
}

const dec = new TextDecoder();
const cstr = (b: Uint8Array, off: number, len: number) => {
  let end = off;
  while (end < off + len && b[end] !== 0) end++;
  return dec.decode(b.subarray(off, end));
};

function parseSize(b: Uint8Array): number {
  if (b[124] & 0x80) { // GNU base-256
    let v = b[124] & 0x7f;
    for (let i = 125; i < 136; i++) v = v * 256 + b[i];
    return v;
  }
  return parseInt(cstr(b, 124, 12).trim() || '0', 8) || 0;
}

function parsePax(data: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  let pos = 0;
  while (pos < data.length) {
    let sp = pos;
    while (sp < data.length && data[sp] !== 0x20) sp++;
    const recLen = parseInt(dec.decode(data.subarray(pos, sp)), 10);
    if (!recLen) break;
    const rec = dec.decode(data.subarray(sp + 1, pos + recLen)).replace(/\n$/, '');
    const eq = rec.indexOf('=');
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    pos += recLen;
  }
  return out;
}

export interface TarEntry { path: string; data: Uint8Array }

export async function* readTar(
  stream: ReadableStream<Uint8Array>,
  wanted: (path: string) => boolean,
): AsyncGenerator<TarEntry> {
  const rd = new ChunkReader(stream);
  let longName: string | null = null;
  let pax: Record<string, string> = {};
  for (;;) {
    const h = await rd.read(512);
    if (h.length < 512 || h.every(v => v === 0)) return;
    const type = String.fromCharCode(h[156] || 0x30);
    let size = parseSize(h);
    let path = cstr(h, 0, 100);
    if (cstr(h, 257, 5) === 'ustar') {
      const prefix = cstr(h, 345, 155);
      if (prefix) path = prefix + '/' + path;
    }
    const pad = (512 - (size % 512)) % 512;

    if (type === 'x' || type === 'L') {
      const body = await rd.read(size);
      await rd.skip(pad);
      if (type === 'x') pax = parsePax(body);
      else longName = cstr(body, 0, body.length);
      continue;
    }
    if (pax.path) path = pax.path;
    if (pax.size) size = parseInt(pax.size, 10) || size;
    if (longName) path = longName;
    pax = {};
    longName = null;

    const isFile = type === '0' || type === '7';
    const clean = path.replace(/^\.\//, '');
    if (isFile && wanted(clean)) {
      const data = await rd.read(size);
      await rd.skip((512 - (size % 512)) % 512);
      yield { path: clean, data };
    } else {
      await rd.skip(size + ((512 - (size % 512)) % 512));
    }
  }
}
