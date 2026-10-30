// Team → Calendar in 1 and 2 weeks (desktop 1280 × 900 and 1920 × 1080): walks every week of the season for BOS, LAL
// (most national TV games) and ORL — no cell clipped (height or width), no page scroll, games per window = the
// served snapshot, B2B bars on the cells' bottom edge. Prints the scale per mode.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'desktop-xl', 'desktop widths only'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await expect(page.locator('.ck-team-grid')).toBeVisible();
}

/** The team's game dates from the served snapshot alone. */
const feedDates = (page: Page, tri: string) =>
  page.evaluate(async (tri) => {
    type G = { gameId: string; gameDateEst: string; homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } };
    const raw = await (await fetch('/data/schedule.json')).json();
    return (raw.leagueSchedule.gameDates as { games: G[] }[])
      .flatMap((d) => d.games)
      .filter((g) => /^00[2456]/.test(g.gameId) && (g.homeTeam.teamTricode === tri || g.awayTeam.teamTricode === tri))
      .map((g) => g.gameDateEst.slice(0, 10));
  }, tri);

for (const span of [1, 2] as const) {
  test(`team calendar ${span} week(s): every week of the season for BOS, LAL, ORL — nothing clipped, no page scroll`, async ({ page }, info) => {
    test.setTimeout(240_000);
    const scales = new Set<number>();
    for (const tri of ['BOS', 'LAL', 'ORL']) {
      await open(page, `?view=team&layout=calendar&team=${tri}&span=${span}w`);
      const dates = new Set(await feedDates(page, tri));
      const prev = page.getByRole('button', { name: span === 1 ? 'Previous week' : 'Previous 2 weeks' });
      const next = page.getByRole('button', { name: span === 1 ? 'Next week' : 'Next 2 weeks' });
      while (await prev.isEnabled()) await prev.click();
      let games = 0;
      for (let guard = 0; guard < 40; guard++) {
        await page.waitForFunction(() => [...document.images].every((i) => i.complete));
        const r = await page.locator('.ck-team-grid').evaluate((g) => {
          const cells = [...g.querySelectorAll<HTMLElement>('.ck-day-cell')];
          return {
            title: document.querySelector('[data-testid="period-title"]')!.textContent!,
            span: g.closest('.ck-team-month')!.getAttribute('data-span'),
            scale: Number((g as HTMLElement).dataset.scale),
            dates: cells.map((c) => c.dataset.date!),
            withGame: cells.filter((c) => c.querySelector('.ck-card')).map((c) => c.dataset.date!),
            clipped: cells.filter((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).map((c) => c.dataset.date),
            outside: cells.filter((c) => {
              const k = c.querySelector('.ck-card');
              if (!k) return false;
              const a = k.getBoundingClientRect();
              const b = c.getBoundingClientRect();
              return a.right > b.right + 0.5 || a.bottom > b.bottom + 0.5;
            }).length,
            bars: [...g.querySelectorAll<HTMLElement>('[data-b2b-bar]')].map((bar) => {
              const r = bar.getBoundingClientRect();
              const cell = cells.map((c) => c.getBoundingClientRect()).find((c) => c.top <= r.top && c.bottom >= r.bottom);
              return cell ? cell.bottom - r.bottom : -1;
            }),
            scroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
            sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        const name = `${tri} ${r.title}`;
        expect(r.span).toBe(`${span}w`);
        expect(r.dates, name).toHaveLength(7 * span);
        expect(r.withGame, name).toEqual(r.dates.filter((d) => dates.has(d)));
        expect(r.clipped, name).toEqual([]);
        expect(r.outside, name).toBe(0);
        expect(r.scroll, `${name}: page scroll`).toBeLessThanOrEqual(0);
        expect(r.sideways, name).toBeLessThanOrEqual(0);
        for (const gap of r.bars) expect(gap, `${name}: B2B bar at the bottom edge`).toBeGreaterThanOrEqual(0), expect(gap, name).toBeLessThanOrEqual(6);
        scales.add(r.scale);
        games += r.withGame.length;
        if (await next.isDisabled()) break;
        await next.click();
        await expect(page.getByTestId('period-title')).not.toHaveText(r.title);
      }
      expect(games, `${tri}: every game seen once`).toBe(dates.size);
    }
    console.log(`[teamweeks] ${info.project.name} ${span} week(s): scale ${[...scales]}`);
    expect(scales.size).toBe(1);
    expect([...scales][0]!).toBeGreaterThanOrEqual(1);
  });
}
