// Round 14 (item 5): the season-series chip and popup in the real browser at 1920 × 950 and 1600 × 1000 — chip text vs
// the served snapshot (worked out here from the raw feed), the popup on hover inside the window and kept while the
// pointer moves onto it, a square → that day in the League List with the game highlighted, its ↗ → the game page in
// a new tab; the chip in the copied Slate image; rows still one line (the row walks in fatigue / mirror specs too).

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
const SIZES = [
  { width: 1920, height: 950 },
  { width: 1600, height: 1000 },
];
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'desktop sizes set here'));

/** gameId → "Gn/N" from the raw feed: regular-season games (002…) of the pair, in date / tip-off order. */
const chips = (page: Page) =>
  page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    type G = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; homeTeam: { teamId: number }; awayTeam: { teamId: number } };
    const games = (raw.leagueSchedule.gameDates as { games: G[] }[]).flatMap((d) => d.games).filter((g) => g.gameId.startsWith('002') && g.homeTeam.teamId && g.awayTeam.teamId);
    const pairs = new Map<string, G[]>();
    for (const g of games) {
      const k = [g.homeTeam.teamId, g.awayTeam.teamId].sort().join('-');
      pairs.set(k, [...(pairs.get(k) ?? []), g]);
    }
    const out: Record<string, string> = {};
    for (const gs of pairs.values()) {
      gs.sort((a, b) => a.gameDateEst.localeCompare(b.gameDateEst) || a.gameDateTimeUTC.localeCompare(b.gameDateTimeUTC));
      gs.forEach((g, i) => (out[g.gameId] = `G${i + 1}/${gs.length}`));
    }
    return out;
  });

for (const size of SIZES) {
  test.describe(`${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test('chips = the snapshot on Slate cards, League List and Team List rows; rows one line', async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.goto('?view=league&layout=slate&date=2026-11-02');
      await expect(page.locator('.ck-slate-card').first()).toBeVisible();
      const want = await chips(page);
      const read = (sel: string) => page.locator(sel).evaluateAll((es) => es.map((e) => [e.closest('[data-game-id]')!.getAttribute('data-game-id')!, e.textContent!]));
      const slate = await read('[data-testid="slate"] [data-testid="series-chip"]');
      expect(slate.length).toBe(await page.locator('.ck-slate-card').count());
      for (const [id, t] of slate) expect(t, id).toBe(want[id!]);
      await page.goto('?view=league&layout=list&date=2026-11-02');
      await expect(page.getByTestId('league-list').locator('article').first()).toBeVisible();
      const list = await read('[data-testid="league-list"] [data-testid="series-chip"]');
      expect(list.length).toBe(await page.getByTestId('league-list').locator('article').count());
      for (const [id, t] of list) expect(t, id).toBe(want[id!]);
      // one line = every part's middle within 4 px (a wrap moves a part a whole line, 20+ px; rounding each middle
      // split 1028.49 from 1028.5)
      const oneLine = await page.getByTestId('league-list').locator('article').evaluateAll((as) => as.filter((a) => { const mids = [...a.children].filter((k) => !k.matches('.ck-copy') && getComputedStyle(k).position !== 'absolute' && k.getBoundingClientRect().width).map((k) => k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2); return Math.max(...mids) - Math.min(...mids) > 4; }).map((a) => a.getAttribute('aria-label')));
      expect(oneLine).toEqual([]);
      await page.goto('?view=team&layout=list&team=MIN');
      await expect(page.getByTestId('team-list').locator('article').first()).toBeVisible();
      const team = await read('[data-testid="team-list"] [data-testid="series-chip"]');
      expect(team.length).toBeGreaterThan(5);
      for (const [id, t] of team) expect(t, id).toBe(want[id!]);
    });

    test('popup: on hover, inside the window, stays while the pointer moves onto it; a square → that day in the League List, the game highlighted; ↗ = the game page, new tab', async ({ page, context }) => {
      await context.route('https://hoopsjunkie.io/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'stub' }));
      await page.clock.setFixedTime(NOW);
      await page.goto('?view=league&layout=slate&date=2026-11-02');
      const chip = page.locator('[data-testid="slate"] [data-testid="series-chip"]').last();
      await chip.hover();
      const pop = page.getByTestId('series-popup');
      await expect(pop).toBeVisible();
      const box = (await pop.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      // move onto the popup (through the gap): still open
      await page.mouse.move(box.x + box.width / 2, box.y + 10, { steps: 6 });
      await page.waitForTimeout(400);
      await expect(pop).toBeVisible();
      const squares = pop.getByTestId('series-square');
      const n = await squares.count();
      expect(`G?/${n}`).toBe((await chip.textContent())!.replace(/\d+\//, '?/'));
      expect(await pop.locator('.ck-series-current').count()).toBe(1);
      // round 22 (item 12): a square (here the first) is the game page, in a new tab
      const link = squares.first().getByTestId('series-link');
      const [tab] = await Promise.all([context.waitForEvent('page'), link.click()]);
      expect(tab.url()).toMatch(/^https:\/\/hoopsjunkie\.io\/games\/\d{4}-\d{2}-\d{2}\/[a-z]{3}-vs-[a-z]{3}$/);
      await tab.close();
      // every square is a game page; this page stays where it was
      expect(await pop.locator('[data-testid="series-square"] > a[target="_blank"][href^="https://hoopsjunkie.io/games/"]').count()).toBe(n);
      await expect(page.getByTestId('slate')).toBeVisible();
    });
  });
}
