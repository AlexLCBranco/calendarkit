// List | Calendar switch, continuous league list and team list, in a real browser at every project width.
// The clock is fixed (Nov 15, 2026, 15:00 UTC) so the default day / next game are known. Screenshots of the four
// views go to e2e/screenshots/<project>-<league|team>-<list|calendar>.png.

import { expect, test, type Page } from '@playwright/test';

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
  await expect(page.getByTestId('team-header')).toHaveText(name);
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

test('league list: continuous days with sticky headers, week strip follows, bounded rendering', async ({ page }, info) => {
  const errors = collectErrors(page);
  const cdn = collectCdn(page);
  await open(page, '');
  const list = page.getByTestId('league-list');
  // opens on the default day, at the top of the list
  await expect(page.getByTestId('day-title')).toHaveText(/Nov(ember)? 15, 2026/);
  const topOf = () =>
    list.evaluate((el) => {
      const top = el.getBoundingClientRect().top;
      const days = [...el.querySelectorAll<HTMLElement>('[data-day]')];
      const first = days.find((d) => d.getBoundingClientRect().bottom > top + 1)!;
      const head = first.querySelector('.ck-lday-head')!.getBoundingClientRect();
      // sticky: at the top of the list, or being pushed up by the next day as its own day ends
      const pushed = head.top < top && head.bottom >= first.getBoundingClientRect().bottom - parseFloat(getComputedStyle(first).paddingBottom) - 1;
      return { day: first.dataset.day!, headAtTop: Math.abs(head.top - top) < 1.5 || pushed, headText: first.querySelector('.ck-lday-head')!.textContent, sectionTop: first.getBoundingClientRect().top - top, rendered: days.length, all: days.map((d) => d.dataset.day!) };
    });
  let t = await topOf();
  expect(t.day).toBe(DEFAULT_DAY);
  expect(Math.abs(t.sectionTop)).toBeLessThan(1.5);
  expect(t.headText).toMatch(/^Sun, Nov 15 · \d+ games$/);
  expect(t.all.indexOf(DEFAULT_DAY)).toBeGreaterThanOrEqual(0);

  // row size unchanged by the logos: single-line rows are 35 / 36.5 px (desktop) and 27 / 28.5 px (phone) as before,
  // and no row gets taller (or wraps) because of its logos
  expect(await rowsWithoutLogosDiffer(page)).toEqual([]);
  const single = await list.evaluate((el) => [...new Set([...el.querySelectorAll('.ck-card')].map((c) => Math.round(c.getBoundingClientRect().height * 2) / 2))]);
  expect(Math.min(...single)).toBe(info.project.name === 'phone' ? 27 : 35);
  const logo = await list.evaluate((el) => el.querySelector('.ck-card .ck-logo-backing')!.getBoundingClientRect().height);
  expect(logo).toBe(16);

  // scroll with the wheel: next days follow continuously, the header of the day at the top sticks, week strip follows
  await list.hover();
  let seen = new Set<string>([t.day]);
  for (let i = 0; i < 25; i++) {
    await page.mouse.wheel(0, 400);
    await settle(page);
    t = await topOf();
    seen.add(t.day);
    expect(t.headAtTop, `sticky header ${t.day}`).toBe(true);
    expect(t.rendered).toBeLessThanOrEqual(12);
    // the week strip and title name the day at the top (within 2 px of a day boundary either day is fine); polled,
    // as a wheel scroll may still be animating
    const topDayShown = () =>
      list.evaluate((el) => {
        const d = document.querySelector('[aria-label="Week"] [aria-selected="true"]')!.getAttribute('data-date')!;
        const s = el.querySelector('[data-day="' + d + '"]')!.getBoundingClientRect();
        const top = el.getBoundingClientRect().top;
        const title = document.querySelector('[data-testid="day-title"]')!.textContent!;
        return s.top - top <= 2 && s.bottom - top >= -2 && title.endsWith(Number(d.slice(8)) + ', ' + d.slice(0, 4)) ? 'ok' : d + ' ' + (s.top - top) + '..' + (s.bottom - top) + ' ' + title;
      });
    await expect.poll(topDayShown).toBe('ok');
  }
  expect(seen.size).toBeGreaterThan(3);
  const ordered = [...seen].sort();
  expect([...seen]).toEqual(ordered);
  const shownDay = await page.getByRole('tablist', { name: 'Week' }).getByRole('tab', { selected: true }).getAttribute('data-date');
  await expect(page).toHaveURL(new RegExp(`date=${shownDay}`));

  // clicking a week-strip day scrolls it to the top
  const target = await page.getByRole('tablist', { name: 'Week' }).getByRole('tab').and(page.locator(':not([disabled]):not([aria-selected="true"])')).last();
  const targetDate = (await target.getAttribute('data-date'))!;
  await target.click();
  await settle(page);
  t = await topOf();
  expect(t.day).toBe(targetDate);
  expect(Math.abs(t.sectionTop)).toBeLessThan(1.5);
  // arrows jump a game day
  await page.getByLabel('Next day').click();
  await settle(page);
  const afterNext = (await topOf()).day;
  expect(afterNext > targetDate).toBe(true);
  await page.getByLabel('Previous day').click();
  await settle(page);
  expect((await topOf()).day).toBe(targetDate);

  // fast scrolling anywhere: bounded rendering, the top day's header at the top, no jumps when scrolling up
  const total = await list.evaluate((el) => el.scrollHeight);
  for (const f of [0.9, 0.1, 0.55, 0.3, 0.75, 0.02]) {
    await list.evaluate((el, y) => (el.scrollTop = y), total * f);
    await settle(page);
    await settle(page);
    t = await topOf();
    expect(t.rendered).toBeLessThanOrEqual(12);
    expect(t.headAtTop).toBe(true);
  }
  const jumps = await list.evaluate(async (el) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    el.scrollTop = el.scrollHeight * 0.6;
    await frame();
    let bad = 0;
    for (let k = 0; k < 60; k++) {
      const card = [...el.querySelectorAll('article')].find((a) => a.getBoundingClientRect().top > el.getBoundingClientRect().top + 100)!;
      const before = card.getBoundingClientRect().top;
      el.scrollTop -= 200;
      await frame();
      if (!card.isConnected || Math.abs(card.getBoundingClientRect().top - before - 200) > 1.5) bad++;
    }
    return bad;
  });
  expect(jumps).toBe(0);
  const days = await page.evaluate(async () => {
    const raw = await (await fetch('/data/schedule.json')).json();
    return (raw.leagueSchedule.gameDates as unknown[]).length;
  });
  expect(days).toBeGreaterThan(100);
  expect(cdn).toEqual([]);
  expect(errors).toEqual([]);
});

test('team list: every game in order, opens at the next game, earlier games above, markers and B2B', async ({ page }, info) => {
  const errors = collectErrors(page);
  await open(page, '?view=team&layout=list&team=LAL');
  const list = page.getByTestId('team-list');
  await expect(list.locator('article').first()).toBeAttached();
  const expected = await feedTeamGames(page, 1610612747);
  const rows = await list.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('article')].map((a) => ({
      id: a.dataset.gameId!,
      next: a.hasAttribute('data-next'),
      b2b: !!a.querySelector('.ck-b2b-n2, [data-testid="fatigue-team"] [data-night="2"]'), // round 5: the Fatigue component on desktop
      date: a.querySelector('.ck-date')!.textContent!,
      matchup: [...a.querySelector('.ck-matchup')!.querySelectorAll('.ck-self, .ck-vsat, .ck-opp')].map((e) => e.textContent).join(' '), // without scores
      imgs: a.querySelectorAll('.ck-logo-backing img').length,
      offset: a.getBoundingClientRect().top - el.getBoundingClientRect().top,
    })),
  );
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
  // opens at the next game not over (first game on or after Nov 15 at 15:00 UTC), at the top of the list
  const nextIdx = rows.findIndex((r) => r.next);
  expect(expected[nextIdx]!.date >= '2026-11-15').toBe(true);
  expect(expected[nextIdx - 1]!.date < '2026-11-15').toBe(true);
  expect(Math.abs(rows[nextIdx]!.offset)).toBeLessThan(1.5);
  // markers and TV badge with network names
  await expect(list.locator('.ck-cup').first()).toBeAttached();
  await expect(list.locator('[data-testid="tv-badge"]').first()).toHaveText(/\w/);
  if (info.project.name !== 'phone') expect(await rowsWithoutLogosDiffer(page)).toEqual([]);
  // every width, phones included: date, time and "LAL vs OPP" (both logos, plus the final score) always share one
  // line. Desktop/tablet: rows without tags are single-line (the season line "G12 5-6" fits at the right). Phone:
  // the selected team's logo leaves no room on that line, so tags and the season line take a second line (every
  // row is two lines; three when B2B + long TV names fill line 2), and a played game's row leaves out its tip-off
  // time (measured; see PROJECT.md).
  const phone = info.project.name === 'phone';
  const lines = await list.evaluate((el) =>
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
  );
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
  const rows = await list.evaluate((el) =>
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
  );
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
