/** Turns user-provided files (tar.gz archives, extracted folders, drag-dropped directories) into per-bundle file maps. */
import { BUNDLE_RE, wantedFile, type BundleFiles } from './bundle';
import { readTar } from './tar';

export interface Picked { path: string; file: File }

export const isArchive = (n: string) => /\.(tar\.gz|tgz|tar)$/i.test(n);

/** Splits "…/clickhouse_diagnostic_<ts>/rel/path" into [bundleName, rel]. */
function place(path: string, fallback: string): [string, string] {
  const parts = path.split('/').filter(Boolean);
  const i = parts.findIndex(p => BUNDLE_RE.test(p));
  if (i >= 0) return [parts[i], parts.slice(i + 1).join('/')];
  return parts.length > 1 ? [parts[0], parts.slice(1).join('/')] : [fallback, path];
}

async function isGzip(file: File) {
  const b = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return b[0] === 0x1f && b[1] === 0x8b;
}

export async function collect(
  picked: Picked[],
  onStatus: (msg: string) => void = () => {},
): Promise<Map<string, BundleFiles>> {
  const bundles = new Map<string, BundleFiles>();
  const put = (name: string, rel: string, text: string) => {
    let m = bundles.get(name);
    if (!m) bundles.set(name, (m = new Map()));
    m.set(rel, text);
  };
  const dec = new TextDecoder('utf-8', { fatal: false });

  for (const { path, file } of picked) {
    if (isArchive(file.name)) {
      onStatus(`Reading ${file.name}…`);
      let stream: ReadableStream<Uint8Array> = file.stream() as ReadableStream<Uint8Array>;
      if (await isGzip(file)) stream = stream.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
      const fallback = file.name.replace(/\.(tar\.gz|tgz|tar)$/i, '');
      for await (const e of readTar(stream, p => wantedFile(place(p, fallback)[1]))) {
        const [name, rel] = place(e.path, fallback);
        put(name, rel, dec.decode(e.data));
      }
    } else {
      const [name, rel] = place(path, 'bundle');
      if (wantedFile(rel)) put(name, rel, await file.text());
    }
  }
  return bundles;
}

/** Walks drag-dropped items (files and directories) into a flat list with relative paths. */
export async function fromDataTransfer(dt: DataTransfer): Promise<Picked[]> {
  const out: Picked[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ path: prefix + entry.name, file });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, prefix + entry.name + '/');
      }
    }
  };
  // Entries must be grabbed synchronously, before the first await.
  const entries = [...dt.items].map(i => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (entries.length) for (const e of entries) await walk(e, '');
  else for (const f of dt.files) out.push({ path: f.name, file: f });
  return out;
}

export const fromInput = (files: FileList | null): Picked[] =>
  [...(files ?? [])].map(f => ({ path: f.webkitRelativePath || f.name, file: f }));
