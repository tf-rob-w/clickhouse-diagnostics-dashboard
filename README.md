# ClickHouse results viewer

A static React site for exploring `clickhouse-diagnostics` bundles. Local only, diagnostic bundles are read entirely in the browser.

Bundles are created by the [clickhouse-diagnostics tool][1] and typically come as compressed tarballs (`.tar.gz`).

## Use

```bash
npm install
npm run dev
```

Then drop onto the page (or use the buttons):

- a `clickhouse_diagnostic_<ts>.tar.gz` (or `clickhouse_backup_<ts>.tar.gz`) — decompressed and read in the browser, no extraction needed
- an extracted bundle folder
- a directory of bundles — every bundle in it is loaded and selectable from the header.

Bundles live in memory only; reloading the tab clears them.

## Build / host

```bash
npm run build      # -> dist/, relative asset paths
npm run preview    # serve dist/ locally
```

`dist/` is plain static files and works from any static host or sub-path. Only host it somewhere you trust: the site
itself contains no bundle data, but anyone who opens it loads their own bundle locally.

## Layout

- `src/lib/tar.ts` — streaming tar reader (skips unwanted entries without buffering them).
- `src/lib/load.ts` — turns archives / folders / drag-dropped directories into per-bundle file maps.
- `src/lib/bundle.ts` — aggregates a bundle into the `Overview` model (`types.ts`) the views render.
- `src/views/` — one component per tab; `src/components/` — SVG charts and table primitives.

## Tests

```bash
npm test
```

[1]: https://github.com/ClickHouse/clickhouse-diagnostics
