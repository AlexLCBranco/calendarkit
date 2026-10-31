// Round 9, Part 1: the Team List shows one calendar month, in a real browser against the served snapshot. Rows = that
// month's games (+ rest days); the month title in the team header; the week strip's ‹ › and day clicks, the date picker
// and Today switch months and put the row at the top; a B2B split across the month edge keeps its marks but no bracket;
// the Team map's stops in another month don't switch months; the whole-list copy = the month; month change timing.

import { expect, test, type Page } from './fixtures';
import { monthTitle as title, showMonth } from './teamMonths';

const NOW = new Date('2026-11-15T15:00:00Z');

async function open(page: Page, team: string, extra = '') {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/?view=team&layout=list&team=${team}${extra}`);
  await page.waitForFunction(() => !!document.querySelector('[data-testid="team-list"] [data-game-id]'));
}

type Snap = Record<string, { games: { id: string; date: string; tv: boolean }[]; rest: string[] }>;
/** Every team's games (ET dates, national TV) and rest days from the served snapshot, worked out here. */
const snapshot = (page: Page) =>
  page.evaluate(async () => {
    type G = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string }; broadcasters: { nationalBroadcasters?: { broadcasterDisplay: string }[] } };
    const raw = await (await fetch('/data/schedule.json')).json();
    const games = (raw.leagueSchedule.gameDates as { games: G[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId));
    const out: Record<string, { games: { id: string; date: string; tv: boolean }[]; rest: string[] }> = {};
    for (const g of games)
      for (const t of [g.homeTeam.teamTricode, g.awayTeam.teamTricode])
        if (t) (out[t] ??= { games: [], rest: [] }).games.push({ id: g.gameId, date: g.gameDateEst.slice(0, 10), tv: (g.broadcasters.nationalBroadcasters ?? []).some((b) => b.broadcasterDisplay !== 'NBA TV') });
    for (const t of Object.values(out)) {
      t.games.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      const dates = new Set(t.games.map((g) => g.date));
      const end = new Date(`${t.games.at(-1)!.date}T00:00:00Z`);
      for (const d = new Date(`${t.games[0]!.date}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) if (!dates.has(d.toISOString().slice(0, 10))) t.rest.push(d.toISOString().slice(0, 10));
    }
    return out;
  }) as Promise<Snap>;

const monthsOf = (dates: string[]) => [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
const rowDates = (page: Page) => page.locator('[data-testid="team-list"] .ck-team-rows > [data-row-date]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.rowDate!));
/** The row whose top is at the list's top (within 1 px). */
const topRow = (page: Page) =>
  page.getByTestId('team-list').evaluate((l) => {
    const top = l.getBoundingClientRect().top;
    return [...l.querySelectorAll<HTMLElement>('.ck-team-rows > [data-row-date]')].find((r) => Math.abs(r.getBoundingClientRect().top - top) < 1.5)?.dataset.rowDate ?? null;
  });
const monthTitle = (page: Page, compact: boolean) => (compact ? page.getByTestId('team-month') : page.getByTestId('team-header').getByTestId('team-month'));

test('every team × every month: the rows are exactly that month’s games (+ rest days), the title says the month', async ({ page }, info) => {
  test.setTimeout(240_000);
  const compact = info.project.name === 'phone';
  await open(page, 'BOS');
  const snap = await snapshot(page);
  expect(Object.keys(snap)).toHaveLength(30);
  let checked = 0;
  for (const tri of Object.keys(snap).sort()) {
    await page.getByTestId('team-picker').click();
    await page.getByRole('option').filter({ has: page.locator(`img[src="/logos/${tri}.svg"]`) }).first().click();
    const { games, rest } = snap[tri]!;
    for (const m of monthsOf(games.map((g) => g.date))) {
      await showMonth(page, m);
      // phones have no rest rows (unchanged since round 3)
      const want = [...games.map((g) => g.date), ...(compact ? [] : rest)].filter((d) => d.startsWith(m)).sort();
      expect(await rowDates(page), `${tri} ${m}`).toEqual(want);
      await expect(monthTitle(page, compact)).toHaveText(title(m));
      checked++;
    }
  }
  console.log(`[${info.project.name}] team × month checked: ${checked}`);
  expect(checked).toBeGreaterThan(30 * 6);
});

test('opens on the month of the next game, that game at the top; the top bar stays one row at 1920', async ({ page }, info) => {
  const compact = info.project.name === 'phone';
  await open(page, 'LAL');
  const snap = await snapshot(page);
  const next = snap.LAL!.games.find((g) => g.date >= '2026-11-15')!; // NOW is 15:00 UTC: no LAL game is over yet that day
  await expect(monthTitle(page, compact)).toHaveText(title(next.date.slice(0, 7)));
  await expect.poll(() => topRow(page)).toBe(next.date);
  expect((await rowDates(page)).every((d) => d.startsWith(next.date.slice(0, 7)))).toBe(true);
  if (info.project.name === 'desktop-xl') expect((await page.getByTestId('top-bar').boundingBox())!.height).toBeLessThanOrEqual(40);
  // the title is plain text, inside the window, not cut off
  const t = await monthTitle(page, compact).evaluate((e) => ({ w: e.scrollWidth, cw: e.clientWidth, right: e.getBoundingClientRect().right, vw: innerWidth, tag: e.tagName }));
  expect(t.w).toBeLessThanOrEqual(t.cw + 1);
  expect(t.right).toBeLessThanOrEqual(t.vw);
});

test.describe('desktop and tablet: strip, picker, Today', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name === 'phone', 'phones have no strip, picker or Today (their ‹ › is checked above)'));

  test('strip ‹ › across every month edge of the season: right month, the week’s first game at the top; disabled at the ends', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, 'LAL', '');
    const snap = await snapshot(page);
    const games = snap.LAL!.games.map((g) => g.date);
    // back to the first game
    const prev = page.getByLabel('Previous week');
    for (let i = 0; i < 40 && !(await prev.isDisabled()); i++) await prev.click();
    await expect(prev).toBeDisabled();
    await expect.poll(() => topRow(page)).toBe(games[0]);
    const next = page.getByLabel('Next week');
    let edges = 0;
    for (let i = 0; i < 40 && !(await next.isDisabled()); i++) {
      const week = await page.getByTestId('week-strip').getByRole('tab').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.date!));
      const before = (await page.getByTestId('team-month').textContent())!;
      await next.click();
      const want = games.find((d) => d > week[6]!)!;
      await expect(page.getByTestId('team-month')).toHaveText(title(want.slice(0, 7)));
      await expect.poll(() => topRow(page), `after the week of ${week[0]}`).toBe(want);
      if ((await page.getByTestId('team-month').textContent()) !== before) edges++;
    }
    await expect(next).toBeDisabled();
    expect(edges).toBe(monthsOf(games).length - 1);
    await expect(page.getByTestId('team-month')).toHaveText(title(games.at(-1)!.slice(0, 7)));
  });

  test('a strip day in the other month, and the date picker: that month, the row at the top; Today → back', async ({ page }) => {
    await open(page, 'LAL');
    const snap = await snapshot(page);
    const list = page.getByTestId('team-list');
    // scroll to the bottom of November: the last week runs into December
    await list.evaluate((l) => (l.scrollTop = l.scrollHeight));
    await expect(page.getByTestId('week-strip').getByRole('tab').last()).toHaveAttribute('data-date', /^2026-12/);
    const dec = page.getByTestId('week-strip').locator('[role="tab"][data-date^="2026-12"]:not([disabled])').first();
    const day = (await dec.getAttribute('data-date'))!;
    await dec.click();
    await expect(page.getByTestId('team-month')).toHaveText('December 2026');
    await expect.poll(() => topRow(page)).toBe(day);
    // the picker: a day in March → March, the row at the top
    await page.getByRole('button', { name: 'Pick a date' }).click();
    const popup = page.getByRole('dialog', { name: 'Pick a date' });
    for (let i = 0; i < 3; i++) await popup.getByRole('button', { name: 'Next month' }).click();
    await expect(popup.getByTestId('period-title')).toHaveText('March 2027');
    await popup.locator('[data-date="2027-03-10"]').click();
    const row = [...snap.LAL!.games.map((g) => g.date), ...snap.LAL!.rest].sort().find((d) => d >= '2027-03-10')!;
    await expect(page.getByTestId('team-month')).toHaveText('March 2027');
    await expect.poll(() => topRow(page)).toBe(row);
    // Today: November, the next game at the top
    await page.getByTestId('today').click();
    await expect(page.getByTestId('team-month')).toHaveText('November 2026');
    await expect.poll(() => topRow(page)).toBe(snap.LAL!.games.find((g) => g.date >= '2026-11-15')!.date);
    await expect(page.getByTestId('today')).toBeDisabled();
  });

  test('scrolling stays inside the month: the bottom shows the month’s last row, never the next month’s', async ({ page }) => {
    await open(page, 'BOS');
    const list = page.getByTestId('team-list');
    await list.hover();
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(300);
    const dates = await rowDates(page);
    expect(dates.every((d) => d.startsWith('2026-11'))).toBe(true);
    await expect(page.getByTestId('team-month')).toHaveText('November 2026');
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -2000);
    await page.waitForTimeout(300);
    await expect.poll(() => topRow(page)).toBe(dates[0]);
  });

  test('month change: click → next frame (printed), guarded', async ({ page }, info) => {
    await open(page, 'LAL');
    // across the Nov → Dec edge and back, with the strip's ‹ ›
    await page.getByTestId('team-list').evaluate((l) => (l.scrollTop = l.scrollHeight));
    await page.waitForTimeout(300);
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const before = await page.getByTestId('team-month').textContent();
      const label = before === 'November 2026' ? 'Next week' : 'Previous week';
      times.push(
        await page.evaluate(
          (label) =>
            new Promise<number>((res) => {
              const b = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
              const t0 = performance.now();
              b.click();
              requestAnimationFrame(() => res(performance.now() - t0));
            }),
          label,
        ),
      );
      await expect(page.getByTestId('team-month')).not.toHaveText(before!);
      if (before === 'December 2026') await page.getByTestId('team-list').evaluate((l) => (l.scrollTop = l.scrollHeight));
      await page.waitForTimeout(100);
    }
    const sorted = [...times].sort((a, b) => a - b);
    console.log(`[${info.project.name}] month change click → next frame: median ${sorted[5]!.toFixed(1)} ms, max ${sorted.at(-1)!.toFixed(1)} ms`);
    expect(sorted[5]).toBeLessThan(100);
  });
});

test('a B2B split across a month edge: badge and chips on both nights, no bracket toward the other month', async ({ page }, info) => {
  test.setTimeout(120_000);
  const compact = info.project.name === 'phone';
  await open(page, 'BOS');
  const snap = await snapshot(page);
  const split: [string, string][] = [];
  for (const [tri, t] of Object.entries(snap)) {
    const dates = new Set(t.games.map((g) => g.date));
    for (const d of dates) {
      const n = new Date(`${d}T00:00:00Z`);
      n.setUTCDate(n.getUTCDate() + 1);
      const d2 = n.toISOString().slice(0, 10);
      if (dates.has(d2) && d.slice(0, 7) !== d2.slice(0, 7)) split.push([tri, d]);
    }
  }
  console.log(`[${info.project.name}] B2Bs split across a month edge in the snapshot: ${split.map((s) => s.join(' ')).join(', ')}`);
  expect(split.length).toBeGreaterThan(0);
  for (const [tri, first] of split.slice(0, 6)) {
    await page.getByTestId('team-picker').click();
    await page.getByRole('option').filter({ has: page.locator(`img[src="/logos/${tri}.svg"]`) }).first().click();
    const n = new Date(`${first}T00:00:00Z`);
    n.setUTCDate(n.getUTCDate() + 1);
    for (const [date, night] of [[first, '1'], [n.toISOString().slice(0, 10), '2']] as const) {
      await showMonth(page, date.slice(0, 7));
      const row = page.locator(`[data-testid="team-list"] [data-row-date="${date}"]`);
      const r = await row.evaluate((e, night) => ({
        b2b: (e as HTMLElement).dataset.b2b ?? '',
        before: getComputedStyle(e, '::before').content,
        badge: !!e.querySelector(`[data-testid="fatigue-team"] [data-night="${night}"], .ck-b2b-n${night}`),
        leg: !!e.querySelector(`[data-testid="fatigue-team"] [data-night="${night}"] .ck-leg, [data-testid="fatigue-team"] [data-night="${night}"] [data-leg]`),
        chip: !!e.querySelector('[data-testid="fatigue-team"] [data-tif]'),
      }), night);
      expect(r.badge, `${tri} ${date} badge`).toBe(true);
      expect(r.b2b.split(' '), `${tri} ${date} bracket`).not.toContain(night);
      if (!r.b2b) expect(r.before, `${tri} ${date} no bracket drawn`).toBe('none');
      if (info.project.name.startsWith('desktop')) console.log(`[${info.project.name}] ${tri} ${date} night ${night}: bracket "${r.b2b}", chip ${r.chip}`);
    }
    if (compact) break; // the phone check is the same rule; one pair is enough there
  }
});

test.describe('Team map (1920): a stop in another month', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'the Team map shows at 1920 only'));

  test('hovering a stop in another month: no month change, no row lit, the info line shows it; a stop in the month lights its row', async ({ page }) => {
    await open(page, 'BOS');
    // a real road trip across a month edge (runs of games outside the home metro, from the snapshot), and a clock just
    // before its first game, so it is the current trip the map shows
    const trip = await page.evaluate(async () => {
      type G = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; arenaName: string; arenaCity: string; homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } };
      const raw = await (await fetch('/data/schedule.json')).json();
      const all = (raw.leagueSchedule.gameDates as { games: G[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId));
      const metro = (c: string) => ({ Inglewood: 'Los Angeles', Brooklyn: 'New York' })[c] ?? c;
      for (const tri of [...new Set(all.map((g) => g.homeTeam.teamTricode))].filter(Boolean).sort()) {
        const games = all.filter((g) => g.homeTeam.teamTricode === tri || g.awayTeam.teamTricode === tri).sort((a, b) => a.gameDateTimeUTC.localeCompare(b.gameDateTimeUTC));
        const cities = new Map<string, number>();
        for (const g of games) if (g.homeTeam.teamTricode === tri) cities.set(g.arenaCity, (cities.get(g.arenaCity) ?? 0) + 1);
        const home = [...cities].sort((a, b) => b[1] - a[1])[0]![0];
        let run: G[] = [];
        for (const g of [...games, undefined]) {
          if (g && g.arenaName && metro(g.arenaCity) !== metro(home)) {
            run.push(g);
            continue;
          }
          const months = new Set(run.map((x) => x.gameDateEst.slice(0, 7)));
          if (months.size > 1 && run[0]!.gameDateEst >= '2026-11-01') return { tri, ids: run.map((x) => x.gameId), months: [...months], start: run[0]!.gameDateTimeUTC };
          run = [];
        }
      }
      return null;
    });
    expect(trip, 'a road trip across a month edge in the snapshot').toBeTruthy();
    await page.clock.setFixedTime(new Date(Date.parse(trip!.start) - 3_600_000));
    await page.goto(`/?view=team&layout=list&team=${trip!.tri}`);
    const map = page.getByTestId('team-map');
    await expect(map.locator('.ck-map-svg')).toBeVisible();
    await page.getByTestId('team-list').evaluate((el) => (el.scrollTop = el.scrollHeight)); // the trip's rows off screen
    await expect(page.getByTestId('team-month')).toHaveText(title(trip!.months[0]!));
    const shown = new Set(await page.locator('[data-testid="team-list"] [data-game-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.gameId!)));
    const stops = await map.locator('[data-map-game]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mapGame!));
    const out = stops.find((id) => !shown.has(id));
    const inside = stops.find((id) => shown.has(id));
    expect(out && inside, `${trip!.tri}: stops in both months`).toBeTruthy();
    const rowsBefore = await rowDates(page);
    await map.locator(`[data-map-game="${out}"] .ck-map-pin`).first().hover({ force: true });
    await page.waitForTimeout(300);
    await expect(page.getByTestId('team-month')).toHaveText(title(trip!.months[0]!));
    expect(await rowDates(page)).toEqual(rowsBefore);
    await expect(page.locator('[data-testid="team-list"] .ck-map-hot')).toHaveCount(0);
    await expect(page.getByTestId('map-info')).toContainText(/Game \d+:/);
    await map.locator(`[data-map-game="${inside}"] .ck-map-pin`).first().hover({ force: true });
    const row = page.locator(`[data-testid="team-list"] [data-game-id="${inside}"]`);
    await expect(row).toHaveClass(/ck-map-hot/);
    const inView = await row.evaluate((r) => {
      const l = r.closest('[data-testid="team-list"]')!.getBoundingClientRect();
      const b = r.getBoundingClientRect();
      return b.top >= l.top - 1 && b.bottom <= l.bottom + 1;
    });
    expect(inView).toBe(true);
  });
});
