// Performance guard (1920 × 1080, own Playwright project "perf" that runs after every other project, so no other
// test shares the machine; on CI a job of its own since round 8): load → first view rendered, the League List within a busy night and day by day (round 8), the Team List,
// switching views. Fails when a metric gets meaningfully worse than the baseline in e2e/perf-baseline.json
// (limit = max(baseline × PERF_RATIO, baseline + the metric's slack); see PROJECT.md "Performance").
// Prints `[perf] …` lines; PERF_RECORD=1 writes the measured numbers to test-output/perf.json.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { expect, test, type Browser, type Page } from './fixtures';
import { buildPerfRef } from '../scripts/perf-ref';

const NOW = new Date('2026-11-15T15:00:00Z');
const RUNS = 5;
/**
 * Round 6 (A2): the scroll checks' main-thread time is held to this earlier build, measured in the same run (built once
 * by scripts/perf-ref.ts, served with today's snapshot so both builds get the same data). Move it forward on purpose
 * after a change whose extra cost was accepted, never to make a run pass.
 */
const REFERENCE = { commit: '31c3aed0dadd293c14875e06212661b6f58d2e87', version: '1.17.1' };
/**
 * Current ÷ reference main-thread time (medians of AB_RUNS interleaved runs) above this fails. Measured on the Windows
 * PC (League List gesture, 2026-10-30): v1.17.1 against itself, three sessions: ×0.985, ×1.089, ×1.023, while that same
 * build's median moved 2 434 – 2 733 ms between the sessions (which no number of runs in one build removes); this spec
 * with a scroll-identical current build: ×1.036. Extra work per game card render (memoized: ~300 renders per gesture):
 * 1 ms → ×1.08, 3 ms → ×1.15 (that one fails the frame p95 check instead). So this check catches ≥ ~+25 % main thread.
 */
const REF_RATIO = 1.25;
/** Counted runs per build in the interleaved scroll checks (single runs of one build vary by up to ±30 %). */
const AB_RUNS = 7;
let refBase = '';
let refServer: Server | undefined;
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

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'perf' || process.env.E2E_BASE_URL) return;
  test.setTimeout(120_000); // the first run builds the reference (~10 s)
  const dir = buildPerfRef(REFERENCE.commit);
  // the reference's own files; /data/ from this checkout's public/ (today's snapshot, as the current build serves it)
  refServer = createServer((q, r) => {
    const path = decodeURIComponent(q.url!.split('?')[0]!);
    let file = path.startsWith('/data/') ? join(resolve('public'), path) : join(dir, path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    r.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    r.end(readFileSync(file));
  });
  await new Promise<void>((res) => refServer!.listen(0, '127.0.0.1', () => res()));
  const addr = refServer.address();
  refBase = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
test.afterAll(() => refServer?.close());

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

/** Frames (rAF), main-thread time (CDP TaskDuration) and long tasks while `gesture` runs. */
type ScrollRun = { p95: number; mean: number; max: number; main: number; long: number; n: number };
/** One side of an A/B: a page, how to put it back at the start, and the gesture. */
type Arm = { name: string; page: Page; reset: () => Promise<void>; gesture: () => Promise<void> };

/**
 * The current build and the reference build (REFERENCE), interleaved — ABBA… — so both see the same machine state:
 * identical builds measured minutes apart differ by up to ±20 % on the Windows PC, interleaved by a few %. Each arm
 * gets an uncounted warm-up run (JIT, first measuring of day heights, image decoding), then AB_RUNS counted runs.
 */
async function scrollRunsAB(label: string, arms: Arm[]): Promise<ScrollRun[][]> {
  const meters = await Promise.all(arms.map((a) => meter(a.page)));
  const runs: ScrollRun[][] = arms.map(() => []);
  for (const a of arms) await a.reset();
  for (let run = 0; run <= AB_RUNS; run++) {
    for (const i of run % 2 ? arms.keys() : [...arms.keys()].reverse()) {
      const a = arms[i]!;
      const r = await meters[i]!(a.gesture);
      console.log(`[perf] ${label} ${a.name} run ${run || 'warm-up'}: ${r.n} frames, mean ${round(r.mean)} ms, p95 ${round(r.p95)} ms, max ${round(r.max)} ms, main thread ${round(r.main)} ms, long tasks ${round(r.long)} ms`);
      if (run) runs[i]!.push(r);
      await a.reset();
    }
  }
  return runs;
}

/** Measures one run of a gesture on `page`. */
async function meter(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const busy = async () => ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value * 1000);
  return async (gesture: () => Promise<void>): Promise<ScrollRun> => {
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
    return { ...r, main: busy1 - busy0 };
  };
}

/**
 * Checks the guarded scroll metrics and prints the rest. Frames (`<prefix>-frame-p95`, `-frame-mean`) against the
 * per-OS baselines; they sit at the display rate, so they're steady. Main-thread time (`-main-thread`) — what shows
 * extra work first — against the reference build measured in the same run: current ÷ reference (medians) ≤ REF_RATIO.
 * (Until round 6 it had an absolute baseline too: 1 942 ms → limit 2 913 ms, while unchanged builds measured 2 200–2 900.)
 */
function checkScroll(prefix: string, [runs, refRuns]: ScrollRun[][], baseName = prefix) {
  const m = (k: keyof ScrollRun, rs = runs!) => median(rs.map((r) => r[k]));
  check(`${prefix}-frame-p95`, m('p95'), 'scrollP95', `${baseName}-frame-p95`);
  check(`${prefix}-frame-mean`, m('mean'), 'scrollMean', `${baseName}-frame-mean`);
  const cur = m('main');
  const ref = m('main', refRuns!);
  measured[`${prefix}-main-thread`] = round(cur);
  measured[`${prefix}-main-thread-reference`] = round(ref);
  console.log(`[perf] ${prefix}-main-thread ${round(cur)} ms, reference v${REFERENCE.version} ${round(ref)} ms: ×${(cur / ref).toFixed(3)} (limit ×${REF_RATIO})`);
  expect.soft(cur / ref, `${prefix}-main-thread: ${round(cur)} ms vs ${round(ref)} ms on v${REFERENCE.version} in the same run`).toBeLessThanOrEqual(REF_RATIO);
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

/** The reference build's page: same window and zone as the project's, opening dates through the URL (it predates B2). */
const refPage = (browser: Browser, viewport = { width: 1920, height: 1080 }) => browser.newPage({ viewport, timezoneId: 'America/Sao_Paulo' });

/**
 * Round 8: the League List shows one day; scrolling only moves within a busy night, and the days change by navigation.
 * The old month-long wheel gesture (Nov 1 → December through the continuous list) can't run on it any more, so the
 * League List is guarded by two A/B checks against the same reference build, each the same user action on both:
 * - `scroll`: the wheel over the season's busiest kind of night (Nov 2, 15 games) in a short window (1920 × 700, so the
 *   day overflows), 1500 px down and back up. On the reference that scrolls through the continuous list from Nov 2.
 * - `day-nav`: 20 clicks on "Next day" from Nov 2 (both builds have the button): rendering a new day each time.
 * Frames keep the old scroll baselines (`scroll-frame-*`); main-thread time is held to the reference (×1.25).
 */
const BUSY_NIGHT = '2026-11-02';
const SHORT = { width: 1920, height: 700 };
async function openBusyNight(page: Page, base = '') {
  await page.goto(`${base}/?view=league&layout=list&date=${BUSY_NIGHT}`);
  await expect(page.getByTestId('day-title')).toContainText('November 2');
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.getByTestId('league-list').evaluate((el) => (el.scrollTop = 0));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test('wheel-scrolling the League List within a busy night: frame times, main-thread time, long tasks', async ({ page, browser }) => {
  test.setTimeout(240_000);
  // No fake clock here: Playwright's clock wraps Intl.DateTimeFormat, which made scrolling look slower than in a
  // real browser (2026-10-24). The list opens on an explicit date, so it needs no clock.
  await page.setViewportSize(SHORT);
  const ref = await refPage(browser, SHORT);
  const arm = (name: string, p: Page, base: string): Arm => ({
    name,
    page: p,
    reset: () => openBusyNight(p, base),
    gesture: async () => {
      await wheel(p, 'league-list', -1500);
      await wheel(p, 'league-list', 1500);
    },
  });
  checkScroll('scroll', await scrollRunsAB('scroll', [arm('current', page, ''), arm('reference', ref, refBase)]));
  await ref.close();
  // the current build's day overflowed (so the gesture scrolled) and stayed put
  await openBusyNight(page);
  expect(await page.getByTestId('league-list').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100);
  await wheel(page, 'league-list', -1500);
  await expect(page.getByTestId('day-title')).toContainText('November 2');
});

test('League List day by day: 20 × "Next day", frame times and main-thread time', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const ref = await refPage(browser);
  const arm = (name: string, p: Page, base: string): Arm => ({
    name,
    page: p,
    reset: () => openBusyNight(p, base),
    gesture: async () => {
      for (let i = 0; i < 20; i++) {
        await p.getByLabel('Next day').click();
        await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      }
    },
  });
  const runs = await scrollRunsAB('day-nav', [arm('current', page, ''), arm('reference', ref, refBase)]);
  await ref.close();
  checkScroll('day-nav', runs);
  // 20 game days on from Nov 2 (from the served snapshot: Nov 23, 2026)
  const want = await page.evaluate(async (from) => {
    const raw = await (await fetch('/data/schedule.json')).json();
    const days = [...new Set((raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateEst: string }[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId)).map((g) => g.gameDateEst.slice(0, 10)))].sort();
    return days[days.indexOf(from) + 20]!;
  }, BUSY_NIGHT);
  await openBusyNight(page);
  for (let i = 0; i < 20; i++) await page.getByLabel('Next day').click();
  await expect(page.locator('[data-testid="league-list"] [data-day]')).toHaveAttribute('data-day', want);
});

// (round 7, 2.3: the countdown and its "while the countdown ticks" scroll check are gone with it)

/**
 * Team List (round 4: LAL's whole season, ~82 rows + rest rows, wheeled from the first game to the last and back).
 * Round 9: the Team List shows one month, so that gesture can't run on it any more. Like the League List in round 8, two
 * A/B checks against the same reference, each the same user action on both builds (frames keep the old
 * `team-scroll-frame-*` baselines; main thread ≤ ×REF_RATIO the reference):
 * - `team-scroll`: LAL from the top of its list (current: November's 1st row; reference: the season's first game) in a
 *   1920 × 700 window, wheel 1500 px down and back up (the month overflows that window).
 * - `team-month-nav`: 12 clicks on the strip's "Next week" from where the list opens (Nov 15): on the current build
 *   that crosses into December and January (two month changes), on the reference it scrolls the long list.
 */
async function openTeamList(p: Page, base: string) {
  await p.goto(`${base}/?view=team&layout=list&team=LAL`);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete) && !!document.querySelector('[data-testid="team-list"] [data-game-id]'));
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
test('wheel-scrolling the Team List (a month; the reference: the season from its first game)', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await page.setViewportSize(SHORT);
  const ref = await refPage(browser, SHORT);
  const arm = (name: string, p: Page, base: string): Arm => ({
    name,
    page: p,
    reset: async () => {
      await openTeamList(p, base);
      await p.getByTestId('team-list').evaluate((el) => (el.scrollTop = 0));
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    },
    gesture: async () => {
      await wheel(p, 'team-list', -1500);
      await wheel(p, 'team-list', 1500);
    },
  });
  checkScroll('team-scroll', await scrollRunsAB('team-scroll', [arm('current', page, ''), arm('reference', ref, refBase)]));
  await ref.close();
  // the current build's month overflowed the window (so the gesture scrolled)
  await openTeamList(page, '');
  expect(await page.getByTestId('team-list').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(300);
});

test('Team List week by week across months: 12 × the strip’s "Next week", frame times and main-thread time', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await page.clock.setFixedTime(NOW);
  const ref = await refPage(browser);
  await ref.clock.setFixedTime(NOW);
  const arm = (name: string, p: Page, base: string): Arm => ({
    name,
    page: p,
    reset: () => openTeamList(p, base),
    gesture: async () => {
      for (let i = 0; i < 12; i++) {
        await p.getByLabel('Next week').click();
        await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      }
    },
  });
  const runs = await scrollRunsAB('team-month-nav', [arm('current', page, ''), arm('reference', ref, refBase)]);
  await ref.close();
  checkScroll('team-month-nav', runs);
  // the current build crossed two month edges
  await openTeamList(page, '');
  await expect(page.getByTestId('team-month')).toHaveText('November 2026');
  for (let i = 0; i < 12; i++) await page.getByLabel('Next week').click();
  await expect(page.getByTestId('team-month')).toHaveText(/January 2027|February 2027/);
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
