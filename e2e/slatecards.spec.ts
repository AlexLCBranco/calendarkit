// Slate cards in a real browser against the served snapshot — the streak (through a final game) after each record
// (as of that night: a past night's streaks, not today's), national TV games outlined and tinted green (only they, and
// in copies), and the hoopsjunkie link as a "↗" icon after the time: click / middle / ctrl open the game page in a new
// tab, no underline, never in a copy; the team names are no link. Desktop widths.

import { expect, test, type Browser, type Page } from './fixtures';
import { copySlate, readPng } from './slatecopy';

const NOW = new Date('2026-11-15T15:00:00Z');
const TV = 'rgb(63, 182, 139)'; // --ck-tv

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));
test.use({ launchOptions: { args: ['--host-resolver-rules=MAP hoopsjunkie.io 127.0.0.1:9'] } });

type RawTeam = { teamId: number; teamTricode: string; score: number };
type RawGame = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; gameStatus: number; awayTeam: RawTeam; homeTeam: RawTeam; broadcasters: { nationalBroadcasters?: { broadcasterDisplay: string }[] } };

/** The snapshot's games (regular season, Cup, play-in, playoffs), every team's streak going into each, and TV. */
const snapshot = (page: Page) =>
  page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const games = (raw.leagueSchedule.gameDates as { games: RawGame[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId));
    games.sort((a, b) => a.gameDateTimeUTC.localeCompare(b.gameDateTimeUTC));
    // streak per game and team (through it once final; going in before): regular-season games (002) only, while every earlier one is final
    const streak: Record<string, string> = {};
    const state = new Map<number, { known: boolean; last?: 'W' | 'L'; n: number }>();
    for (const g of games) {
      for (const [t, o] of [[g.awayTeam, g.homeTeam], [g.homeTeam, g.awayTeam]] as const) {
        if (!t.teamId) continue;
        if (!g.gameId.startsWith('002')) {
          streak[`${g.gameId}:${t.teamId}`] = '';
          continue;
        }
        const s = state.get(t.teamId) ?? { known: true, n: 0 };
        if (g.gameStatus === 3 && s.known) {
          const r = t.score > o.score ? 'W' : 'L';
          s.n = s.last === r ? s.n + 1 : 1;
          s.last = r;
        }
        streak[`${g.gameId}:${t.teamId}`] = s.known && s.last ? `${s.last}${s.n}` : '';
        if (g.gameStatus !== 3) s.known = false;
        state.set(t.teamId, s);
      }
    }
    const byDate: Record<string, { id: string; away: number; home: number; tv: boolean; final: boolean }[]> = {};
    for (const g of games)
      (byDate[g.gameDateEst.slice(0, 10)] ??= []).push({ id: g.gameId, away: g.awayTeam.teamId, home: g.homeTeam.teamId, final: g.gameStatus === 3, tv: (g.broadcasters.nationalBroadcasters ?? []).some((b) => b.broadcasterDisplay !== 'NBA TV') });
    return { streak, byDate };
  });

async function openSlate(page: Page, date?: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/?view=league&layout=slate${date ? `&date=${date}` : ''}`);
  await expect(page.getByTestId('slate')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const cards = (page: Page) => page.locator('[data-testid="slate"] .ck-slate-card');

test('streak after the record on every card, as of that night; columns line up across cards', async ({ page }) => {
  await openSlate(page);
  const snap = await snapshot(page);
  // nights with results behind them: every day of the season so far with a final game, plus today and the next night
  const days = Object.keys(snap.byDate).sort();
  const played = days.filter((d) => snap.byDate[d]!.some((g) => g.final));
  expect(played.length).toBeGreaterThan(2);
  const nights = [...played.slice(1), ...days.filter((d) => d >= '2026-11-15').slice(0, 2)];
  let shown = 0;
  for (const date of nights) {
    await openSlate(page, date);
    const got = await cards(page).evaluateAll((cs) =>
      cs.flatMap((c) =>
        [...c.querySelectorAll<HTMLElement>('.ck-slate-row')].map((r) => {
          const s = r.querySelector<HTMLElement>('[data-testid="slate-streak"]')!;
          return { id: c.getAttribute('data-game-id')!, side: r.dataset.side!, text: s.textContent!, color: getComputedStyle(s).color, x: s.getBoundingClientRect().left - c.getBoundingClientRect().left, rec: r.querySelector('.ck-slate-rec')!.getBoundingClientRect().width };
        }),
      ),
    );
    for (const r of got) {
      const g = snap.byDate[date]!.find((x) => x.id === r.id)!;
      const want = snap.streak[`${g.id}:${r.side === 'away' ? g.away : g.home}`] ?? '';
      expect(r.text, `${date} ${r.id} ${r.side}`).toBe(want);
      if (want) {
        shown++;
        // W green (the Team List's --ck-tv), L red (its --ck-playoffs)
        const [red, green] = r.color.match(/\d+/g)!.map(Number);
        if (want[0] === 'W') expect(r.color, `${date} ${r.id} ${r.side} green`).toBe(TV);
        else expect(red! > green! + 60, `${date} ${r.id} ${r.side} red: ${r.color}`).toBe(true);
      }
    }
    // one x for the streak column and one width for the records, on every card
    expect(new Set(got.map((r) => Math.round(r.x))).size, `${date} streak column`).toBe(1);
    expect(new Set(got.map((r) => Math.round(r.rec))).size, `${date} record width`).toBe(1);
  }
  expect(shown).toBeGreaterThan(20);
  // a past night's streaks differ from later ones for the same team (as of that night, not today's)
  const team = snap.byDate[played[1]!]![0]!.home;
  const per = Object.entries(snap.streak).filter(([k, v]) => k.endsWith(`:${team}`) && v).map(([, v]) => v);
  expect(new Set(per).size, 'the same team shows different streaks on different nights').toBeGreaterThan(1);
});

test('national TV games: green outline + tint, exactly those cards; the green in the copy, none on other cards', async ({ page }, info) => {
  test.setTimeout(120_000);
  await openSlate(page);
  const snap = await snapshot(page);
  let tv = 0;
  for (const date of ['2026-11-15', '2026-11-17', '2026-12-25', Object.keys(snap.byDate).sort()[0]!]) {
    if (!snap.byDate[date]) continue;
    await openSlate(page, date);
    const got = await cards(page).evaluateAll((cs) => cs.map((c) => ({ id: c.getAttribute('data-game-id')!, border: getComputedStyle(c).borderTopColor, ring: getComputedStyle(c).boxShadow, bg: getComputedStyle(c).backgroundImage })));
    for (const c of got) {
      const want = snap.byDate[date]!.find((g) => g.id === c.id)!.tv;
      expect(c.border === TV, `${date} ${c.id} outline`).toBe(want);
      expect(c.ring.includes(TV), `${date} ${c.id} ring`).toBe(want);
      expect(c.bg !== 'none', `${date} ${c.id} tint`).toBe(want);
      if (want) tv++;
    }
  }
  expect(tv).toBeGreaterThan(3);
  // in the copy: every TV card's edge is green (alpha 255), every other card's edge is not
  if (info.project.name !== 'desktop-xl') return;
  await page.setViewportSize({ width: 1920, height: 911 });
  // a night with both kinds of cards
  const night = Object.keys(snap.byDate).sort().find((d) => snap.byDate[d]!.some((g) => g.tv) && snap.byDate[d]!.filter((g) => !g.tv).length > 1)!;
  await openSlate(page, night);
  const r = await copySlate(page, 'copy-view', 'slate-tv');
  const day = snap.byDate[night]!;
  const edges = await readPng(page, r.png, r.stage.cards.map((k) => ({ x: (k.x + 1) * r.ratio, y: (k.y + k.h / 2) * r.ratio, w: 1, h: 1 })));
  const middles = await readPng(page, r.png, r.stage.cards.map((k) => ({ x: (k.x + k.w * 0.5) * r.ratio, y: (k.y + k.h - 4) * r.ratio, w: 1, h: 1 })));
  const tint: { tv: boolean; g: number }[] = [];
  r.stage.cards.forEach((k, i) => {
    const want = day.find((g) => g.id === k.id)!.tv;
    const [e, m] = [edges[i]!, middles[i]!];
    const green = (p: number[]) => p[1]! > p[0]! + 60 && p[1]! > p[2]! + 20;
    expect(green(e), `${k.id} edge ${e}`).toBe(want);
    expect(e[3]).toBe(255);
    tint.push({ tv: want, g: m[1]! - m[0]! });
  });
  // the tint: every TV card's inside is greener than every other card's (all plain cards alike)
  const plainG = tint.filter((t) => !t.tv).map((t) => t.g);
  expect(new Set(plainG).size, 'plain cards: one background').toBe(1);
  for (const t of tint.filter((x) => x.tv)) expect(t.g, 'TV card tint').toBeGreaterThan(plainG[0]! + 4);
});

/** The URL of the tab `act` opens, from the browser's own target list (gamelink.spec.ts explains why). */
async function tabOpenedBy(browser: Browser, act: () => Promise<unknown>): Promise<string | undefined> {
  const cdp = await browser.newBrowserCDPSession();
  const before = new Set<string>();
  const urls = new Map<string, string>();
  let armed = false;
  cdp.on('Target.targetCreated', ({ targetInfo: t }) => (armed ? t.type === 'page' && urls.set(t.targetId, t.url) : before.add(t.targetId)));
  cdp.on('Target.targetInfoChanged', ({ targetInfo: t }) => urls.has(t.targetId) && urls.set(t.targetId, t.url));
  await cdp.send('Target.setDiscoverTargets', { discover: true });
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

test('the link is a "↗" after the time: tooltip, no underline (brightens), click / middle / ctrl open the game page; names are no link; never in a copy', async ({ page, context, browser }, info) => {
  await context.route('https://hoopsjunkie.io/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'stub' }));
  await openSlate(page, '2026-11-16');
  const card = cards(page).first();
  const id = (await card.getAttribute('data-game-id'))!;
  const want = await page.evaluate(async (id) => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const g = (raw.leagueSchedule.gameDates as { games: RawGame[] }[]).flatMap((d) => d.games).find((x) => x.gameId === id)!;
    return `https://hoopsjunkie.io/games/${g.gameDateEst.slice(0, 10)}/${g.awayTeam.teamTricode.toLowerCase()}-vs-${g.homeTeam.teamTricode.toLowerCase()}`;
  }, id);
  // no game link around the names anywhere (the only anchors there are team links, to the Team view —
  // e2e/teamlinks.spec.ts); never underlined
  expect(await page.locator('[data-testid="slate"] .ck-slate-teams a:not([data-team-link]), [data-testid="slate"] a:not([data-team-link]):has(.ck-slate-name)').count()).toBe(0);
  const name = card.locator('.ck-slate-name').first();
  await name.hover();
  expect(await name.evaluate((n) => [getComputedStyle(n).cursor, getComputedStyle(n).textDecorationLine])).toEqual(['pointer', 'none']);
  // one icon per card, in the strip right under the start time, with its tooltip
  expect(await cards(page).count()).toBe(await page.locator('[data-testid="slate"] a[data-testid="game-link"]').count());
  const link = card.locator('a[data-testid="game-link"]');
  expect(await link.textContent()).toBe('↗');
  expect(await link.getAttribute('title')).toBe('Open on hoopsjunkie');
  expect(await link.getAttribute('href')).toBe(want);
  const pos = await link.evaluate((a) => {
    const t = a.closest('.ck-slate-strip')!.querySelector('[data-testid="tipoff"], [data-testid="slate-status"]')!.getBoundingClientRect();
    const b = a.getBoundingClientRect();
    return { gap: b.top - t.bottom, dx: b.left - t.left };
  });
  expect(pos.gap).toBeGreaterThanOrEqual(0);
  expect(pos.gap).toBeLessThan(8);
  expect(Math.abs(pos.dx)).toBeLessThan(2);
  await page.mouse.move(2, 2);
  const idle = await link.evaluate((a) => [getComputedStyle(a).color, getComputedStyle(a).textDecorationLine]);
  await link.hover();
  const hover = await link.evaluate((a) => [getComputedStyle(a).color, getComputedStyle(a).textDecorationLine, getComputedStyle(a).cursor]);
  expect(idle[1]).toBe('none');
  expect(hover[1]).toBe('none');
  expect(hover[0], 'brightens on hover').not.toBe(idle[0]);
  const lum = (c: string) => c.match(/\d+/g)!.slice(0, 3).reduce((s, v) => s + Number(v), 0);
  expect(lum(hover[0]!)).toBeGreaterThan(lum(idle[0]!));
  // click: a new tab with the game page
  const popup = context.waitForEvent('page');
  await link.click();
  const tab = await popup;
  await expect.poll(() => tab.url()).toBe(want);
  await tab.close();
  // middle and ctrl click (the browser's own tab, see tabOpenedBy)
  await context.unroute('https://hoopsjunkie.io/**');
  for (const how of ['middle', 'ctrl'] as const) {
    const opened = await tabOpenedBy(browser, () => (how === 'middle' ? link.click({ button: 'middle' }) : link.click({ modifiers: ['ControlOrMeta'] })));
    expect(opened, how).toBe(want);
    expect(page.url()).not.toContain('hoopsjunkie');
  }
  // never in a copy: no link in the copied cards (the strip's chips reflow without it, so its old spot holds the
  // series chip; before, the spot was checked to be plain background)
  if (info.project.name !== 'desktop-xl') return;
  await page.setViewportSize({ width: 1920, height: 911 });
  await openSlate(page, '2026-11-16');
  const r = await copySlate(page, 'copy-view', 'slate-icon');
  expect(r.stage.links).toBe(0);
  expect(r.stage.cards.length).toBeGreaterThan(0);
});
