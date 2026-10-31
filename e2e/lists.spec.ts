// List | Calendar switch, the one-day league list (round 8) and team list, in a real browser at every project width.
// The clock is fixed (Nov 15, 2026, 15:00 UTC) so the default day / next game are known. Screenshots of the four
// views go to e2e/screenshots/<project>-<league|team>-<list|calendar>.png.

import { expect, test, type Page } from './fixtures';
import { eachTeamMonth, showMonth } from './teamMonths';

const NOW = new Date('2026-11-15T15:00:00Z');
const DEFAULT_DAY = '2026-11-15'; // evening games not over at 15:00 UTC

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
function collectCdn(page: Page) {
  const cdn: string[] = [];
  page.on('request', (r) => r.url().includes('cdn.nba.com') && cdn.push(r.url()));
  return cdn;
}
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `e2e/screenshots/${project}-${name}.png` });
const selected = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
/** Team picker (custom listbox with logos): open it and click the team. */
async function pickTeam(page: Page, name: string) {
  await page.getByTestId('team-picker').click();
  await page.getByRole('option', { name, exact: true }).click();
  await expect(page.getByTestId('team-header').locator('.ck-team-name')).toHaveText(name);
}
/** League → Calendar is the week view where 7 columns fit a game line (desktop widths), else the count grid. */
const weekView = (project: string) => project === 'desktop' || project === 'desktop-xl';
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await expect(page.getByRole('tablist', { name: 'Layout' })).toBeVisible();
}

/** Layout checks shared by every view: images loaded, nothing wider than its container, no sideways scroll. */
async function layoutChecks(page: Page) {
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  return page.evaluate(() => {
    const root = document.querySelector('.ck-root')!.getBoundingClientRect();
    const rows = [...document.querySelectorAll('.ck-card, .ck-month-game')];
    return {
      images: document.images.length,
      broken: [...document.images].filter((i) => i.naturalWidth === 0).map((i) => i.src),
      unbacked: [...document.querySelectorAll('.ck-card img, .ck-month-full img')].filter((i) => !i.parentElement!.classList.contains('ck-logo-backing')).length,
      clipped: rows.filter((r) => {
        const b = r.getBoundingClientRect();
        return b.width > 0 && (b.left < root.left - 0.5 || b.right > root.right + 0.5);
      }).length,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
}

// Team games straight from the served snapshot (independent of the app's code): shown types, team in the game.
type FeedGame = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; homeTeam: { teamId: number }; awayTeam: { teamId: number } };
async function feedTeamGames(page: Page, teamId: number) {
  return page.evaluate(async (teamId) => {
    const raw = await (await fetch('/data/schedule.json')).json();
    const games = (raw.leagueSchedule.gameDates as { games: FeedGame[] }[]).flatMap((d) => d.games);
    return games
      .filter((g) => /^00[2456]/.test(g.gameId) && (g.homeTeam.teamId === teamId || g.awayTeam.teamId === teamId))
      .map((g) => ({ id: g.gameId, date: g.gameDateEst.slice(0, 10) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, teamId);
}
/** Rows whose height changes when their logos are hidden (should be none). */
const rowsWithoutLogosDiffer = (page: Page) =>
  page.evaluate(() => {
    const cards = [...document.querySelectorAll('.ck-card')];
    const h = () => cards.map((c) => c.getBoundingClientRect().height);
    const withLogos = h();
    const st = document.createElement('style');
    st.textContent = '.ck-card .ck-logo-backing, .ck-card .ck-logo-empty { display: none }';
    document.head.append(st);
    const without = h();
    st.remove();
    // rows with national TV names may take a second line for them on phones anyway (e.g. ORL @ BOS "Peacock · NBC
    // Sports Network", 47.5 px, before and after round 4); since the league "B2B" badge left (round 4) such a row can
    // fit one line without logos, so those rows are left out here (no row grew: heights diffed, PROJECT.md)
    return cards.filter((c, i) => withLogos[i] !== without[i] && !c.querySelector('.ck-tv-name')).map((c) => c.textContent);
  });
const prevDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

test('List | Calendar switch: both options in League and Team, four views, layout kept and in the URL', async ({ page }, info) => {
  const errors = collectErrors(page);
  const cdn = collectCdn(page);
  const project = info.project.name;
  await open(page, '');
  const views: [string, string, () => Promise<void>][] = [
    ['League', 'List', () => expect(page.getByRole('region', { name: 'League schedule' })).toBeVisible()],
    ['League', 'Calendar', () => expect(page.getByRole('region', { name: weekView(project) ? 'League week' : 'Month navigator' })).toBeVisible()],
    ['Team', 'Calendar', () => expect(page.getByRole('region', { name: 'Celtics schedule' })).toBeVisible()],
    ['Team', 'List', () => expect(page.getByRole('region', { name: 'Celtics games' })).toBeVisible()],
  ];
  for (const [mode, layout, check] of views) {
    await selected(page, mode).click();
    if (mode === 'Team') await pickTeam(page, 'Boston Celtics');
    await selected(page, layout).click();
    await expect(selected(page, 'List')).toBeVisible();
    await expect(selected(page, 'Calendar')).toBeVisible();
    await expect(selected(page, layout)).toHaveAttribute('aria-selected', 'true');
    await expect(selected(page, mode)).toHaveAttribute('aria-selected', 'true');
    await check();
    await expect(page).toHaveURL(new RegExp(`view=${mode.toLowerCase()}&layout=${layout.toLowerCase()}`));
    const r = await layoutChecks(page);
    expect(r.broken, `${mode} ${layout}`).toEqual([]);
    expect(r.unbacked).toBe(0);
    expect(r.clipped, `${mode} ${layout}`).toBe(0);
    expect(r.sideways, `${mode} ${layout}`).toBeLessThanOrEqual(0);
    if (layout === 'List') {
      expect(r.images).toBeGreaterThan(10); // logos in the list rows
      expect(r.pageScroll, 'list fills the window, scrolls inside').toBeLessThanOrEqual(1);
    }
    await page.mouse.move(0, 0);
    await shot(page, `${mode.toLowerCase()}-${layout.toLowerCase()}`, project);
  }
  // Team → List kept when going back to League; a reload keeps it all
  await selected(page, 'League').click();
  await expect(page.getByRole('region', { name: 'League schedule' })).toBeVisible();
  await selected(page, 'Calendar').click();
  await selected(page, 'Team').click();
  await expect(page.getByRole('region', { name: 'Celtics schedule' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Celtics schedule' })).toBeVisible();
  await expect(selected(page, 'Calendar')).toHaveAttribute('aria-selected', 'true');
  expect(cdn).toEqual([]);
  expect(errors).toEqual([]);
});

test('old ?view= links open the matching view', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '?view=team&team=BOS');
  await expect(page.getByRole('region', { name: 'Celtics schedule' })).toBeVisible();
  await expect(selected(page, 'Calendar')).toHaveAttribute('aria-selected', 'true');
  await open(page, '?view=league&date=2026-11-02');
  await expect(page.getByRole('region', { name: 'League schedule' })).toBeVisible();
  await expect(page.getByTestId('day-title')).toHaveText(/Nov(ember)? 2, 2026/);
  expect(errors).toEqual([]);
});

/** The day's games straight from the served snapshot (independent of the app's code), in feed order. */
const feedDay = (page: Page, date: string) =>
  page.evaluate(async (date) => {
    const raw = await (await fetch('/data/schedule.json')).json();
    return (raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateEst: string }[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId) && g.gameDateEst.startsWith(date)).map((g) => g.gameId);
  }, date);
/** What the League List shows: its day sections and the game ids in them. */
const shownList = (page: Page) =>
  page.getByTestId('league-list').evaluate((el) => ({
    days: [...el.querySelectorAll<HTMLElement>('[data-day]')].map((d) => d.dataset.day!),
    ids: [...el.querySelectorAll<HTMLElement>('[data-game-id]')].map((d) => d.dataset.gameId!),
    title: document.querySelector('[data-testid="day-title"]')!.textContent!,
  }));

// Round 8 (1.1–1.3): one day on screen; only the arrows, the arrow keys, the date picker, Today and the day strip change it.
test('league list: one day at a time, never changed by scrolling, every navigation lands on the right day', async ({ page }, info) => {
  const errors = collectErrors(page);
  const cdn = collectCdn(page);
  const project = info.project.name;
  const desktop = project === 'desktop' || project === 'desktop-xl';
  await open(page, '');
  const list = page.getByTestId('league-list');
  await expect(page.getByTestId('day-title')).toHaveText(/Nov(ember)? 15, 2026/);
  const expectDay = async (date: string) => {
    const want = await feedDay(page, date);
    await expect.poll(() => shownList(page).then((x) => [x.days, x.ids])).toEqual([[date], want]);
    expect(await list.evaluate((el) => el.querySelector('.ck-lday-head')!.getBoundingClientRect().top - el.getBoundingClientRect().top)).toBeLessThan(1.5);
  };
  await expectDay(DEFAULT_DAY);

  // rows: bigger on desktop (zoom from LEAGUE_FONT_*: 1.3 at 1920, 1 at 1280; LEAGUE_ROW_HEIGHT 40), as before elsewhere
  expect(await rowsWithoutLogosDiffer(page)).toEqual([]);
  const zoom = project === 'desktop-xl' ? 1.3 : 1;
  const single = await list.evaluate((el) => [...new Set([...el.querySelectorAll('.ck-card')].map((c) => Math.round(c.getBoundingClientRect().height * 2) / 2))]);
  expect(Math.min(...single)).toBe(desktop ? 40 * zoom : project === 'phone' ? 27 : 35);
  expect(await list.evaluate((el) => el.querySelector('.ck-card .ck-logo-backing')!.getBoundingClientRect().height)).toBeCloseTo(16 * zoom, 1);

  // the wheel and a scrollbar jump never change the day (the list may scroll within it)
  await list.hover();
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, i < 8 ? 600 : -300);
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await settle(page);
  await expect.poll(() => shownList(page).then((x) => [x.days, x.ids])).toEqual([[DEFAULT_DAY], await feedDay(page, DEFAULT_DAY)]);
  await expect(page.getByTestId('day-title')).toHaveText(/Nov(ember)? 15, 2026/);
  expect(page.url()).not.toMatch(/date=/);

  // every way to change the day; a new day starts at its top
  await page.getByLabel('Next day').click();
  await expectDay('2026-11-16');
  if (desktop) {
    await page.keyboard.press('ArrowRight');
    await expectDay('2026-11-17');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expectDay(DEFAULT_DAY);
  }
  await page.getByLabel('Previous day').click();
  await expectDay(desktop ? '2026-11-14' : DEFAULT_DAY); // desktop: back at Nov 15 by the keys first
  // a day in the strip's week (Nov 8–14 on desktop, Nov 15–21 elsewhere)
  await page.getByRole('tablist', { name: 'Week' }).getByRole('tab', { name: desktop ? /^Tuesday, November 10/ : /^Wednesday, November 18/ }).click();
  await expectDay(desktop ? '2026-11-10' : '2026-11-18');
  if (project !== 'phone') {
    await page.getByRole('button', { name: 'Today' }).click();
    await expectDay(DEFAULT_DAY);
  }
  if (project === 'phone') await page.getByRole('tablist', { name: 'Week' }).getByRole('tab', { name: /^Sunday, November 15/ }).click(); // no Today on phones
  await page.getByLabel('Next week').click();
  await expectDay('2026-11-22');
  if (desktop) {
    await page.getByTestId('date-pick').click();
    await page.getByTestId('date-picker').locator('[data-date="2026-11-27"]').click();
    await expectDay('2026-11-27');
  }
  expect(page.url()).not.toMatch(/date=/);
  expect(cdn).toEqual([]);
  expect(errors).toEqual([]);
});

// Round 8 (1.2): on a busy night the list scrolls within that day only.
test('league list: a 15-game night scrolls within the day only', async ({ page }, info) => {
  test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths');
  const width = page.viewportSize()!.width;
  await page.setViewportSize({ width, height: 640 }); // a short window, so the 15 rows can't fit
  const date = '2026-11-02';
  await open(page, `?view=league&layout=list&date=${date}`);
  const want = await feedDay(page, date);
  expect(want).toHaveLength(15);
  const list = page.getByTestId('league-list');
  const m = await list.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(m.sh).toBeGreaterThan(m.ch);
  await list.hover();
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 500);
  await expect.poll(() => list.evaluate((el) => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 1)).toBe(true);
  const end = await shownList(page);
  expect([end.days, end.ids]).toEqual([[date], want]);
  expect(end.title).toMatch(/November 2, 2026/);
  // the end of the scroll is the day's last row (plus the day's own padding): no further days, no spacer
  const gap = await list.evaluate((el) => el.getBoundingClientRect().bottom - [...el.querySelectorAll('.ck-card')].at(-1)!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(20);
});

// Round 8 (1.4): the list starts at the page's left edge; the right side is free for the map.
test('league list: left-aligned at 1280 and 1920, right side free', async ({ page }, info) => {
  test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths');
  await open(page, '');
  const r = await page.evaluate(() => {
    const root = document.querySelector('.ck-root')!.getBoundingClientRect();
    const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    return { root: [root.left, root.right] as [number, number], bar: box('[data-testid="top-bar"]').left, strip: box('[data-testid="week-strip"]').left, list: box('[data-testid="league-list"]').left, head: box('.ck-lday-head').left, right: box('.ck-league-list').right };
  });
  for (const x of [r.bar, r.strip, r.list]) expect(Math.abs(x - r.root[0])).toBeLessThan(1);
  expect(Math.abs(r.head - r.root[0])).toBeLessThan(4);
  // the list column (LEAGUE_LIST_COLUMN 910 × zoom) leaves the right side free
  const zoom = info.project.name === 'desktop-xl' ? 1.3 : 1;
  expect(r.right - r.root[0]).toBeCloseTo(910 * zoom, 0);
  expect(r.root[1] - r.right).toBeGreaterThan(260);
});

test('team list: every game in order, opens at the next game, earlier games above, markers and B2B', async ({ page }, info) => {
  const errors = collectErrors(page);
  await open(page, '?view=team&layout=list&team=LAL');
  const list = page.getByTestId('team-list');
  await expect(list.locator('article').first()).toBeAttached();
  const expected = await feedTeamGames(page, 1610612747);
  // opens at the next game not over (first game on or after Nov 15 at 15:00 UTC), at the top of the list (its month)
  const atOpen = await list.evaluate((el) => {
    const a = el.querySelector<HTMLElement>('article[data-next]')!;
    return { id: a.dataset.gameId!, offset: a.getBoundingClientRect().top - el.getBoundingClientRect().top };
  });
  // round 9: one month at a time — every month in turn
  const rows = (await eachTeamMonth(page, 'LAL', () => list.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('article')].map((a) => ({
      id: a.dataset.gameId!,
      next: a.hasAttribute('data-next'),
      b2b: !!a.querySelector('.ck-b2b-n2, [data-testid="fatigue-team"] [data-night="2"]'), // round 5: the Fatigue component on desktop
      date: a.querySelector('.ck-date')!.textContent!,
      matchup: [...a.querySelector('.ck-matchup')!.querySelectorAll('.ck-self, .ck-vsat, .ck-opp')].map((e) => e.textContent).join(' '), // without scores
      imgs: a.querySelectorAll('.ck-logo-backing img').length,
    })),
  ))).flat();
  expect(rows.map((r) => r.id)).toEqual(expected.map((g) => g.id));
  expect(rows.length).toBeGreaterThanOrEqual(80);
  // night 2 of a back-to-back exactly where the team also played the previous calendar day
  const dates = new Set(expected.map((g) => g.date));
  expect(rows.map((r) => r.b2b)).toEqual(expected.map((g) => dates.has(prevDay(g.date))));
  expect(rows.filter((r) => r.b2b).length).toBeGreaterThan(5);
  for (const r of rows) {
    expect(r.date).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d\d\/\d\d$/);
    expect(r.matchup).toMatch(/^LAL (vs|@) [A-Z]{3}/);
    expect(r.imgs).toBe(2);
  }
  const nextIdx = rows.findIndex((r) => r.next);
  expect(rows[nextIdx]!.id).toBe(atOpen.id);
  expect(expected[nextIdx]!.date >= '2026-11-15').toBe(true);
  expect(expected[nextIdx - 1]!.date < '2026-11-15').toBe(true);
  expect(Math.abs(atOpen.offset)).toBeLessThan(1.5);
  // markers and TV badge with network names (November: Cup group games)
  await showMonth(page, '2026-11');
  await expect(list.locator('.ck-cup').first()).toBeAttached();
  await expect(list.locator('[data-testid="tv-badge"]').first()).toHaveText(/\w/);
  if (info.project.name !== 'phone') expect(await rowsWithoutLogosDiffer(page)).toEqual([]);
  // every width, phones included: date, time and "LAL vs OPP" (both logos, plus the final score) always share one
  // line. Desktop/tablet: rows without tags are single-line (the season line "G12 5-6" fits at the right). Phone:
  // the selected team's logo leaves no room on that line, so tags and the season line take a second line (every
  // row is two lines; three when B2B + long TV names fill line 2), and a played game's row leaves out its tip-off
  // time (measured; see PROJECT.md).
  const phone = info.project.name === 'phone';
  const lines = (await eachTeamMonth(page, 'LAL', () => list.evaluate((el) =>
    [...el.querySelectorAll('article')].map((a) => {
      const shown = ['.ck-date', '[data-testid="tipoff"]', '.ck-matchup'].map((s) => a.querySelector(s)!.getBoundingClientRect()).filter((r) => r.height > 0);
      return {
        id: a.dataset.gameId,
        oneLine: new Set(shown.map((r) => Math.round(r.top + r.height / 2))).size === 1,
        time: a.querySelector('[data-testid="tipoff"]')!.getBoundingClientRect().height > 0,
        final: !!a.querySelector('.ck-score'),
        tags: a.querySelector('.ck-tags')!.children.length,
        h: a.getBoundingClientRect().height,
        text: a.textContent,
      };
    }),
  ))).flat();
  expect(lines.filter((l) => !l.oneLine)).toEqual([]);
  expect(lines.filter((l) => l.time !== (!phone || !l.final))).toEqual([]); // time left out only on played phone rows
  if (phone) {
    expect(lines.filter((l) => !l.tags && l.h > 47.5).map((l) => `${l.id} ${l.h} ${l.text}`)).toEqual([]);
    expect(lines.filter((l) => l.h > 66.5).map((l) => `${l.id} ${l.h} ${l.text}`)).toEqual([]); // long tags (B2B + "Peacock · NBC Sports Network"): season on a 3rd line
  } else expect(Math.max(...lines.filter((l) => !l.tags).map((l) => l.h))).toBeLessThanOrEqual(36.5);
  // earlier games: scroll up
  await list.hover();
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -600);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(list.locator('article').first()).toBeInViewport();
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  expect(await page.evaluate(() => [...document.images].filter((i) => i.naturalWidth === 0).length)).toBe(0);
  // same team picker as Team → Calendar
  await pickTeam(page, 'Miami Heat');
  await expect(page.getByRole('region', { name: 'Heat games' })).toBeVisible();
  await selected(page, 'Calendar').click();
  await expect(page.getByTestId('team-picker')).toHaveAttribute('data-team-id', '1610612748');
  expect(errors).toEqual([]);
});

test('team list season line: game number + record + streak going in on the right, final score beside the names', async ({ page }, info) => {
  const errors = collectErrors(page);
  await open(page, '?view=team&layout=list&team=BOS');
  const list = page.getByTestId('team-list');
  await expect(list.locator('article').first()).toBeAttached();
  // expected straight from the served snapshot: regular games (002…) numbered in order; record going in = the
  // feed's own W-L on the previous game once that game is Final (gameStatus 3)
  const want = await page.evaluate(async () => {
    const BOS = 1610612738;
    const raw = await (await fetch('/data/schedule.json')).json();
    type T = { teamId: number; teamTricode: string; score: number; wins: number; losses: number };
    const games = (raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateEst: string; gameStatus: number; homeTeam: T; awayTeam: T }[] }[])
      .flatMap((d) => d.games)
      .filter((g) => /^00[2456]/.test(g.gameId) && (g.homeTeam.teamId === BOS || g.awayTeam.teamId === BOS))
      .sort((a, b) => a.gameDateEst.localeCompare(b.gameDateEst));
    let n = 0;
    let rec: string | null = '0-0';
    let streak = ''; // e.g. "L1": the run of equal results ending with the previous regular-season game
    return games.map((g) => {
      const [self, opp] = g.homeTeam.teamId === BOS ? [g.homeTeam, g.awayTeam] : [g.awayTeam, g.homeTeam];
      const final = g.gameStatus === 3;
      const regular = g.gameId.startsWith('002');
      const row = { id: g.gameId, game: regular ? `G${++n}` : null, record: regular ? (rec ?? '') : null, streak: regular ? (rec === null ? '' : streak) : null, scores: final ? [String(self.score), String(opp.score)] : [] };
      if (regular) {
        rec = final && rec !== null ? `${self.wins}-${self.losses}` : null;
        if (final) {
          const k = self.score > opp.score ? 'W' : 'L';
          streak = streak.startsWith(k) ? `${k}${Number(streak.slice(1)) + 1}` : `${k}1`;
        }
      }
      return row;
    });
  });
  expect(want.some((w) => w.scores.length)).toBe(true); // the snapshot has final games
  const rows = (await eachTeamMonth(page, 'BOS', () => list.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('article')].map((a) => {
      const s = a.querySelector('[data-testid="season"]');
      const b = a.getBoundingClientRect();
      const r = s?.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(a).paddingRight) + parseFloat(getComputedStyle(a).borderRightWidth);
      return {
        id: a.dataset.gameId!,
        game: s?.children[0]!.textContent ?? null,
        record: s ? s.children[1]!.textContent : null,
        streak: s ? s.children[2]!.textContent : null,
        scores: [...a.querySelectorAll('.ck-score')].map((x) => x.textContent),
        // right side: the block ends at the row's content edge, inside the row
        right: r ? b.right - pad - r.right : 0,
        inside: !r || (r.left >= b.left && r.right <= b.right + 0.5),
        recRight: s ? s.children[1]!.getBoundingClientRect().right : 0,
      };
    }),
  ))).flat();
  expect(rows.map(({ id, game, record, streak, scores }) => ({ id, game, record, streak, scores }))).toEqual(want);
  expect(want.some((w) => w.streak)).toBe(true);
  for (const r of rows) {
    expect(r.inside, r.id).toBe(true);
    expect(Math.abs(r.right), r.id).toBeLessThanOrEqual(0.5);
  }
  // records line up down the list (same right edge)
  expect(new Set(rows.filter((r) => r.game).map((r) => Math.round(r.recRight))).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await list.evaluate((el) => (el.scrollTop = 0));
  await page.mouse.move(0, 0);
  await shot(page, 'team-list-season', info.project.name);
  expect(errors).toEqual([]);
});

test('TV games only in all four views', async ({ page }, info) => {
  const errors = collectErrors(page);
  const noTv = (sel: string) => page.locator(sel).count();
  await open(page, '?view=league&layout=list&tv=1');
  await expect(page.locator('[data-testid="league-list"] article').first()).toBeVisible();
  expect(await noTv('[data-testid="league-list"] article:not(:has([data-testid="tv-badge"]))')).toBe(0);
  await open(page, '?view=team&layout=list&team=LAL&tv=1');
  await expect(page.locator('[data-testid="team-list"] article').first()).toBeAttached();
  expect(await noTv('[data-testid="team-list"] article:not(:has([data-testid="tv-badge"]))')).toBe(0);
  await open(page, '?view=team&layout=calendar&team=LAL&tv=1');
  await expect(page.locator('.ck-cell-game').first()).toBeVisible();
  expect(await noTv('.ck-cell [data-game-id]:not(:has([data-testid="tv-badge"]))')).toBe(0);
  await open(page, '?view=league&layout=calendar&date=2026-11-02&tv=1');
  if (!weekView(info.project.name)) {
    await expect(page.getByRole('region', { name: 'Month navigator' })).toBeVisible();
  } else {
    await expect(page.locator('.ck-month-game').first()).toBeVisible();
    expect(await noTv('.ck-month-game:not(:has(.ck-tv-pill))')).toBe(0);
  }
  expect(errors).toEqual([]);
});
