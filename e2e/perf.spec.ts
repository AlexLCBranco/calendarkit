// Performance guard (1920 × 1080, own Playwright project "perf" that runs after every other project, so no other
// test shares the machine): load → first view rendered, wheel-scrolling the League List through a month, and
// switching views. Fails when a metric gets meaningfully worse than the baseline in e2e/perf-baseline.json
// (limit = max(baseline × PERF_RATIO, baseline + the metric's slack); see PROJECT.md "Performance").
// Prints `[perf] …` lines; PERF_RECORD=1 writes the measured numbers to test-output/perf.json.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');
const RUNS = 5;
const PERF_RATIO = 1.5;
/** Absolute slack (ms) per metric: small numbers are noisy, so a ratio alone would flake. */
const SLACK: Record<string, number> = { load: 150, scrollP95: 15, scrollMean: 10, scrollMain: 500, switch: 40 };

type Baseline = Record<string, Record<string, number>>;
const baselines = JSON.parse(readFileSync('e2e/perf-baseline.json', 'utf8')) as Baseline;
// Baselines per OS: CI (Linux runners) and a Windows PC differ by more than any sensible margin.
const baseline = baselines[process.platform] ?? baselines.linux!;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const round = (x: number) => Math.round(x * 10) / 10;
const measured: Record<string, number> = {};

function check(name: string, value: number, slackKey: string) {
  measured[name] = round(value);
  const base = baseline[name];
  const limit = base === undefined ? Infinity : Math.max(base * PERF_RATIO, base + SLACK[slackKey]!);
  console.log(`[perf] ${name} ${round(value)} ms (baseline ${base ?? '–'}, limit ${round(limit)})`);
  expect.soft(value, `${name}: ${round(value)} ms, baseline ${base} ms`).toBeLessThanOrEqual(limit);
}

/** Time from navigation start to the frame after the first game row is in the DOM. */
async function loadTime(page: Page, search: string) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ckFirst?: number };
    const obs = new MutationObserver(() => {
      if (!document.querySelector('.ck-root [data-game-id]')) return;
      obs.disconnect();
      requestAnimationFrame(() => (w.__ckFirst = performance.now()));
    });
    obs.observe(document, { childList: true, subtree: true });
  });
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await page.waitForFunction(() => (window as unknown as { __ckFirst?: number }).__ckFirst !== undefined);
  return page.evaluate(() => (window as unknown as { __ckFirst: number }).__ckFirst);
}

test.beforeEach(({}, info) => test.skip(info.project.name !== 'perf' || !!process.env.E2E_BASE_URL, 'local build only: a deployed site adds network time'));

test('load → first view rendered', async ({ browser }) => {
  for (const [name, search] of [['load-league-list', ''], ['load-week-view', '?view=league&layout=calendar'], ['load-team-calendar', '?view=team&layout=calendar&team=BOS']] as const) {
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, timezoneId: 'America/Sao_Paulo' });
      const page = await ctx.newPage();
      times.push(await loadTime(page, search));
      await ctx.close();
    }
    check(name, median(times), 'load');
  }
});

test('wheel-scrolling the League List through a month: frame times, main-thread time, long tasks', async ({ page }) => {
  test.setTimeout(180_000);
  // No fake clock here: Playwright's clock wraps Intl.DateTimeFormat, which made scrolling look slower than in a
  // real browser (2026-10-24). The list opens on an explicit date, so it needs no clock.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const busy = async () => ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value * 1000);
  const start = async () => {
    await page.goto('/?view=league&layout=list&date=2026-11-01');
    await expect(page.getByTestId('day-title')).toContainText('November 1');
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  };
  await start();
  const box = (await page.getByTestId('league-list').boundingBox())!;

  const p95: number[] = [];
  const mean: number[] = [];
  const max: number[] = [];
  const main: number[] = [];
  const long: number[] = [];
  // run 0 warms up (JIT, first measuring of day heights, image decoding) and is not counted
  for (let run = 0; run <= RUNS; run++) {
    await page.evaluate(() => {
      const w = window as unknown as { __ck: { frames: number[]; long: number; on: boolean } };
      w.__ck = { frames: [], long: 0, on: true };
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__ck.long += e.duration))).observe({ type: 'longtask' });
      let last = performance.now();
      const tick = (t: number) => {
        if (!w.__ck.on) return;
        w.__ck.frames.push(t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const busy0 = await busy();
    // Chromium's own wheel gesture (mouse wheel ticks at the display's frame rate, 2400 px/s), in 4000 px pieces
    // until the list reaches December: a month of game days
    for (let i = 0; i < 10 && !/December/.test((await page.getByTestId('day-title').textContent()) ?? ''); i++) {
      await cdp.send('Input.synthesizeScrollGesture', { x: box.x + box.width / 2, y: box.y + box.height / 2, yDistance: -4000, speed: 2400, gestureSourceType: 'mouse', preventFling: true });
    }
    await expect(page.getByTestId('day-title')).toContainText('December');
    const busy1 = await busy();
    const r = await page.evaluate(async () => {
      await new Promise((res) => setTimeout(res, 100)); // let the last long task be reported
      const w = window as unknown as { __ck: { frames: number[]; long: number; on: boolean } };
      w.__ck.on = false;
      const f = w.__ck.frames.slice(1).sort((a, b) => a - b);
      return { p95: f[Math.floor(f.length * 0.95)]!, mean: f.reduce((a, b) => a + b, 0) / f.length, max: f.at(-1)!, long: w.__ck.long, n: f.length };
    });
    console.log(`[perf] scroll run ${run || 'warm-up'}: ${r.n} frames, mean ${round(r.mean)} ms, p95 ${round(r.p95)} ms, max ${round(r.max)} ms, main thread ${round(busy1 - busy0)} ms, long tasks ${round(r.long)} ms`);
    if (run) {
      p95.push(r.p95);
      mean.push(r.mean);
      max.push(r.max);
      main.push(busy1 - busy0);
      long.push(r.long);
    }
    await start(); // back to Nov 1 for the next run
  }
  check('scroll-frame-p95', median(p95), 'scrollP95');
  check('scroll-frame-mean', median(mean), 'scrollMean');
  // Frames now sit at the display rate, so main-thread time is what shows extra work first (before the 2026-10-24
  // fix it was ~the whole gesture and couldn't grow, so it wasn't guarded).
  check('scroll-main-thread', median(main), 'scrollMain');
  // Printed, not guarded: the worst frame and the long-task total vary a lot between identical runs.
  for (const [k, v] of [['scroll-frame-max', max], ['scroll-long-tasks', long]] as const) {
    measured[k] = round(median(v));
    console.log(`[perf] ${k} ${round(median(v))} ms (not guarded)`);
  }
});

test('switching views: click → next frame', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/?view=league&layout=list&team=BOS');
  await expect(page.getByTestId('day-title')).toBeVisible();
  // League List → League Calendar (week view) → Team Calendar → Team List → League List
  const steps: [string, string, string][] = [
    ['switch-league-calendar', 'Layout', 'Calendar'],
    ['switch-team-calendar', 'View', 'Team'],
    ['switch-team-list', 'Layout', 'List'],
    ['switch-league-list', 'View', 'League'],
  ];
  const times = new Map<string, number[]>();
  for (let run = 0; run < RUNS; run++) {
    for (const [name, group, tab] of steps) {
      const t = await page.evaluate(
        ([group, tab]) =>
          new Promise<number>((resolve) => {
            const el = [...document.querySelectorAll(`[role=tablist][aria-label="${group}"] [role=tab]`)].find((b) => b.textContent === tab) as HTMLElement;
            const t0 = performance.now();
            el.click();
            requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0), 0));
          }),
        [group, tab],
      );
      times.set(name, [...(times.get(name) ?? []), t]);
      await page.waitForTimeout(100);
    }
  }
  for (const [name] of steps) check(name, median(times.get(name)!), 'switch');
});

// Marquee select (2026-10-24): a box dragged across the busiest 2 weeks of the league week view (110 game lines) and
// down the Team List with auto-scroll. Frame times from requestAnimationFrame and long tasks during the gesture.
// Not against a baseline (new): must stay smooth — p95 frame within two refreshes, no long task over 100 ms in total.
test('marquee drag across busy views: frame times and long tasks', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const gesture = async (search: string, from: [number, number], to: [number, number], hold = 0) => {
    await page.goto(`/${search}`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete) && !!document.querySelector('[data-game-id]'));
    await page.evaluate(() => {
      const w = window as unknown as { __ck: { frames: number[]; long: number; stop: boolean } };
      w.__ck = { frames: [], long: 0, stop: false };
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__ck.long += e.duration))).observe({ type: 'longtask' });
      let last = performance.now();
      const tick = (t: number) => {
        w.__ck.frames.push(t - last);
        last = t;
        if (!w.__ck.stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps: 60 });
    if (hold) await page.waitForTimeout(hold);
    await page.mouse.up();
    const r = await page.evaluate(() => {
      const w = window as unknown as { __ck: { frames: number[]; long: number; stop: boolean } };
      w.__ck.stop = true;
      const f = w.__ck.frames.slice(1).sort((a, b) => a - b);
      return { n: f.length, mean: f.reduce((a, b) => a + b, 0) / f.length, p95: f[Math.floor(f.length * 0.95)]!, max: f.at(-1)!, long: w.__ck.long, selected: document.querySelector('[data-testid="selection-count"]')?.textContent };
    });
    console.log(`[perf] marquee ${search}: ${r.n} frames, mean ${round(r.mean)} ms, p95 ${round(r.p95)} ms, max ${round(r.max)} ms, long tasks ${round(r.long)} ms, ${r.selected}`);
    expect(r.selected).toMatch(/^\d+ games selected$/);
    expect.soft(r.p95, 'p95 frame within two refreshes').toBeLessThanOrEqual(34);
    expect.soft(r.long, 'long tasks during the drag').toBeLessThanOrEqual(100);
  };
  await gesture('?view=league&layout=calendar&date=2026-12-27&weeks=2', [60, 150], [1860, 1040]);
  await gesture('?view=team&layout=list&team=LAL', [900, 300], [905, 1060], 1500);
});

test.afterAll(() => {
  if (!process.env.PERF_RECORD || !Object.keys(measured).length) return;
  mkdirSync('test-output', { recursive: true });
  let prev: Record<string, number> = {};
  try {
    prev = JSON.parse(readFileSync('test-output/perf.json', 'utf8'));
  } catch {}
  writeFileSync('test-output/perf.json', JSON.stringify({ ...prev, ...measured }, null, 2));
});
