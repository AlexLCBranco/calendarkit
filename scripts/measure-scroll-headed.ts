// Measures League List wheel scrolling in real, headed Google Chrome with the GPU (not headless), fullscreen so the
// page is the screen's size (1920 × 1080 here): same gesture and numbers as e2e/perf.spec.ts. Needs the app served
// on :4174 (`npm run build && npm run preview`). Usage: npm run measure-scroll [-- runs]; NO_CLOCK=1 = no fake clock (a
// real visitor; Playwright's fake clock wraps Intl.DateTimeFormat and slows formatting).
// Not part of the test suite: it opens a window on the desktop.

import { chromium } from '@playwright/test';

const URL = 'http://localhost:4174/?view=league&layout=list&date=2026-11-01';
const runs = Number(process.argv[2] ?? 5);

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--start-fullscreen', '--window-position=0,0', '--window-size=1920,1080'] });
const ctx = await browser.newContext({ viewport: null, timezoneId: 'America/Sao_Paulo' });
const page = await ctx.newPage();
// tsx (esbuild keepNames) wraps named functions in __name(); functions sent to the page need it there too
await page.addInitScript('window.__name = (f) => f');
if (!process.env.NO_CLOCK) await page.clock.setFixedTime(new Date('2026-11-15T15:00:00Z'));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');

const start = async () => {
  await page.goto(URL);
  await page.getByTestId('day-title').filter({ hasText: 'November 1' }).waitFor();
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.waitForTimeout(500);
};
await start();
const env = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, gpu: ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'no webgl', ua: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] };
});
const idle = await page.evaluate(
  () =>
    new Promise<number>((res) => {
      const f: number[] = [];
      let last = performance.now();
      const t0 = last;
      const tick = (t: number) => {
        f.push(t - last);
        last = t;
        if (t - t0 < 2000) requestAnimationFrame(tick);
        else res(f.slice(1).reduce((a, b) => a + b, 0) / (f.length - 1));
      };
      requestAnimationFrame(tick);
    }),
);
console.log(`viewport ${env.w}×${env.h} @${env.dpr}x, ${env.ua}, GPU: ${env.gpu}, idle frame ${idle.toFixed(2)} ms (${(1000 / idle).toFixed(1)} fps)`);
const box = (await page.getByTestId('league-list').boundingBox())!;
const busy = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value * 1000;

const res: { mean: number; p95: number; fps: number; slow: number }[] = [];
for (let run = 0; run <= runs; run++) {
  await page.evaluate(() => {
    const w = window as unknown as { __ck: { frames: number[]; on: boolean } };
    w.__ck = { frames: [], on: true };
    let last = performance.now();
    const tick = (t: number) => {
      if (!w.__ck.on) return;
      w.__ck.frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const b0 = await busy();
  for (let i = 0; i < 10 && !/December/.test((await page.getByTestId('day-title').textContent()) ?? ''); i++) {
    await cdp.send('Input.synthesizeScrollGesture', { x: box.x + box.width / 2, y: box.y + box.height / 2, yDistance: -4000, speed: 2400, gestureSourceType: 'mouse', preventFling: true });
  }
  const b1 = await busy();
  const r = await page.evaluate(() => {
    const w = window as unknown as { __ck: { frames: number[]; on: boolean } };
    w.__ck.on = false;
    const f = w.__ck.frames.slice(1);
    const s = [...f].sort((a, b) => a - b);
    const mean = f.reduce((a, b) => a + b, 0) / f.length;
    return { mean, p95: s[Math.floor(s.length * 0.95)]!, fps: 1000 / mean, slow: f.filter((x) => x > 25).length / f.length, n: f.length };
  });
  console.log(`${run ? `run ${run}` : 'warm-up'}: ${r.n} frames, mean ${r.mean.toFixed(1)} ms = ${r.fps.toFixed(1)} fps, p95 ${r.p95.toFixed(1)} ms, frames > 25 ms ${(r.slow * 100).toFixed(0)}%, main thread ${(b1 - b0).toFixed(0)} ms`);
  if (run) res.push(r);
  await start();
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
console.log(`MEDIAN of ${runs}: mean ${med(res.map((r) => r.mean)).toFixed(1)} ms = ${med(res.map((r) => r.fps)).toFixed(1)} fps, p95 ${med(res.map((r) => r.p95)).toFixed(1)} ms`);
await browser.close();
