// CK-22: the Slate header's "⏱ Countdown" link opens halftime-timer on a timer ending at the night's first tip-off
// (then the next game not started; disabled when none is left) — on the site and in the Slate's part (slate.html, what
// the gauntlet's widget shows).
// CK-34: the Slate kit draws one game's card on its own (slate.html?game=), 509 × 78, with the same content as that
// game's card in the site's Slate, and gives the night as a list in start order with exact instants.

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

type RawGame = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; awayTeam: { teamTricode: string }; homeTeam: { teamTricode: string } };
const raw = JSON.parse(readFileSync('public/data/schedule.json', 'utf8')) as { leagueSchedule: { gameDates: { games: RawGame[] }[] } };
const nightOf = (date: string) =>
  raw.leagueSchedule.gameDates
    .flatMap((d) => d.games)
    .filter((x) => x.gameDateEst.startsWith(date) && /^00[2456]/.test(x.gameId))
    .map((g) => ({ id: g.gameId, start: Date.parse(g.gameDateTimeUTC), matchup: `${g.awayTeam.teamTricode} @ ${g.homeTeam.teamTricode}` }))
    .sort((a, b) => a.start - b.start);

const DATE = '2026-11-25'; // a night still to come in the snapshot, several start times
const night = nightOf(DATE);
const FIRST = night[0]!.start;
const LAST = night.at(-1)!.start;
const MIN = 60_000;

/** The countdown button's link, read apart: where it goes, the instant it ends at, its name. */
async function link(page: Page) {
  const a = page.getByTestId('slate-countdown').first();
  await expect(a).toBeVisible();
  await expect(a).toHaveText('⏱ Countdown');
  const href = await a.getAttribute('href');
  if (!href) return { disabled: await a.getAttribute('aria-disabled'), tip: await a.getAttribute('data-tip') };
  const url = new URL(href);
  return { origin: url.origin + url.pathname, end: Date.parse(url.searchParams.get('end')!), endText: url.searchParams.get('end')!, name: url.searchParams.get('name')!, target: await a.getAttribute('target') };
}

/** The games starting at `start`, as the name may say them ("BOS @ DET"). */
const matchupsAt = (start: number) => night.filter((g) => g.start === start).map((g) => g.matchup);

const pages = [
  ['the site’s Slate', `${APP}?view=league&layout=slate&date=${DATE}`],
  ['the Slate’s part (the gauntlet widget’s layout)', `${APP}slate.html?date=${DATE}&copy=1`],
] as const;

for (const [where, url] of pages) {
  test(`CK-22 ${where}: the countdown link — first game, then the next not started, then disabled`, async ({ page }) => {
    await page.route('**/api/odds**', (r) => r.fulfill({ json: { date: DATE, games: {} } }));
    await page.clock.install({ time: FIRST - 90 * MIN });
    await page.goto(url);
    await expect(page.locator('.ck-slate-card').first()).toBeVisible();

    // before the first tip-off: the first game, in a new tab, in the header line
    await expect(page.getByTestId('slate-header').first().getByTestId('slate-countdown')).toBeVisible();
    const first = await link(page);
    expect(first.origin).toBe('https://halftime-timer.vercel.app/');
    expect(first.target).toBe('_blank');
    expect(first.end).toBe(FIRST);
    // an ISO date-time with an offset, as halftime-timer reads it
    expect(first.endText).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    const m1 = /^First game · (\w+ @ \w+) (\d\d:\d\d)$/.exec(first.name!);
    expect(m1, first.name).not.toBeNull();
    expect(matchupsAt(FIRST)).toContain(m1![1]);
    // the time in the name is the tip-off as that game's card shows it
    expect(first.endText).toContain(`T${m1![2]}:00`);

    // the first game has started: the link, once the pointer reaches it, is the next game not started
    const next = night.find((g) => g.start > FIRST)!;
    await page.clock.setFixedTime(FIRST + MIN);
    await page.getByTestId('slate-countdown').first().hover();
    const second = await link(page);
    expect(second.end).toBe(next.start);
    const m2 = /^Next game · (\w+ @ \w+) \d\d:\d\d$/.exec(second.name!);
    expect(m2, second.name).not.toBeNull();
    expect(matchupsAt(next.start)).toContain(m2![1]);

    // every game has started: disabled, and it says why
    await page.mouse.move(0, 0);
    await page.clock.setFixedTime(LAST + MIN);
    await page.getByTestId('slate-countdown').first().hover();
    await expect(page.getByTestId('slate-countdown').first()).toHaveAttribute('aria-disabled', 'true');
    expect(await link(page)).toEqual({ disabled: 'true', tip: 'No more games today' });
  });
}

test('CK-22: the countdown button does not change the header line’s height, and is not in the copied image', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.install({ time: FIRST - 90 * MIN });
  await page.goto(`${APP}?view=league&layout=slate&date=${DATE}`);
  const header = page.getByTestId('slate').getByTestId('slate-header');
  await expect(header.getByTestId('slate-countdown')).toBeVisible();
  const h = (await header.boundingBox())!.height;
  await page.addStyleTag({ content: '[data-testid="slate-countdown"] { display: none !important; }' });
  expect((await header.boundingBox())!.height, info.project.name).toBe(h);
  // the copy's header (its own render) has no button
  const seen = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const obs = new MutationObserver(() => {
          const head = document.querySelector('.ck-capture .ck-slate-copy [data-testid="slate-header"]');
          if (head) {
            obs.disconnect();
            resolve(!!head.querySelector('[data-testid="slate-countdown"]'));
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
      }),
  );
  await page.getByTestId('copy-view').click();
  expect(await seen).toBe(false);
});

const DAY = '2026-11-02'; // 15 games, played: final scores, records, streaks, B2Bs
const NOW = new Date('2026-11-15T15:00:00Z');

test('CK-34: each card drawn alone is 509 × 78 with the same content as its card in the site’s Slate; the night’s list is in start order with exact instants', async ({ page, browser }) => {
  const played = nightOf(DAY);
  const noOdds = (p: Page) => p.route('**/api/odds**', (r) => r.fulfill({ json: { date: DAY, games: {} } }));

  // the site's Slate, notes hidden (how it opens): the cards' text by game
  await noOdds(page);
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}?view=league&layout=slate&date=${DAY}`);
  const cards = page.locator('[data-testid="slate"] .ck-slate-card');
  await expect(cards).toHaveCount(played.length);
  const text = (els: Element[]) => els.map((e) => [e.getAttribute('data-game-id'), (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim(), e.getAttribute('aria-label')] as const);
  const site = new Map((await cards.evaluateAll(text)).map(([id, t, label]) => [id, { t, label }]));
  const siteBox = (await cards.first().boundingBox())!;

  // the same night, every card on its own (the kit's slateNight + SlateGame)
  const ctx = await browser.newContext({ viewport: page.viewportSize()! });
  const alone = await ctx.newPage();
  await alone.clock.setFixedTime(NOW);
  await alone.goto(`${APP}slate.html?date=${DAY}&notes=0&game=all`);
  const items = alone.getByTestId('slate-alone');
  await expect(items).toHaveCount(played.length);
  await alone.evaluate(() => document.fonts.ready);

  // the list: every game of the night once, in start order, each start the feed's instant
  const list = await items.evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-id')!, start: Date.parse(e.getAttribute('data-start')!) })));
  expect(list.map((g) => g.id).sort()).toEqual(played.map((g) => g.id).sort());
  expect(list.map((g) => g.start)).toEqual(played.map((g) => g.start));
  for (const g of list) expect(g.start).toBe(played.find((p) => p.id === g.id)!.start);

  for (let i = 0; i < list.length; i++) {
    const one = items.nth(i).getByTestId('slate-one');
    const box = (await one.boundingBox())!;
    expect([box.width, box.height], list[i]!.id).toEqual([509, 78]);
    const card = one.locator('.ck-slate-card');
    await expect(card).toHaveCount(1);
    expect((await card.boundingBox())!.width).toBe(509);
    const [id, t, label] = (await card.evaluateAll(text))[0]!;
    expect(id).toBe(list[i]!.id);
    expect({ t, label }, id!).toEqual(site.get(id!));
  }
  // and the size is the site's own card's (its grid shares the 1 px borders, so its box is the same)
  expect([siteBox.width, siteBox.height]).toEqual([509, 78]);

  // one game asked for by id: that card only
  await alone.goto(`${APP}slate.html?date=${DAY}&notes=0&game=${played[3]!.id}`);
  await expect(alone.getByTestId('slate-alone')).toHaveCount(1);
  await expect(alone.locator('.ck-slate-card')).toHaveAttribute('data-game-id', played[3]!.id);
  await ctx.close();
});
