// An earlier build of the app, served on a port of its own for an A/B in the same run (round 10, from perf.spec.ts's
// reference server): built once by scripts/perf-ref.ts, its own files at its root, /data/ from this checkout's public/
// (today's snapshot, as the current build serves it), so both builds show the same data.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { buildPerfRef } from '../scripts/perf-ref';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

/** Builds `commit` if needed and serves it; returns its base URL and the server (close it after). */
export async function serveRef(commit: string): Promise<{ base: string; server: Server }> {
  const dir = buildPerfRef(commit);
  const server = createServer((q, r) => {
    const path = decodeURIComponent(q.url!.split('?')[0]!);
    let file = path.startsWith('/data/') ? join(resolve('public'), path) : join(dir, path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    r.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    r.end(readFileSync(file));
  });
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
  const addr = server.address();
  return { base: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`, server };
}
