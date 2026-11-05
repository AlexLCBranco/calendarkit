// v1.40.0: a free TCP port for the local test servers (e2e, perf), so they never collide with — or reuse — another
// session's leftover server on a fixed port (4180 / 4190 before).

import { createServer } from 'node:net';

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => (port ? resolve(port) : reject(new Error('no port'))));
    });
  });
}
