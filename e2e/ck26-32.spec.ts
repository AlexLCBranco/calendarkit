// CK-26 … CK-32 against the built app, at 1920 × 1080 (the owner's full-size window):
//   CK-26  a Cup label opens the Cup page on the game's group (group games) or on the bracket (knockout games)
//   CK-27  hovering a Cup label shows that group's table, the game's two teams highlighted
//   CK-28  a team's record opens that team's List, rest days on, the day in view
//   CK-29  a Team Calendar cell has the opponent's line (record, back-to-back night)
//   CK-30  a Team Calendar month needs no page scroll (its controls are in the header since CK-33: ck33.spec.ts)
//   CK-31  a past season's playoff games in the season-series popup, and "View series"
//   CK-32  holidays and big NBA dates marked on the calendar and the Slate
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

type RawTeam = { teamTricode: string };
type RawGame = { gameId: string; gameDateEst: string; gameSubLabel?: string; gameSubtype?: string; homeTeam: RawTeam; awayTeam: RawTeam };
const raw = JSON.parse(readFileSync('public/data/schedule.json', 'utf8')) as { leagueSchedule: { gameDates: { games: RawGame[] }[] } };
const GAMES = raw.leagueSchedule.gameDates.flatMap((d) => d.games).filter((g) => g.gameDateEst >= '2026-10-20');
const dateOf = (g: RawGame) => g.gameDateEst.slice(0, 10);
const byId = new Map(GAMES.map((g) => [g.gameId, g]));
const CUP_NIGHT = dateOf(GAMES.find((g) => g.gameSubtype === 'in-season' && dateOf(g) >= '2026-11-20')!);

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'the owner\'s window: 1920 × 1080'));

const at = async (page: Page, day: string, search: string) => {
  await page.clock.setFixedTime(new Date(`${day}T15:00:00Z`));
  await page.goto(`${APP}${search}${search.includes('date=') ? '' : `&date=${day}`}`);
};

test.describe('CK-26: the Cup label opens the Cup page', () => {
  test('Slate card, a group game: Groups, on that game\'s group', async ({ page }) => {
    await at(page, CUP_NIGHT, '?view=league&layout=slate');
    const label = page.locator('[data-testid="slate"] a[data-testid="cup-label"]').first();
    await expect(label).toHaveCSS('cursor', 'pointer');
    const id = (await label.getAttribute('data-cup-link'))!;
    const group = byId.get(id)!.gameSubLabel!;
    await label.click();
    await expect(page.locator('[data-testid="cup-group"][data-focus]')).toHaveAttribute('data-group', group);
    await expect(page.locator('[data-testid="cup-group"][data-focus]')).toBeInViewport();
    expect(new URL(page.url()).searchParams.get('view')).toBe('cup');
    expect(new URL(page.url()).searchParams.get('cg')).toBe(group);
    // back brings the Slate back
    await page.goBack();
    await expect(page.locator('[data-testid="slate"] .ck-slate-card').first()).toBeVisible();
  });

  test('League List row: the same', async ({ page }) => {
    await at(page, CUP_NIGHT, '?view=league&layout=list');
    const label = page.locator('[data-testid="league-list"] a[data-testid="cup-label"]').last();
    const group = byId.get((await label.getAttribute('data-cup-link'))!)!.gameSubLabel!;
    await label.click();
    await expect(page.locator('[data-testid="cup-group"][data-focus]')).toHaveAttribute('data-group', group);
  });

  test('a knockout game lands on the bracket', async ({ page }) => {
    const ko = GAMES.find((g) => g.gameSubtype === 'in-season-knockout')!;
    await at(page, dateOf(ko), '?view=league&layout=slate');
    await page.locator('[data-testid="slate"] a[data-testid="cup-label"]').first().click();
    await expect(page.getByTestId('cup-sim')).toHaveAttribute('data-focus', 'bracket');
    await expect(page.getByTestId('sim-bracket')).toBeInViewport();
    expect(new URL(page.url()).searchParams.get('cup')).toBe('simulator');
  });

  test('the address a host links to opens the Cup page on that group', async ({ page }) => {
    await at(page, CUP_NIGHT, '?view=cup&cg=East+Group+B');
    await expect(page.locator('[data-testid="cup-group"][data-focus]')).toHaveAttribute('data-group', 'East Group B');
  });
});

test('CK-27: hovering the Cup label shows the group, both teams highlighted; a click inside pins it', async ({ page }) => {
  await at(page, CUP_NIGHT, '?view=league&layout=slate');
  const label = page.locator('[data-testid="slate"] a[data-testid="cup-label"]').first();
  const g = byId.get((await label.getAttribute('data-cup-link'))!)!;
  await label.hover();
  const pop = page.getByTestId('cup-popup');
  await expect(pop).toBeVisible();
  await expect(pop.getByTestId('cup-pop-group')).toHaveCount(1);
  await expect(pop.getByTestId('cup-pop-group')).toHaveAttribute('data-group', g.gameSubLabel!);
  await expect(pop.locator('tbody tr')).toHaveCount(5);
  const on = await pop.locator('tbody tr[data-on]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-team')).sort());
  expect(on).toEqual([g.awayTeam.teamTricode, g.homeTeam.teamTricode].sort());
  // every row: a Cup record
  for (const rec of await pop.locator('.ck-cuppop-rec').allTextContents()) expect(rec).toMatch(/^\d-\d$/);
  await expect(pop.getByTestId('cup-pop-foot')).toHaveText('Click the label: Open the NBA Cup page');
  // away: closed fast
  await page.mouse.move(5, 600);
  await expect(pop).toBeHidden({ timeout: 1000 });
  // a click inside pins it
  await label.hover();
  await pop.locator('th').first().click();
  await expect(pop).toHaveAttribute('data-pinned', 'true');
  await page.mouse.move(5, 600);
  await page.waitForTimeout(300);
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
});

test.describe('CK-28: a record opens the team\'s List', () => {
  test('Slate card: that team\'s List, rest days on, the day in view', async ({ page }) => {
    await at(page, CUP_NIGHT, '?view=league&layout=slate');
    const rec = page.locator('[data-testid="slate"] a[data-testid="slate-rec"]').first();
    const tri = (await rec.locator('xpath=ancestor::*[contains(@class,"ck-slate-row")]').locator('[data-tricode]').getAttribute('data-tricode'))!;
    expect((await rec.getAttribute('data-tip'))!.split('\n')[0]).toBe(`All ${tri} games`);
    await rec.click();
    await expect(page.getByTestId('team-list')).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get('view')).toBe('team');
    expect(url.searchParams.get('team')).toBe(tri);
    await expect(page.locator('[data-testid="team-list"] .ck-rest-row').first()).toBeVisible();
    await expect(page.locator(`[data-testid="team-list"] [data-row-date="${CUP_NIGHT}"]`)).toBeInViewport();
    // the name still goes to the Calendar
    await page.goBack();
    await page.locator('[data-testid="slate"] a.ck-slate-name').first().click();
    await expect(page.locator('.ck-team-grid')).toBeVisible();
  });

  test('League List row: the same', async ({ page }) => {
    await at(page, CUP_NIGHT, '?view=league&layout=list');
    const rec = page.locator('[data-testid="league-list"] a[data-testid="row-rec"]').first();
    await expect(rec).toHaveAttribute('title', /^All [A-Z]{3} games/);
    await rec.click();
    await expect(page.getByTestId('team-list')).toBeVisible();
    await expect(page.locator('[data-testid="team-list"] .ck-rest-row').first()).toBeVisible();
  });
});

test('CK-29: a Team Calendar cell shows the opponent\'s record and its back-to-back night', async ({ page }) => {
  // a BOS game in November whose opponent also played the day before (its 2nd night)
  const played = (tri: string, day: string) => GAMES.some((g) => dateOf(g) === day && (g.homeTeam.teamTricode === tri || g.awayTeam.teamTricode === tri));
  const prevDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const game = GAMES.filter((g) => dateOf(g).startsWith('2026-11') && [g.homeTeam.teamTricode, g.awayTeam.teamTricode].includes('BOS')).find((g) => {
    const opp = g.homeTeam.teamTricode === 'BOS' ? g.awayTeam.teamTricode : g.homeTeam.teamTricode;
    return played(opp, prevDay(dateOf(g)));
  })!;
  const opp = game.homeTeam.teamTricode === 'BOS' ? game.awayTeam.teamTricode : game.homeTeam.teamTricode;
  await at(page, '2026-11-20', '?view=team&layout=calendar&team=BOS');
  const line = page.locator(`.ck-team-grid [data-date="${dateOf(game)}"] [data-testid="opp-line"]`);
  await expect(line).toHaveAttribute('data-team', opp);
  await expect(line.getByTestId('opp-rec')).toHaveText(/^\d+-\d+$/);
  await expect(line.getByTestId('opp-b2b')).toHaveAttribute('data-night', '2');
  // always on screen, inside its cell
  await expect(line).toBeInViewport();
  const fits = await line.evaluate((el) => {
    const c = el.closest('.ck-day-cell')!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.bottom <= c.bottom + 0.5 && r.right <= c.right + 0.5;
  });
  expect(fits).toBe(true);
  // every game cell of the month has the line; week views give the streak too
  const cells = await page.locator('.ck-team-grid .ck-cell-game').count();
  await expect(page.locator('.ck-team-grid [data-testid="opp-line"]')).toHaveCount(cells);
  await page.getByRole('tab', { name: '2 weeks' }).or(page.getByRole('radio', { name: '2 weeks' })).or(page.getByRole('button', { name: '2 weeks' })).first().click();
  await expect(page.locator('.ck-team-grid [data-testid="opp-streak"]').first()).toBeVisible();
});

test.describe('CK-30: one menu layer', () => {
  for (const [name, search] of [['Team Calendar month', '?view=team&layout=calendar&team=BOS'], ['Team Calendar 2 weeks', '?view=team&layout=calendar&team=BOS&span=2w']] as const) {
    test(`${name}: fits the window, no page scroll`, async ({ page }) => {
      await at(page, '2026-11-20', search);
      await expect(page.locator('.ck-team-grid [data-game-id]').first()).toBeVisible();
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, win: window.innerHeight, wide: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(m.doc).toBeLessThanOrEqual(m.win);
      expect(m.wide).toBeLessThanOrEqual(m.cw);
    });
  }

});

test('CK-31: a past season\'s playoff games in the season-series popup, apart from the regular season; "View series"', async ({ page }) => {
  // DET – ORL met in the 2026 first round (public/data/history/2026.json)
  const g = GAMES.find((x) => [x.homeTeam.teamTricode, x.awayTeam.teamTricode].sort().join() === 'DET,ORL')!;
  await at(page, dateOf(g), '?view=league&layout=slate');
  await page.locator(`[data-testid="slate"] [data-game-id="${g.gameId}"] [data-testid="series-chip"]`).hover();
  const pop = page.getByTestId('series-popup');
  await expect(pop).toBeVisible();
  await expect(pop.getByTestId('series-playoffs')).toHaveCount(0); // this season: no playoff games yet
  await pop.getByTestId('series-prev-season').click();
  await expect(pop.getByTestId('series-season')).toHaveText('2025-26');
  const files = await page.evaluate(async () => ({
    hist: (await (await fetch('/calendar/data/history/2026.json')).json()) as { series: { round: number; a: string; b: string; winner: string; wins: [number, number]; games: unknown[] }[] },
    past: (await (await fetch('/calendar/data/past-seasons.json')).json()) as { seasons: Record<string, [string, string, string][]> },
  }));
  const s = files.hist.series.find((x) => [x.a, x.b].sort().join() === 'DET,ORL')!;
  const regular = files.past.seasons['2025-26']!.filter((x) => [x[1], x[2]].sort().join() === 'DET,ORL').length;
  await expect(pop.getByTestId('series-po-line')).toHaveText(`Playoffs · East 1st round · ${s.winner} won ${Math.max(...s.wins)}-${Math.min(...s.wins)}`);
  await expect(pop.getByTestId('series-po-square')).toHaveCount(s.games.length);
  // the regular-season squares and count don't include them
  await expect(pop.getByTestId('series-square')).toHaveCount(regular);
  await expect(pop.getByTestId('series-count')).toHaveText(` · ${regular} meeting${regular === 1 ? '' : 's'}`);
  // highlighted: not the regular squares' border colour
  const [po, reg] = [await pop.getByTestId('series-po-square').first().evaluate((el) => getComputedStyle(el).borderTopColor), await pop.getByTestId('series-square').first().evaluate((el) => getComputedStyle(el).borderTopColor)];
  expect(po).not.toBe(reg);
  await expect(pop.getByTestId('series-po-square').first()).toContainText('G1');
  await pop.getByTestId('series-view').click();
  await expect(page.getByTestId('nba-history')).toHaveAttribute('data-year', '2026');
  const box = page.locator('[data-testid="hist-series"][data-focus]');
  await expect(box).toHaveCount(1);
  await expect(box).toHaveAttribute('data-hist-series', `${s.round}|${s.a}|${s.b}`);
  await expect(box).toBeInViewport();
  expect(new URL(page.url()).searchParams.get('season')).toBe('2026');
});

test.describe('CK-32: holidays and big dates', () => {
  test('25 December: "Christmas" on the calendar cell and on the Slate, with why', async ({ page }) => {
    await at(page, '2026-12-25', '?view=team&layout=calendar&team=NYK');
    const label = page.locator('.ck-team-grid [data-date="2026-12-25"] [data-testid="big-day"]');
    await expect(label).toHaveText('Christmas');
    await label.hover();
    await expect(page.getByTestId('tooltip')).toHaveText('Christmas Day: the whole country watches these games');
    // the Cup's knockout nights are marked in the same month
    await expect(page.locator('.ck-team-grid [data-testid="big-day"]', { hasText: 'Cup final' })).toHaveCount(1);

    await at(page, '2026-12-25', '?view=league&layout=slate');
    await expect(page.getByTestId('slate-header').getByTestId('big-day')).toHaveText('Christmas');
    const cards = await page.locator('[data-testid="slate"] .ck-slate-card').count();
    expect(cards).toBeGreaterThan(0);
    await expect(page.locator('[data-testid="slate"] [data-testid="big-day-mark"]')).toHaveCount(cards);
  });

  test('the League List heading, the League Calendar and an ordinary day', async ({ page }) => {
    await at(page, '2026-12-25', '?view=league&layout=list');
    await expect(page.locator('.ck-lday-head [data-testid="big-day"]')).toHaveText('Christmas');
    await expect(page.locator('[data-testid="league-list"] [data-testid="big-day-mark"]').first()).toBeVisible();
    await at(page, '2026-12-25', '?view=league&layout=calendar&weeks=1');
    await expect(page.locator('[data-date="2026-12-25"] [data-testid="big-day"]')).toHaveText('Christmas');
    await at(page, '2026-11-17', '?view=league&layout=slate');
    await expect(page.locator('[data-testid="slate"] .ck-slate-card').first()).toBeVisible();
    await expect(page.getByTestId('big-day')).toHaveCount(0);
    await expect(page.getByTestId('big-day-mark')).toHaveCount(0);
  });
});
