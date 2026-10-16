const nf = new Intl.NumberFormat();
export const bytes = (n: unknown) => {
  if (n == null) return '–';
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0, v = +(n as number);
  while (v >= 1024 && i < 4) { v /= 1024; i++; }
  return (i ? v.toFixed(v < 10 ? 2 : 1) : v) + ' ' + u[i];
};
export const num = (n: unknown) => {
  const v = +(n as number);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(1) + 'k';
  return nf.format(Math.round(v * 100) / 100);
};
export const ms = (n: number) =>
  n >= 60000 ? (n / 60000).toFixed(1) + ' min' : n >= 1000 ? (n / 1000).toFixed(1) + ' s' : Math.round(n) + ' ms';
export const to = (v: unknown) => +(v as number) || 0;
