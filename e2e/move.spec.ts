// Round 10 (1.1, 1.5): calendarkit moved to gauntlet-home.vercel.app/calendar/. A browser visit to the old address
// (calendarkit-brown.vercel.app) hands its notes over once and goes on to the new address, path and query kept; a
// failure shows why, with Export notes. A gauntlet page reads the schedule from /calendar/data/ and the notes from the
// same localStorage (one origin).
//
// Locally (and in CI) both real hostnames are routed to this build, the way Vercel serves it: calendarkit's own
// vercel.json (/calendar/* → the build) and gauntlet-home's rewrite (/calendar/* → calendarkit) — so origins, storage and
// referrers are the browser's own. With E2E_BASE_URL=https://gauntlet-home.vercel.app the same tests run on the live sites.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const OLD = 'https://calendarkit-brown.vercel.app';
const NEW = 'https://gauntlet-home.vercel.app';
const LIVE = (process.env.E2E_BASE_URL ?? '').startsWith(NEW);
const NOW = new Date('2026-11-15T15:00:00Z');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'once: addresses, not layout'));

/** This build as Vercel serves it at both hosts (dist/ = calendarkit's deployment). */
async function serveBuild(ctx: BrowserContext, headers: Record<string, string> = {}) {
  if (LIVE) return;
  const dist = resolve('dist');
  const file = (p: string) => {
    const f = join(dist, p);
    return existsSync(f) && statSync(f).isFile() ? f : null;
  };
  await ctx.route(/^https:\/\/(calendarkit-brown|gauntlet-home)\.vercel\.app\//, (route) => {
    const u = new URL(route.request().url());
    const old = u.origin === OLD;
    let f: string | null = null;
    // calendarkit's vercel.json: /calendar, /calendar/ → index.html; /calendar/* → the file; anything else: the file
    if (u.pathname === '/calendar' || u.pathname === '/calendar/') f = file('index.html');
    else if (u.pathname.startsWith('/calendar/')) f = file(u.pathname.slice('/calendar/'.length));
    else if (old) f = u.pathname === '/' ? file('index.html') : file(u.pathname.slice(1));
    else if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>gauntlet</title><p>whiteboard</p>' });
    if (!f) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ contentType: TYPES[extname(f)] ?? 'application/octet-stream', body: readFileSync(f), headers: old ? headers : {} });
  });
}

/** Every top-level navigation of `page`, in order. */
const navigations = (page: Page) => {
  const urls: string[] = [];
  page.on('framenavigated', (f) => f === page.mainFrame() && urls.push(f.url()));
  return urls;
};

/** Puts notes into an origin's localStorage before that origin's page runs (once per context). */
const seed = (ctx: BrowserContext, origin: string, value: unknown) =>
  ctx.addInitScript(
    ({ origin, value }) => {
      if (location.origin === origin && !sessionStorage.getItem('ck:test-seeded')) {
        localStorage.setItem('ck:notes:v1', JSON.stringify(value));
        sessionStorage.setItem('ck:test-seeded', '1');
      }
    },
    { origin, value },
  );

const notesAt = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('ck:notes:v1') ?? '{}'));

// two real games of Nov 2, 2026 (15 games in the snapshot)
const raw = JSON.parse(readFileSync('public/data/schedule.json', 'utf8')) as { leagueSchedule: { gameDates: { games: { gameId: string; gameDateEst: string }[] }[] } };
const nov2 = raw.leagueSchedule.gameDates.flatMap((d) => d.games).filter((g) => g.gameDateEst.startsWith('2026-11-02') && /^002/.test(g.gameId));
const [A, B, C] = [nov2[0]!.gameId, nov2[1]!.gameId, nov2[2]!.gameId];
const NOTES = { [A]: { pre: 'Pre note A', live: 'Live note A', post: 'Post note A', shown: 'live' }, [B]: { pre: '', live: '', post: 'Post only B', shown: 'post' } };

test('/calendar loads through the gauntlet (rewrite), all of it under /calendar/; no redirect there', async ({ page, context }) => {
  await serveBuild(context);
  const nav = navigations(page);
  const failed: string[] = [];
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  await page.clock.setFixedTime(NOW);
  await page.goto(`${NEW}/calendar/?view=league&layout=slate`);
  await expect(page.locator('[data-testid="slate"] .ck-slate-card').first()).toBeVisible();
  await expect(page.getByTestId('site-version')).toBeVisible();
  expect(nav).toEqual([`${NEW}/calendar/?view=league&layout=slate`]);
  expect(failed).toEqual([]);
  // the logos and the snapshot came from /calendar/
  const srcs = await page.locator('img').evaluateAll((is) => is.map((i) => (i as HTMLImageElement).src));
  expect(srcs.length).toBeGreaterThan(0);
  for (const s of srcs) expect(s).toMatch(new RegExp(`^${NEW}/calendar/logos/[A-Z]{3}\\.svg$`));
  // and the version file
  const v = await page.evaluate(async () => (await fetch('/calendar/version.json')).json());
  expect(v.version).toMatch(/^\d+\.\d+\.\d+$/);
});

test('the old address, no notes there: straight on to the new one, path under /calendar/ and query kept — no loop', async ({ page, context }) => {
  await serveBuild(context);
  const nav = navigations(page);
  await page.clock.setFixedTime(NOW);
  await page.goto(`${OLD}/?view=team&layout=list&team=BOS`);
  await page.waitForURL(`${NEW}/calendar/?view=team&layout=list&team=BOS`);
  await expect(page.getByTestId('team-list')).toBeVisible();
  expect(nav).toEqual([`${OLD}/?view=team&layout=list&team=BOS`, `${NEW}/calendar/?view=team&layout=list&team=BOS`]);
  await page.waitForTimeout(1500); // and it stays there
  expect(nav).toHaveLength(2);
  // an old address already under /calendar/ keeps its path
  await page.goto(`${OLD}/calendar/?view=league`);
  await page.waitForURL(`${NEW}/calendar/?view=league`);
});

test('notes on the old address are handed over once: same notes (every slot, the one on show) at /calendar, shown in the Slate', async ({ page, context }) => {
  await serveBuild(context);
  await seed(context, OLD, NOTES);
  const nav = navigations(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => ((window as unknown as { __ckOpenDate?: string }).__ckOpenDate = '2026-11-02'));
  await page.goto(`${OLD}/?view=league&layout=slate`);
  await page.waitForURL(`${NEW}/calendar/?view=league&layout=slate`);
  expect(nav.map((u) => u.replace(/#ck-handoff=.*/, '#…'))).toEqual([
    `${OLD}/?view=league&layout=slate`,
    `${NEW}/calendar/#…`,
    `${NEW}/calendar/`, // the same page taking the notes out of its address (history.replaceState)
    `${OLD}/calendar/?ck-handoff=done&nonce=${new URL(nav[3]!).searchParams.get('nonce')}&games=2`,
    `${NEW}/calendar/?view=league&layout=slate`,
  ]);
  expect(await notesAt(page)).toEqual(NOTES);
  await expect(page.locator(`[data-game-id="${A}"] [data-testid="note-slot"]`)).toHaveText('LIVE');
  await expect(page.locator(`[data-game-id="${A}"] textarea`)).toHaveValue('Live note A');
  await expect(page.locator(`[data-game-id="${B}"] textarea`)).toHaveValue('Post only B');
  // the notes never stayed in the address bar or the history
  expect(page.url()).not.toContain('ck-handoff');
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(2);

  // a second visit: no second hand-off — a note changed since at the new address stays as it is
  await page.locator(`[data-game-id="${A}"] textarea`).fill('Edited at the new address');
  await page.locator(`[data-game-id="${A}"] textarea`).blur();
  const nav2 = navigations(page);
  await page.goto(`${OLD}/?view=league&layout=list`);
  await page.waitForURL(`${NEW}/calendar/?view=league&layout=list`);
  expect(nav2).toEqual([`${OLD}/?view=league&layout=list`, `${NEW}/calendar/?view=league&layout=list`]);
  expect((await notesAt(page))[A].live).toBe('Edited at the new address');
  expect(Object.keys(await notesAt(page))).toHaveLength(2);
});

test('notes already at the new address survive the hand-off (round 9 import rule: no empty slot overwrites)', async ({ page, context }) => {
  await serveBuild(context);
  await seed(context, OLD, { [A]: { pre: 'old pre A', live: '', post: '', shown: 'pre' } });
  await seed(context, NEW, { [A]: { pre: '', live: 'new live A', post: 'new post A', shown: 'post' }, [C]: { pre: 'only at the new address', live: '', post: '', shown: 'pre' } });
  // the new address's page must have run once (and stored its notes) before the old one hands over
  await page.goto(`${NEW}/calendar/`);
  await expect.poll(() => notesAt(page)).toHaveProperty(C);
  await page.goto(`${OLD}/`);
  await page.waitForURL(`${NEW}/calendar/`);
  expect(await notesAt(page)).toEqual({
    [A]: { pre: 'old pre A', live: 'new live A', post: 'new post A', shown: 'pre' },
    [C]: { pre: 'only at the new address', live: '', post: '', shown: 'pre' },
  });
});

test('hand-off fails (storage full at the new address): no redirect — the old page says why and exports the notes', async ({ page, context }) => {
  test.skip(LIVE, 'needs the new side made to fail');
  await serveBuild(context);
  await seed(context, OLD, NOTES);
  await context.addInitScript((origin) => {
    if (location.origin !== origin) return;
    Storage.prototype.setItem = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
  }, NEW);
  await page.goto(`${OLD}/?view=league`);
  await expect(page.getByTestId('handoff-failed')).toBeVisible();
  expect(new URL(page.url()).origin).toBe(OLD);
  await expect(page.getByTestId('handoff-reason')).toHaveText('the browser storage at the new address is full');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('handoff-export').click()]);
  expect(download.suggestedFilename()).toMatch(/^calendarkit-notes-\d{4}-\d{2}-\d{2}\.json$/);
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(file).toMatchObject({ format: 'ck:notes:v1', notes: NOTES });
  // the notes are still at the old address, not marked as handed off; it stays put
  expect(await notesAt(page)).toEqual(NOTES);
  expect(await page.evaluate(() => localStorage.getItem('ck:notes:handoff:v1'))).toBeNull();
  await page.waitForTimeout(1000);
  expect(new URL(page.url()).origin).toBe(OLD);
  await expect(page.getByTestId('handoff-continue')).toHaveAttribute('href', `${NEW}/calendar/?view=league`);
});

test('a browser that hides the referrer: the hand-off cannot be trusted, so the old page says so and offers Export (never silent)', async ({ page, context }) => {
  test.skip(LIVE, 'needs the old address served with no-referrer');
  await serveBuild(context, { 'referrer-policy': 'no-referrer' });
  await seed(context, OLD, NOTES);
  await page.goto(`${OLD}/?view=league`);
  await expect(page.getByTestId('handoff-failed')).toBeVisible();
  expect(new URL(page.url()).origin).toBe(OLD);
  await expect(page.getByTestId('handoff-reason')).toHaveText('the browser did not say where they came from (its referrer is hidden)');
  await expect(page.getByTestId('handoff-export')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ck:notes:handoff:v1'))).toBeNull();
});

test('a gauntlet page (same origin) reads the schedule from /calendar/data/ and the notes calendarkit stored', async ({ page, context }) => {
  await serveBuild(context);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => ((window as unknown as { __ckOpenDate?: string }).__ckOpenDate = '2026-11-02'));
  await page.goto(`${NEW}/calendar/?view=league&layout=slate`);
  await page.locator(`[data-game-id="${A}"] textarea`).fill('typed in calendarkit');
  await page.locator(`[data-game-id="${A}"] textarea`).blur();
  const board = await context.newPage();
  const cors: string[] = [];
  board.on('console', (m) => /CORS|Access-Control/i.test(m.text()) && cors.push(m.text()));
  await board.goto(`${NEW}/`);
  const r = await board.evaluate(async () => {
    const res = await fetch('/calendar/data/schedule.json');
    const json = await res.json();
    return { ok: res.ok, type: res.type, games: json.leagueSchedule.gameDates.length, notes: JSON.parse(localStorage.getItem('ck:notes:v1') ?? '{}') };
  });
  expect(r.ok).toBe(true);
  expect(r.type).toBe('basic'); // same origin: no CORS involved
  expect(r.games).toBeGreaterThan(100);
  expect(r.notes[A].pre).toBe('typed in calendarkit');
  expect(cors).toEqual([]);
});
