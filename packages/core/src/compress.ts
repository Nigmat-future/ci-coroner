export interface CompressOptions {
  maxChars?: number;
  tailLines?: number;
}

const SIGNAL =
  /(error|err!|fail|failed|exception|traceback|fatal|panic|ENOENT|ERESOLVE|TS\d{3,5}|AssertionError|Expected|at\s+\S+\s+\()/i;

export function compressLog(
  text: string,
  options: CompressOptions = {},
): string {
  const maxChars = options.maxChars ?? 24_000;
  const tailLines = options.tailLines ?? 40;
  if (text.length <= maxChars) return text;

  const lines = text.split(/\r?\n/);
  const picked = new Map<number, string>();

  for (let i = Math.max(0, lines.length - tailLines); i < lines.length; i++) {
    picked.set(i, lines[i]!);
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!;
    if (!SIGNAL.test(line)) continue;
    picked.set(idx, line);
    if (idx > 0) picked.set(idx - 1, lines[idx - 1]!);
    if (idx + 1 < lines.length) picked.set(idx + 1, lines[idx + 1]!);
  }

  const ordered = [...picked.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, line]) => `L${idx + 1}: ${line}`);

  let out = ordered.join("\n");
  if (out.length > maxChars) {
    out = out.slice(out.length - maxChars);
  }
  return out;
}
