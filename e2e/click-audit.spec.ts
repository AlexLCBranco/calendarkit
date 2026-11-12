// The click rule, audited in every desktop view at 1920 × 1080 against the built app.
//   1. Nothing looks clickable and does nothing: every element whose own cursor is a pointer (where the pointer starts —
//      children inherit it) is, or sits inside, a real control: a link with an href, an enabled button / input /
//      select / label, a tab / option / checkbox / sortable header, or a hover-popup trigger (streak, season series).
//   2. Game things open the game's hoopsjunkie page in a new tab: every final score, Cup game square and season-series
//      square sits in an <a target="_blank"> to https://hoopsjunkie.io/games/….
//   3. Team names and logos are team links (the full per-view check with real clicks is teamlinks.spec.ts).

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

const NOW = new Date('2026-11-15T15:00:00Z'); // Sun Nov 15, 12:00 in São Paulo (the tests' zone): games to come
// the snapshot's last night with finals, read here: "a past night" opens the day after it, then steps back one day
const raw = JSON.parse(readFileSync('public/data/schedule.json', 'utf8')) as { leagueSchedule: { gameDates: { games: { gameStatus: number; gameDateEst: string }[] }[] } };
const lastFinal = raw.leagueSchedule.gameDates.flatMap((d) => d.games).filter((g) => g.gameStatus === 3).map((g) => g.gameDateEst.slice(0, 10)).sort().at(-1)!;
const AFTER = new Date(Date.parse(`${lastFinal}T12:00:00Z`) + 86_400_000 + 3 * 3_600_000); // next day, 12:00 in São Paulo

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'desktop, 1920 px: every view fits'));

type View = { name: string; search: string; ready: string; now?: Date; prepare?: (p: Page) => Promise<void> };

const VIEWS: View[] = [
  { name: 'League List', search: '?view=league&layout=list', ready: '[data-testid="league-list"] [data-game-id]' },
  { name: 'League Calendar, 1 week', search: '?view=league&layout=calendar&weeks=1', ready: '.ck-month-game' },
  { name: 'League Calendar, 2 weeks', search: '?view=league&layout=calendar&weeks=2', ready: '.ck-month-game' },
  { name: 'Slate', search: '?view=league&layout=slate', ready: '.ck-slate-card' },
  { name: 'Slate, a past night (finals)', search: '?view=league&layout=slate', ready: '.ck-slate-card', now: AFTER, prepare: (p) => p.getByRole('button', { name: 'Previous day' }).first().click() },
  { name: 'League List, a past night (finals)', search: '?view=league&layout=list', ready: '[data-testid="league-list"] [data-game-id]', now: AFTER, prepare: (p) => p.getByRole('button', { name: 'Previous day' }).first().click() },
  { name: 'Team List with finals', search: '?view=team&layout=list&team=BOS', ready: '[data-testid="team-list"] article', now: AFTER },
  { name: 'Team List', search: '?view=team&layout=list&team=BOS', ready: '[data-testid="team-list"] article' },
  { name: 'Team Calendar', search: '?view=team&layout=calendar&team=BOS', ready: '.ck-team-grid [data-game-id]' },
  { name: 'Cup groups', search: '?view=cup', ready: '.ck-cup-row' },
  { name: 'Cup schedule by group', search: '?view=cup&cup=schedule', ready: '[data-testid="cup-league"] [data-game-id]' },
  { name: 'Cup schedule by date', search: '?view=cup&cup=schedule&by=date', ready: '[data-testid="cup-league"] [data-game-id]' },
  { name: 'Cup simulator', search: '?view=cup&cup=simulator', ready: '[data-testid="sim-game"]' },
  { name: 'Cup history', search: '?view=cup&cup=history', ready: '[data-testid="cup-history"], .ck-hist' },
  { name: 'Standings', search: '?view=standings', ready: '[data-testid="standings"] tr' },
];

async function open(page: Page, v: View) {
  await page.clock.setFixedTime(v.now ?? NOW);
  await page.goto(`${APP}${v.search}`);
  await page.waitForSelector(v.ready);
  await v.prepare?.(page);
  await page.waitForTimeout(300);
  await page.evaluate(() => document.fonts.ready);
}

/** Pointer-cursor elements with no action (rule 1), as short HTML snippets. */
const deadPointers = (page: Page) =>
  page.evaluate(() => {
    const ACTION =
      'a[href], button:not(:disabled), input:not(:disabled), select, label, summary, [role="tab"], [role="option"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="button"], th[aria-sort], [data-streak], [data-series-game], [data-sort]';
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (getComputedStyle(el).cursor !== 'pointer') continue;
      const parent = el.parentElement;
      if (parent && getComputedStyle(parent).cursor === 'pointer') continue; // inherited: its parent is the one checked
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('[aria-hidden="true"], .ck-capture-stage')) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest(ACTION) || el.querySelector(ACTION)) continue;
      out.push(el.outerHTML.slice(0, 160));
    }
    return out;
  });

/** Game things not inside a hoopsjunkie game link (rule 2). */
const unlinkedGameThings = (page: Page) =>
  page.evaluate(() => {
    const GAME = '.ck-score, .ck-slate-score:not(:empty), .ck-cup-slot.ck-cup-slot-w, .ck-cup-slot.ck-cup-slot-l, .ck-cup-slot-next, [data-testid="series-square"], [data-testid="cup-result"] .ck-score-win';
    const out: string[] = [];
    let n = 0;
    for (const el of document.querySelectorAll<HTMLElement>(GAME)) {
      if (!el.getBoundingClientRect().width || el.closest('.ck-capture-stage')) continue;
      n++;
      const a = el.closest<HTMLAnchorElement>('a[href]') ?? el.querySelector<HTMLAnchorElement>(':scope > a[href]');
      if (!a || a.target !== '_blank' || !/^https:\/\/hoopsjunkie\.io\/games\/\d{4}-\d{2}-\d{2}\/[a-z]{3}-vs-[a-z]{3}$/.test(a.href)) out.push(el.outerHTML.slice(0, 160));
    }
    return { n, out };
  });

/** Team names / logos that are not team links (rule 3). */
const plainTeams = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.ck-logo-backing, .ck-team, .ck-slate-name, .ck-cup-name, .ck-cup-tri')]
      .filter((e) => e.offsetParent !== null && !e.closest('[data-testid="team-picker"], [role="listbox"], .ck-capture-stage'))
      .filter((e) => !(e.closest('[data-testid="team-header"]') && !e.closest('[data-testid="cup-team"]')))
      .filter((e) => !e.matches('a[data-team-link]') && !e.closest('a[data-team-link]'))
      .map((e) => e.outerHTML.slice(0, 160)),
  );

for (const v of VIEWS)
  test(`${v.name}: nothing clickable-looking is dead; game things → hoopsjunkie; teams → team links`, async ({ page }) => {
    await open(page, v);
    expect(await deadPointers(page), 'pointer cursor without an action').toEqual([]);
    const games = await unlinkedGameThings(page);
    expect(games.out, 'game things without their game page').toEqual([]);
    expect(await plainTeams(page), 'team elements that are not team links').toEqual([]);
  });

test('popups: streak and season series — every game in them is its game page, every team a team link', async ({ page }) => {
  await open(page, VIEWS[4]!); // a past night's Slate: streaks and series chips with finals
  expect(await page.locator('.ck-slate-score:not(:empty)').count()).toBeGreaterThan(0);
  const streak = page.locator('[data-testid="slate-streak"][data-streak]').first();
  await streak.hover();
  const sp = page.getByTestId('streak-popup');
  await expect(sp).toBeVisible();
  expect(await deadPointers(page)).toEqual([]);
  const rows = sp.getByTestId('streak-row');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const a of await sp.locator('a.ck-streak-game').all()) await expect(a).toHaveAttribute('href', /^https:\/\/hoopsjunkie\.io\/games\//);
  await page.mouse.move(2, 2);
  await expect(sp).toBeHidden();
  const chip = page.getByTestId('series-chip').first();
  await chip.hover();
  const pop = page.getByTestId('series-popup');
  await expect(pop).toBeVisible();
  expect(await deadPointers(page)).toEqual([]);
  const g = await unlinkedGameThings(page);
  expect(g.out).toEqual([]);
  expect(g.n).toBeGreaterThan(0);
});

test('a score click opens its game page in a new tab and this page stays', async ({ page, context }) => {
  await open(page, VIEWS[4]!);
  const score = page.locator('.ck-slate-score:not(:empty)').first();
  await expect(score).toBeVisible();
  const before = page.url();
  const [tab] = await Promise.all([context.waitForEvent('page'), score.click()]);
  expect(tab.url()).toMatch(/^https:\/\/hoopsjunkie\.io\/games\/\d{4}-\d{2}-\d{2}\/[a-z]{3}-vs-[a-z]{3}$/);
  await tab.close();
  expect(page.url()).toBe(before);
});
