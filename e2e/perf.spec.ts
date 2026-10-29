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

/** `baseName`: the baseline to compare with (a variant of a gesture is held to the plain gesture's baseline). */
function check(name: string, value: number, slackKey: string, baseName = name) {
  measured[name] = round(value);
  const base = baseline[baseName];
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

/** Frames (rAF), main-thread time (CDP TaskDuration) and long tasks while `gesture` runs; `reset` before each run. */
type ScrollRun = { p95: number; mean: number; max: number; main: number; long: number; n: number };
async function scrollRuns(page: Page, label: string, reset: () => Promise<void>, gesture: () => Promise<void>): Promise<ScrollRun[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const busy = async () => ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value * 1000);
  const runs: ScrollRun[] = [];
  await reset();
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
    await gesture();
    const busy1 = await busy();
    const r = await page.evaluate(async () => {
      await new Promise((res) => setTimeout(res, 100)); // let the last long task be reported
      const w = window as unknown as { __ck: { frames: number[]; long: number; on: boolean } };
      w.__ck.on = false;
      const f = w.__ck.frames.slice(1).sort((a, b) => a - b);
      return { p95: f[Math.floor(f.length * 0.95)]!, mean: f.reduce((a, b) => a + b, 0) / f.length, max: f.at(-1)!, long: w.__ck.long, n: f.length };
    });
    console.log(`[perf] ${label} run ${run || 'warm-up'}: ${r.n} frames, mean ${round(r.mean)} ms, p95 ${round(r.p95)} ms, max ${round(r.max)} ms, main thread ${round(busy1 - busy0)} ms, long tasks ${round(r.long)} ms`);
    if (run) runs.push({ ...r, main: busy1 - busy0 });
    await reset();
  }
  return runs;
}

/** Checks the guarded scroll metrics (`<prefix>-frame-p95`, `-frame-mean`, `-main-thread`) and prints the rest. */
function checkScroll(prefix: string, runs: ScrollRun[], baseName = prefix) {
  const m = (k: keyof ScrollRun) => median(runs.map((r) => r[k]));
  check(`${prefix}-frame-p95`, m('p95'), 'scrollP95', `${baseName}-frame-p95`);
  check(`${prefix}-frame-mean`, m('mean'), 'scrollMean', `${baseName}-frame-mean`);
  // Frames now sit at the display rate, so main-thread time is what shows extra work first (before the 2026-10-24
  // fix it was ~the whole gesture and couldn't grow, so it wasn't guarded).
  check(`${prefix}-main-thread`, m('main'), 'scrollMain', `${baseName}-main-thread`);
  // Printed, not guarded: the worst frame and the long-task total vary a lot between identical runs.
  for (const [k, v] of [[`${prefix}-frame-max`, m('max')], [`${prefix}-long-tasks`, m('long')]] as const) {
    measured[k] = round(v);
    console.log(`[perf] ${k} ${round(v)} ms (not guarded)`);
  }
}

/** Chromium's own wheel gesture (mouse wheel ticks at the display's frame rate, 2400 px/s) over `el`. */
async function wheel(page: Page, testId: string, yDistance: number) {
  const cdp = await page.context().newCDPSession(page);
  const box = (await page.getByTestId(testId).boundingBox())!;
  await cdp.send('Input.synthesizeScrollGesture', { x: box.x + box.width / 2, y: box.y + box.height / 2, yDistance, speed: 2400, gestureSourceType: 'mouse', preventFling: true });
  await cdp.detach();
}

/** League List from Nov 1 (explicit date: no clock needed) to December, a month of game days, in 4000 px pieces. */
async function leagueListToDecember(page: Page) {
  for (let i = 0; i < 10 && !/December/.test((await page.getByTestId('day-title').textContent()) ?? ''); i++) await wheel(page, 'league-list', -4000);
  await expect(page.getByTestId('day-title')).toContainText('December');
}
async function openLeagueList(page: Page, search = '') {
  await page.goto(`/?view=league&layout=list&date=2026-11-01${search}`);
  await expect(page.getByTestId('day-title')).toContainText('November 1');
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  // round 4: the active-day highlight is on (it follows the day at the top while the gesture runs)
  await expect(page.locator('.ck-lday.ck-active-day')).toHaveCount(1);
}

// Since round 4 (items 10, 11) this gesture runs with the active-day highlight on (and today's countdowns ticking in
// the countdown variant below): held to the same baselines as before those features.
test('wheel-scrolling the League List through a month: frame times, main-thread time, long tasks', async ({ page }) => {
  test.setTimeout(180_000);
  // No fake clock here: Playwright's clock wraps Intl.DateTimeFormat, which made scrolling look slower than in a
  // real browser (2026-10-24). The list opens on an explicit date, so it needs no clock.
  checkScroll('scroll', await scrollRuns(page, 'scroll', () => openLeagueList(page), () => leagueListToDecember(page)));
  // the highlight moved with the day at the top
  await leagueListToDecember(page);
  expect(await page.evaluate(() => document.querySelector<HTMLElement>('.ck-active-day')?.dataset.day)).toBe(await page.evaluate(() => document.querySelector<HTMLElement>('[aria-label="Week"] [aria-selected="true"]')?.dataset.date));
});

// Countdown (round 4, item 11): the same gesture from a day with countdowns on screen (Nov 15, 15:00 UTC; the clock is
// Playwright's, fixed), the clock moved a minute and ticked (CLOCK_TICK_EVENT) after every piece — the first piece
// short, so today's countdowns are still on screen at the first tick. A tick must update the countdown texts only.
// Own baseline: Playwright's fixed clock alone puts the frame p95 at ~33 ms (with or without ticks), so it was measured
// with this exact gesture on the build before the countdown (51e7704, 8 interleaved runs: p95 33.0, mean 17.4, main
// thread 1 819 ms; with the countdown 34.0 / 17.7 / 1 797).
test('wheel-scrolling the League List while the countdown ticks', async ({ page }) => {
  test.setTimeout(180_000);
  const T0 = Date.parse('2026-11-15T15:00:00Z');
  let t = T0;
  const tick = async () => {
    t += 60_000;
    await page.clock.setFixedTime(t);
    await page.evaluate(() => window.dispatchEvent(new Event('ck-clock-tick')));
  };
  const open = async () => {
    t = T0;
    await page.clock.setFixedTime(t);
    await page.goto('/?view=league&layout=list&date=2026-11-15');
    await expect(page.getByTestId('day-title')).toContainText('November 15');
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    await expect(page.locator('.ck-countdown').first()).toBeVisible();
  };
  const gesture = async () => {
    await wheel(page, 'league-list', -600);
    const before = await page.locator('.ck-countdown').first().textContent();
    await tick();
    await expect(page.locator('.ck-countdown').first()).not.toHaveText(before!); // ticked while on screen
    for (let i = 0; i < 10 && !/December (1[5-9]|[23][0-9])/.test((await page.getByTestId('day-title').textContent()) ?? ''); i++) {
      await wheel(page, 'league-list', -4000);
      await tick();
    }
  };
  checkScroll('scroll-countdown', await scrollRuns(page, 'scroll-countdown', open, gesture));
});

// Team List (2026-10-28, round 4): LAL's whole season (~82 rows), wheel down from the first game to the last and back
// up. Its own baseline (measured on the code before round 4's Team List week strip).
test('wheel-scrolling the Team List through the season', async ({ page }) => {
  test.setTimeout(180_000);
  const top = async () => {
    await page.goto('/?view=team&layout=list&team=LAL');
    await page.waitForFunction(() => [...document.images].every((i) => i.complete) && !!document.querySelector('[data-testid="team-list"] [data-game-id]'));
    await page.getByTestId('team-list').evaluate((el) => (el.scrollTop = 0));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  };
  const gesture = async () => {
    await wheel(page, 'team-list', -2400);
    await wheel(page, 'team-list', 2400);
  };
  checkScroll('team-scroll', await scrollRuns(page, 'team-scroll', top, gesture));
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
  // round 0 warms up (first render of each view's code paths) and is not counted: the switch timings flaked on unchanged
  // code with a cold first round (2026-10-28: League Calendar 117 ms, Team Calendar 105 ms; 38–84 / 63–72 ms warm)
  for (let run = 0; run <= RUNS; run++) {
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
      if (run) times.set(name, [...(times.get(name) ?? []), t]);
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
