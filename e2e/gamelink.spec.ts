// Game page link in a real browser, desktop widths (round 5: the matchup itself is the link; round 4's hover "↗" is
// gone): a real <a> in every view (League List, Team List, Team Calendar, week view) to the game's hoopsjunkie page,
// looking like text until hovered (pointer + underline), never link-styled in an image; click, middle-click,
// ctrl-click and Enter open it in a new tab; a drag that starts on it selects games and opens nothing.
// hoopsjunkie.io is stubbed here: only the URL is checked.

import { expect, test, type Browser, type BrowserContext, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths'));

// The background tabs a middle / ctrl click opens are created by the browser, outside the test's context (checked
// 2026-10-30, Chromium 156: a bare cross-origin <a target="_blank"> on a localhost page opens a tab that the context's
// "page" event never reports; same-origin links and about:blank pages do get the event). So the browser's own target
// list (CDP) is watched instead, and hoopsjunkie.io resolves to a closed local port, so the tab never reaches the real
// site.
test.use({ launchOptions: { args: ['--host-resolver-rules=MAP hoopsjunkie.io 127.0.0.1:9'] } });

/** The URL of the page tab `act` opens (read from the browser's targets), or undefined after 5 s; the tab is closed. */
async function tabOpenedBy(browser: Browser, act: () => Promise<unknown>): Promise<string | undefined> {
  const cdp = await browser.newBrowserCDPSession();
  const before = new Set<string>();
  const urls = new Map<string, string>();
  let armed = false;
  cdp.on('Target.targetCreated', ({ targetInfo: t }) => (armed ? t.type === 'page' && urls.set(t.targetId, t.url) : before.add(t.targetId)));
  cdp.on('Target.targetInfoChanged', ({ targetInfo: t }) => urls.has(t.targetId) && urls.set(t.targetId, t.url));
  await cdp.send('Target.setDiscoverTargets', { discover: true }); // reports the existing targets first
  armed = true;
  await act();
  let url: string | undefined;
  for (let i = 0; i < 50 && !url; i++) {
    url = [...urls.values()].find((u) => u.startsWith('http'));
    if (!url) await new Promise((r) => setTimeout(r, 100));
  }
  for (const id of urls.keys()) if (!before.has(id)) await cdp.send('Target.closeTarget', { targetId: id }).catch(() => {});
  await cdp.detach();
  return url;
}

async function open(page: Page, context: BrowserContext, search: string) {
  await context.route('https://hoopsjunkie.io/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'stub' }));
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/${search}`);
  await page.waitForFunction(() => !!document.querySelector('[data-game-id]'));
}

/** The expected URL of a game, from the served snapshot (independent of the app's code). */
const wantUrl = (page: Page, id: string) =>
  page.evaluate(async (id) => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const gm = (raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateEst: string; awayTeam: { teamTricode: string }; homeTeam: { teamTricode: string } }[] }[]).flatMap((d) => d.games).find((x) => x.gameId === id)!;
    return `https://hoopsjunkie.io/games/${gm.gameDateEst.slice(0, 10)}/${gm.awayTeam.teamTricode.toLowerCase()}-vs-${gm.homeTeam.teamTricode.toLowerCase()}`;
  }, id);

for (const [name, search, hostSel] of [
  ['League List', '?view=league&layout=list&date=2026-11-16', '.ck-lday[data-day="2026-11-16"] .ck-card'],
  ['Team List', '?view=team&layout=list&team=LAL', '[data-testid="team-list"] .ck-card[data-next]'],
  ['Team Calendar', '?view=team&layout=calendar&team=LAL', '.ck-day-cell:has(.ck-card)'],
  ['week view', '?view=league&layout=calendar&date=2026-11-16', '.ck-month-game'],
] as const) {
  test(`${name}: the matchup is a link — new tab on click, middle-click, ctrl-click and Enter; pointer + underline on hover only; no "↗"`, async ({ page, context, browser }) => {
    await open(page, context, search);
    const host = page.locator(hostSel).first();
    await host.scrollIntoViewIfNeeded();
    const link = host.locator('a[data-testid="game-link"]');
    await expect(link).toHaveCount(1);
    expect(await page.locator('[data-testid="open-link"], .ck-open-link').count()).toBe(0);
    const id = await host.evaluate((h) => (h.matches('[data-game-id]') ? h : h.querySelector('[data-game-id]'))!.getAttribute('data-game-id')!);
    const want = await wantUrl(page, id);
    expect(await link.getAttribute('href')).toBe(want);
    expect(await link.getAttribute('target')).toBe('_blank');
    // looks like text until hovered: the row's own colour, no underline; then pointer + underline
    const look = () => link.evaluate((a) => ({ line: getComputedStyle(a).textDecorationLine, cursor: getComputedStyle(a).cursor, color: getComputedStyle(a).color, parent: getComputedStyle(a.parentElement!).color }));
    await page.mouse.move(2, 2);
    const idle = await look();
    expect(idle.line).toBe('none');
    expect(idle.color).toBe(idle.parent);
    await link.hover();
    const hover = await look();
    expect(hover.line).toBe('underline');
    expect(hover.cursor).toBe('pointer');
    // never link-styled in an image: the capture class drops the underline even while hovered
    expect(await link.evaluate((a) => {
      const root = a.closest('.ck-root')!;
      root.classList.add('ck-capturing');
      const line = getComputedStyle(a).textDecorationLine;
      root.classList.remove('ck-capturing');
      return line;
    })).toBe('none');
    // click and keyboard (Enter): each opens the page in a new tab; the app stays
    for (const how of ['click', 'enter'] as const) {
      const popup = context.waitForEvent('page');
      if (how === 'click') await link.click();
      else {
        await link.focus();
        await page.keyboard.press('Enter');
      }
      const tab = await popup;
      await expect.poll(() => tab.url(), { message: how }).toBe(want);
      await tab.close();
      expect(page.url(), how).not.toContain('hoopsjunkie');
    }
    // middle- and ctrl-click (round 7, 1.1): a real middle / ctrl click opens a new tab with the game's URL (tabOpenedBy).
    // Also checked at the event level: the event the browser acts on (auxclick / click with ctrlKey) reaches the window
    // with nothing cancelling it. The context's stub route comes off first: it holds the background tab's request (that
    // tab isn't the context's, so nothing answers it) and the tab never gets its URL; the resolver rule keeps it offline.
    await context.unroute('https://hoopsjunkie.io/**');
    for (const how of ['middle', 'ctrl'] as const) {
      // caught on the way down (capture), read after the dispatch: defaultPrevented is final by then
      await link.evaluate((a, how) => {
        const w = window as unknown as { ev?: MouseEvent; link?: Element };
        w.ev = undefined;
        w.link = a;
        window.addEventListener(how === 'middle' ? 'auxclick' : 'click', (e) => (w.ev = e as MouseEvent), { once: true, capture: true });
      }, how);
      const opened = await tabOpenedBy(browser, () => (how === 'middle' ? link.click({ button: 'middle' }) : link.click({ modifiers: ['ControlOrMeta'] })));
      expect(opened, how).toBe(want);
      const seen = await page.evaluate(() => {
        const { ev, link } = window as unknown as { ev?: MouseEvent; link?: Element };
        return ev && { target: (ev.target as Element).closest('a') === link, cancelled: ev.defaultPrevented, ctrl: ev.ctrlKey || ev.metaKey, button: ev.button };
      });
      expect(seen, how).toEqual({ target: true, cancelled: false, ctrl: how === 'ctrl', button: how === 'middle' ? 1 : 0 });
      expect(page.url(), how).not.toContain('hoopsjunkie');
    }
  });
}

test('keyboard: Tab reaches the matchup link of a row, the row copy button still works', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, context, '?view=team&layout=list&team=LAL');
  const row = page.locator('[data-testid="team-list"] .ck-card[data-next]');
  // the copy button comes first in the row; the next Tab stops on the row's fatigue column or link
  await row.hover();
  await row.getByTestId('copy-game').focus();
  let reached = false;
  for (let i = 0; i < 4 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await row.locator('a[data-testid="game-link"]').evaluate((a) => document.activeElement === a);
  }
  expect(reached).toBe(true);
  await row.hover();
  await row.getByTestId('copy-game').click();
  await expect(row.getByTestId('copy-game')).toHaveAttribute('data-state', 'copied');
});

test('a drag that starts on a matchup link selects games and opens nothing (a click is not a drag)', async ({ page, context }) => {
  await open(page, context, '?view=team&layout=list&team=LAL');
  const opened: string[] = [];
  context.on('page', (p) => opened.push(p.url()));
  // the list opens at the next game (earlier rows are above, under the top bar); start a few rows lower, clear of the
  // band near the list's top edge where a drag auto-scrolls: from the 4th row's link down two rows
  const rows = page.locator('[data-testid="team-list"] .ck-card[data-next], [data-testid="team-list"] .ck-card[data-next] ~ .ck-card');
  const a = (await rows.nth(3).locator('a[data-testid="game-link"]').boundingBox())!;
  const c = (await rows.nth(5).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(c.x + 300, c.y + c.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('selection-count')).toHaveText('3 games selected');
  await page.waitForTimeout(300); // a tab would have opened by now
  expect(opened).toEqual([]);
  expect(page.url()).not.toContain('hoopsjunkie');
});
