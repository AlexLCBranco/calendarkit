// CK-35 and CK-36 against the built app, at 1920 × 1080 (the owner's full-size window):
//   CK-35  the season-series popup's past-season squares (regular season, play-in, playoffs) open NBA.com's games of
//          that date in a new tab; this season's squares keep their hoopsjunkie link
//   CK-36  a holiday / big-date label opens the league Slate of its day (a new page: back returns); the Slate's own
//          header label is not a link
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from './fixtures';
import { APP } from './app';

type RawTeam = { teamTricode: string };
type RawGame = { gameId: string; gameDateEst: string; homeTeam: RawTeam; awayTeam: RawTeam };
const raw = JSON.parse(readFileSync('public/data/schedule.json', 'utf8')) as { leagueSchedule: { gameDates: { games: RawGame[] }[] } };
const GAMES = raw.leagueSchedule.gameDates.flatMap((d) => d.games).filter((g) => g.gameDateEst >= '2026-10-20');
const dateOf = (g: RawGame) => g.gameDateEst.slice(0, 10);
const meeting = (a: string, b: string) => GAMES.find((x) => [x.homeTeam.teamTricode, x.awayTeam.teamTricode].sort().join() === [a, b].sort().join())!;

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'the owner\'s window: 1920 × 1080'));

const at = async (page: Page, day: string, search: string) => {
  await page.clock.setFixedTime(new Date(`${day}T15:00:00Z`));
  await page.goto(`${APP}${search}&date=${day}`);
};

/** The season-series popup of the first meeting of two teams, opened from its Slate card. */
async function seriesPopup(page: Page, a: string, b: string) {
  const g = meeting(a, b);
  await at(page, dateOf(g), '?view=league&layout=slate');
  await page.locator(`[data-testid="slate"] [data-game-id="${g.gameId}"] [data-testid="series-chip"]`).hover();
  const pop = page.getByTestId('series-popup');
  await expect(pop).toBeVisible();
  return pop;
}

/** Every square is one link, in a new tab, to NBA.com's games of the square's own date. */
async function expectNbaLinks(squares: Locator, count: number) {
  await expect(squares).toHaveCount(count);
  for (const sq of await squares.all()) {
    const date = await sq.getAttribute('data-date');
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const a = sq.locator('a');
    await expect(a).toHaveCount(1);
    await expect(a).toHaveAttribute('href', `https://www.nba.com/games?date=${date}`);
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('title', 'Open on NBA.com');
    // the whole square is the link
    const [box, link] = [(await sq.boundingBox())!, (await a.boundingBox())!];
    expect(link.width).toBeGreaterThan(box.width - 6);
    expect(link.height).toBeGreaterThan(box.height * 0.6);
  }
}

test.describe('CK-35: the season-series popup\'s past-season games open NBA.com', () => {
  test('regular-season and playoff squares of last season; this season\'s keep hoopsjunkie', async ({ page }) => {
    // DET – ORL met in the 2026 first round (public/data/history/2026.json)
    const pop = await seriesPopup(page, 'DET', 'ORL');
    // this season: the game pages on hoopsjunkie, none on NBA.com
    const now = pop.getByTestId('series-link');
    expect(await now.count()).toBeGreaterThan(0);
    for (const href of await now.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href))) expect(href).toContain('hoopsjunkie');
    await expect(pop.locator('a[href*="nba.com"]')).toHaveCount(0);

    await pop.getByTestId('series-prev-season').click();
    await expect(pop.getByTestId('series-season')).toHaveText('2025-26');
    const files = await page.evaluate(async () => ({
      hist: (await (await fetch('/calendar/data/history/2026.json')).json()) as { series: { a: string; b: string; games: { date: string }[] }[] },
      past: (await (await fetch('/calendar/data/past-seasons.json')).json()) as { seasons: Record<string, [string, string, string][]> },
    }));
    const regular = files.past.seasons['2025-26']!.filter((x) => [x[1], x[2]].sort().join() === 'DET,ORL');
    const series = files.hist.series.find((x) => [x.a, x.b].sort().join() === 'DET,ORL')!;
    expect(regular.length).toBeGreaterThan(0);
    await expectNbaLinks(pop.getByTestId('series-square'), regular.length);
    await expectNbaLinks(pop.getByTestId('series-po-square'), series.games.length);
    // each square's date is its game's
    expect(await pop.getByTestId('series-square').evaluateAll((els) => els.map((e) => e.getAttribute('data-date')))).toEqual(regular.map((g) => g[0]));
    expect(await pop.getByTestId('series-po-square').evaluateAll((els) => els.map((e) => e.getAttribute('data-date')))).toEqual(series.games.map((g) => g.date));
    // the hover look of this season's squares: lit, no underline
    const link = pop.getByTestId('series-square').first().locator('a');
    await link.hover();
    expect(await link.evaluate((e) => getComputedStyle(e).textDecorationLine)).toBe('none');
    expect(await link.evaluate((e) => getComputedStyle(e).cursor)).toBe('pointer');

    // a click opens NBA.com in a new tab, the app's page stays
    await page.context().route('https://www.nba.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>nba</title>' }));
    const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
    expect(tab.url()).toBe(`https://www.nba.com/games?date=${regular[0]![0]}`);
    await tab.close();
    await expect(page.getByTestId('slate')).toBeVisible();
  });

  test('a play-in square too', async ({ page }) => {
    // CHA @ ORL, 2026-04-17: the East's 8th-seed game
    const pop = await seriesPopup(page, 'CHA', 'ORL');
    await pop.getByTestId('series-prev-season').click();
    await expect(pop.getByTestId('series-playin-line')).toBeVisible();
    const sq = pop.getByTestId('series-po-square');
    await expectNbaLinks(sq, 1);
    await expect(sq).toHaveAttribute('data-date', '2026-04-17');
    await expect(sq).toContainText('Play-in');
  });
});

test.describe('CK-36: a big-day label opens that day\'s league Slate', () => {
  const XMAS = '2026-12-25';
  const onSlate = async (page: Page, label: string) => {
    await expect(page.getByTestId('slate')).toBeVisible();
    await expect(page.getByTestId('slate-header-label')).toHaveText(label);
  };

  test('Team Calendar cell: the league Slate of that day; back returns to the team; the cell isn\'t selected', async ({ page }) => {
    await at(page, '2026-12-10', '?view=team&layout=calendar&team=NYK');
    const label = page.locator(`.ck-team-grid [data-date="${XMAS}"] [data-testid="big-day"]`);
    await expect(label).toHaveText('Christmas');
    // a link to the day's Slate: pointer, no underline, the hover sentence kept
    expect(await label.evaluate((e) => e.tagName)).toBe('A');
    expect(new URL((await label.getAttribute('href'))!, 'http://x').searchParams.get('on')).toBe(XMAS);
    await label.hover();
    await expect(page.getByTestId('tooltip')).toHaveText('Christmas Day: the whole country watches these games');
    expect(await label.evaluate((e) => [getComputedStyle(e).cursor, getComputedStyle(e).textDecorationLine])).toEqual(['pointer', 'none']);
    await label.click();
    await onSlate(page, 'SLATE · 25-12 · NBA');
    // all the day's games, not the team's only
    expect(await page.locator('[data-testid="slate"] .ck-slate-card').count()).toBe(GAMES.filter((g) => dateOf(g) === XMAS).length);
    expect(new URL(page.url()).searchParams.get('view')).toBe('league');

    await page.goBack();
    await expect(page.locator('.ck-team-grid')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('team')).toBe('NYK');
    // the click went to the label alone: the cell behind it was not selected
    await expect(page.locator(`.ck-team-grid [data-date="${XMAS}"]`)).not.toHaveClass(/ck-cell-selected/);
  });

  test('League week view: the Slate of that day, not the List the day\'s own button opens; back returns', async ({ page }) => {
    await at(page, XMAS, '?view=league&layout=calendar&weeks=1');
    const label = page.locator(`.ck-month-cell[data-date="${XMAS}"] [data-testid="big-day"]`);
    await expect(label).toHaveText('Christmas');
    await label.click();
    await onSlate(page, 'SLATE · 25-12 · NBA');
    await expect(page.getByTestId('league-list')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('.ck-week-view')).toBeVisible();
    await expect(page.getByTestId('slate')).toHaveCount(0);
  });

  test('League week view: a holiday without games (Thanksgiving) is a link too', async ({ page }) => {
    await at(page, '2026-11-25', '?view=league&layout=calendar&weeks=1');
    const label = page.locator('.ck-month-cell[data-date="2026-11-26"] [data-testid="big-day"]');
    await expect(label).toHaveText('Thanksgiving');
    await label.click();
    await expect(page.getByTestId('slate')).toBeVisible();
  });

  test('League List day heading: the Slate of that day; back returns to the List', async ({ page }) => {
    await at(page, XMAS, '?view=league&layout=list');
    const label = page.locator(`.ck-lday[data-day="${XMAS}"] .ck-lday-head [data-testid="big-day"]`);
    await expect(label).toHaveText('Christmas');
    await label.click();
    await onSlate(page, 'SLATE · 25-12 · NBA');
    await page.goBack();
    await expect(page.getByTestId('league-list')).toBeVisible();
    await expect(page.getByTestId('slate')).toHaveCount(0);
  });

  test('the date picker\'s month: the label opens the Slate, the picker closes', async ({ page }) => {
    await at(page, '2026-12-10', '?view=league&layout=list');
    await page.getByTestId('date-pick').click();
    const label = page.locator(`[data-testid="date-picker"] [data-date="${XMAS}"] [data-testid="big-day"]`);
    await expect(label).toHaveText('Christmas');
    await label.click();
    await onSlate(page, 'SLATE · 25-12 · NBA');
    await expect(page.getByTestId('date-picker')).toHaveCount(0);
  });

  test('the Slate header\'s own label is not a link; the address a new tab opens lands on that day', async ({ page }) => {
    // the label's own address (a Ctrl-click, "open in a new tab"), with today another day
    await page.clock.setFixedTime(new Date('2026-12-10T15:00:00Z'));
    await page.goto(`${APP}?view=league&layout=slate&on=${XMAS}`);
    await onSlate(page, 'SLATE · 25-12 · NBA');
    const label = page.getByTestId('slate-header').getByTestId('big-day');
    await expect(label).toHaveText('Christmas');
    expect(await label.evaluate((e) => [e.tagName, e.hasAttribute('data-bigday-link'), getComputedStyle(e).cursor !== 'pointer'])).toEqual(['SPAN', false, true]);
    await label.click();
    await onSlate(page, 'SLATE · 25-12 · NBA');
  });
});
