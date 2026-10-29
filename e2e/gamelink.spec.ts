// Game page link (round 4, item 12) in a real browser, desktop widths: hovering a game shows its "↗" inside its row /
// cell / the room right of its week-view line, covering no TV pill, tag, chip or fatigue mark; a click opens the game's
// hoopsjunkie page in a new tab (hoopsjunkie.io is stubbed here: only the URL is checked).

import { expect, test, type Page } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths'));

/** The "↗" of a hovered host: inside the host's box, overlapping none of the given parts. */
const geometry = (page: Page, hostSel: string, boxSel: string) =>
  page.locator(hostSel).first().evaluate(
    (host, boxSel) => {
      const link = host.querySelector(':scope > [data-testid="open-link"]')!.getBoundingClientRect();
      const box = (host.closest(boxSel) ?? host).getBoundingClientRect();
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      // rows: the "↗" shares the copy button's corner, so it may cover only what that button already covers (the
      // Team List's streak column on hover); nothing else
      const copy = host.querySelector(':scope > [data-testid="copy-game"]')?.getBoundingClientRect();
      const covered = [...(host.closest(boxSel) ?? host).querySelectorAll('.ck-tv, .ck-tv-pill, .ck-tag, .ck-tif, .ck-b2b-label, .ck-fm, .ck-season > *, .ck-mscore, .ck-ot')]
        .filter((e) => hit(link, e.getBoundingClientRect()) && !(copy && hit(copy, e.getBoundingClientRect())))
        .map((e) => e.className);
      const opacity = getComputedStyle(host.querySelector(':scope > [data-testid="open-link"]')!).display === 'none' ? '0' : '1'; // shown = displayed
      return { inside: link.left >= box.left - 0.5 && link.right <= box.right + 0.5 && link.top >= box.top - 0.5 && link.bottom <= box.bottom + 0.5, covered, opacity };
    },
    boxSel,
  );

for (const [name, search, hostSel, boxSel] of [
  ['League List', '?view=league&layout=list&date=2026-11-16', '.ck-lday[data-day="2026-11-16"] .ck-card:has(.ck-tv)', '.ck-card'],
  ['Team List', '?view=team&layout=list&team=LAL', '[data-testid="team-list"] .ck-card[data-next]', '.ck-card'],
  ['Team Calendar', '?view=team&layout=calendar&team=LAL', '.ck-day-cell:has(.ck-tv)', '.ck-day-cell'],
  ['week view', '?view=league&layout=calendar&date=2026-11-16', '.ck-month-game:has(.ck-tv-pill)', '.ck-cell'],
] as const) {
  test(`${name}: "↗" on hover, inside, covering nothing; a click opens the game page in a new tab`, async ({ page, context }) => {
    await context.route('https://hoopsjunkie.io/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'stub' }));
    await page.clock.setFixedTime(NOW);
    await page.goto(`/${search}`);
    await page.waitForFunction(() => !!document.querySelector('[data-game-id]'));
    const host = page.locator(hostSel).first();
    await host.scrollIntoViewIfNeeded();
    expect((await geometry(page, hostSel, boxSel)).opacity).toBe('0'); // hidden until hovered
    await host.hover();
    await expect.poll(async () => (await geometry(page, hostSel, boxSel)).opacity).toBe('1');
    const g = await geometry(page, hostSel, boxSel);
    expect(g.inside).toBe(true);
    expect(g.covered).toEqual([]);
    // the expected URL, from the served snapshot (independent of the app's code)
    const id = await host.evaluate((h) => (h.matches('[data-game-id]') ? h : h.querySelector('[data-game-id]'))!.getAttribute('data-game-id')!);
    const want = await page.evaluate(async (id) => {
      const raw = await (await fetch('/data/schedule.json')).json();
      const gm = (raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateEst: string; awayTeam: { teamTricode: string }; homeTeam: { teamTricode: string } }[] }[]).flatMap((d) => d.games).find((x) => x.gameId === id)!;
      return `https://hoopsjunkie.io/games/${gm.gameDateEst.slice(0, 10)}/${gm.awayTeam.teamTricode.toLowerCase()}-vs-${gm.homeTeam.teamTricode.toLowerCase()}`;
    }, id);
    const popup = context.waitForEvent('page');
    await host.locator(':scope > [data-testid="open-link"]').click();
    const tab = await popup;
    await expect.poll(() => tab.url()).toContain(want.replace('https://', ''));
    expect(page.url()).not.toContain('hoopsjunkie'); // the app stays
  });
}
