// Top bar, team header + picker, team perspective, uniform cells, league week view (fit, navigation, width
// cutoff), back-to-back pairs and the opponent's 2/2 dot, list width cap, TV filter — in a real browser at every
// project width. Clock fixed at Nov 15, 2026 15:00 UTC (team views open on November). Screenshots:
// e2e/screenshots/<project>-f-<view>.png.

import { expect, test, type Page } from './fixtures';
import { scrollAway } from './app';
import { setOption, teamBox } from './nav';
import { eachTeamMonth } from './teamMonths';

const NOW = new Date('2026-11-15T15:00:00Z');
const ORL = 1610612753;

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `e2e/screenshots/${project}-f-${name}.png` });
const weekView = (project: string) => project === 'desktop' || project === 'desktop-xl';
const imagesLoaded = (page: Page) => page.waitForFunction(() => [...document.images].every((i) => i.complete));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/${search}`);
  await expect(page.getByRole('tablist', { name: 'Layout' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

type RawGame = { gameId: string; gameDateEst: string; arenaCity: string; homeTeam: { teamId: number; teamTricode: string }; awayTeam: { teamId: number; teamTricode: string }; broadcasters: { nationalBroadcasters?: unknown[] } };
/** Shown games straight from the served snapshot (independent of the app's code). */
async function feed(page: Page): Promise<RawGame[]> {
  return page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    return (raw.leagueSchedule.gameDates as { games: RawGame[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId));
  });
}
/** Metro of an arena city, written out here independently of src/data/metro.ts (see docs/HISTORY.md). */
const metro = (c: string) => ({ Inglewood: 'Los Angeles', Brooklyn: 'New York' } as Record<string, string>)[c] ?? c;
const dateOf = (g: RawGame) => g.gameDateEst.slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const sunday = (d: string) => addDays(d, -new Date(`${d}T00:00:00Z`).getUTCDay());

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const pageScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);

/** Sizes of the day cells of the grid on show (ignores empty leading/trailing cells). */
const cellSizes = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const cells = [...document.querySelectorAll(sel)].map((c) => c.getBoundingClientRect());
    const w = cells.map((c) => c.width);
    const h = cells.map((c) => c.height);
    return { n: cells.length, wSpread: Math.max(...w) - Math.min(...w), hSpread: Math.max(...h) - Math.min(...h), h: Math.min(...h), w: Math.min(...w) };
  }, sel);

test('the team box: logos, mouse and keyboard, team change; no title row, no chips', async ({ page }, info) => {
  const errors = collectErrors(page);
  const p = info.project.name;
  await open(page, '?view=team&layout=list&team=BOS');
  const header = teamBox(page);
  await expect(header).toContainText('Boston Celtics');
  await expect(page.getByTestId('team-header')).toHaveCount(0);
  await expect(page.getByTestId('team-chip')).toHaveCount(0);
  await expect(page.getByTestId('all-teams')).toHaveText('All teams');
  await imagesLoaded(page);
  // the list: all 30 teams with loaded logos, inside the viewport
  await header.click();
  const list = page.getByTestId('team-picker-list');
  await expect(list.getByRole('option')).toHaveCount(30);
  await expect(list.getByRole('option', { name: 'Boston Celtics' })).toHaveAttribute('aria-selected', 'true');
  await imagesLoaded(page);
  expect(await list.evaluate((l) => [...l.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length)).toBe(30);
  const box = (await list.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await sideways(page)).toBeLessThanOrEqual(0);
  await shot(page, 'team-box', p);
  await list.getByRole('option', { name: 'Miami Heat' }).click();
  await expect(header).toContainText('Miami Heat');
  await expect(page).toHaveURL(/team=MIA/);
  // keyboard only: open with ↓, a letter jumps to the next team starting with it, Enter picks
  await header.focus();
  await page.keyboard.press('ArrowDown');
  await expect(list).toBeVisible();
  await page.keyboard.press('o'); // Miami → Orlando (the next "O" after it)
  await page.keyboard.press('Enter');
  await expect(header).toContainText('Orlando Magic');
  await expect(list).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Magic games' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('team views: selected team first, vs/@ from its side, two loaded logos per game', async ({ page }, info) => {
  const p = info.project.name;
  const games = (await (async () => {
    await open(page, '?view=team&layout=list&team=ORL');
    return feed(page);
  })()).filter((g) => g.homeTeam.teamId === ORL || g.awayTeam.teamId === ORL);
  const want = (g: RawGame) => (g.homeTeam.teamId === ORL ? `ORL vs ${g.awayTeam.teamTricode}` : `ORL @ ${g.homeTeam.teamTricode}`);
  await imagesLoaded(page);
  // Month by month
  const rows = (await eachTeamMonth(page, 'ORL', async () => (await imagesLoaded(page), page.getByTestId('team-list').evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('article')].map((a) => ({
      id: a.dataset.gameId!,
      // without the final scores (checked in lists.spec.ts)
      matchup: [...a.querySelector('.ck-matchup')!.querySelectorAll('.ck-self, .ck-vsat, .ck-opp')].map((e) => e.textContent).join(' '),
      logos: [...a.querySelectorAll('.ck-matchup img')].filter((i) => (i as HTMLImageElement).naturalWidth > 0).length,
      selfX: a.querySelector('.ck-self')!.getBoundingClientRect().left,
      final: !!a.querySelector('.ck-score'),
    })),
  )))).flat();
  expect(rows.map((r) => r.id)).toEqual(games.map((g) => g.gameId));
  expect(rows.map((r) => r.matchup)).toEqual(games.map(want));
  expect(rows.every((r) => r.logos === 2)).toBe(true);
  // ORL in the same place on every row (phone: played rows leave out the time, so within played / upcoming rows)
  for (const part of p === 'phone' ? [rows.filter((r) => r.final), rows.filter((r) => !r.final)] : [rows]) expect(new Set(part.map((r) => Math.round(r.selfX))).size).toBe(1);

  await page.getByRole('tab', { name: 'Calendar' }).click();
  await imagesLoaded(page);
  const cells = await page.locator('.ck-team-grid').evaluate((grid) =>
    [...grid.querySelectorAll<HTMLElement>('.ck-cell-game')].map((c) => ({
      date: c.dataset.date!,
      // without the final scores (the snapshot has finals in November too; checked in scores.spec.ts)
      matchup: [...c.querySelector('.ck-matchup')!.querySelectorAll('.ck-self, .ck-vsat, .ck-opp')].map((e) => e.textContent!.trim()).join(' ') || c.querySelector('.ck-matchup')!.textContent!.replace(/\s+/g, ' ').trim(),
      logos: [...c.querySelectorAll('.ck-matchup img')].filter((i) => (i as HTMLImageElement).naturalWidth > 0).length,
    })),
  );
  const nov = games.filter((g) => dateOf(g).startsWith('2026-11'));
  expect(cells.map((c) => c.date)).toEqual(nov.map(dateOf));
  if (p === 'phone') {
    // no room for both tricodes in a ~40 px cell: the opponent-only cell stays (the header names the team)
    expect(cells.map((c) => c.matchup)).toEqual(nov.map((g) => want(g).slice(4)));
    expect(cells.every((c) => c.logos === 0)).toBe(true);
  } else {
    expect(cells.map((c) => c.matchup)).toEqual(nov.map(want));
    expect(cells.every((c) => c.logos === 2)).toBe(true);
  }
});

test('uniform cells; Team Calendar fills the window without page scroll (5- and 6-week months)', async ({ page }, info) => {
  const p = info.project.name;
  for (const [month, weeks, nexts] of [['November 2026', 5, 0], ['January 2027', 6, 2]] as const) {
    await open(page, '?view=team&layout=calendar&team=ORL');
    for (let i = 0; i < nexts; i++) await page.getByLabel('Next month').click();
    await expect(page.getByTestId('period-title')).toHaveText(month);
    await expect(page.locator('.ck-team-grid')).toHaveAttribute('data-weeks', String(weeks));
    const s = await cellSizes(page, '.ck-team-grid .ck-day-cell');
    console.log(`[${p}] team calendar ${month} (${weeks} weeks): cell ${s.w.toFixed(1)} × ${s.h.toFixed(1)} px, spread ${s.wSpread.toFixed(2)} / ${s.hSpread.toFixed(2)}`);
    expect(s.wSpread).toBeLessThanOrEqual(0.5);
    expect(s.hSpread).toBeLessThanOrEqual(0.5);
    if (p !== 'phone') expect(s.h).toBeGreaterThanOrEqual(92);
    if (p === 'desktop-xl' || p === 'desktop') expect(await pageScroll(page), month).toBeLessThanOrEqual(await scrollAway(page));
    // nothing in a cell is cut off
    expect(await page.evaluate(() => [...document.querySelectorAll('.ck-team-grid .ck-day-cell')].filter((c) => c.scrollHeight > c.clientHeight + 1).length)).toBe(0);
  }
  if (weekView(p)) {
    for (const weeks of [1, 2]) {
      await open(page, `?view=league&layout=calendar&weeks=${weeks}`);
      const s = await cellSizes(page, '.ck-week-view [role="gridcell"]');
      expect(s.n).toBe(7 * weeks);
      expect(s.wSpread).toBeLessThanOrEqual(0.5);
      expect(s.hSpread).toBeLessThanOrEqual(0.5);
    }
  } else {
    await open(page, '?view=league&layout=calendar');
    const s = await cellSizes(page, '.ck-count-grid .ck-count-cell');
    expect(s.wSpread).toBeLessThanOrEqual(0.5);
    expect(s.hSpread).toBeLessThanOrEqual(0.5);
  }
});

test('team calendar: content scaled to the cell, nothing clipped in any cell — every team, every month', async ({ page }, info) => {
  const p = info.project.name;
  test.skip(p !== 'desktop-xl' && p !== 'desktop', 'desktop widths (phone cells keep their size)');
  test.setTimeout(300_000);
  await open(page, '?view=team&layout=calendar&team=ORL');
  const teams = [...new Set((await feed(page)).map((g) => g.homeTeam.teamTricode).filter(Boolean))].sort();
  expect(teams).toHaveLength(30);
  const seen = new Map<number, { cell: string; used: number; room: number }>(); // weeks → fullest cell
  for (const tri of teams) {
    await open(page, `?view=team&layout=calendar&team=${tri}`);
    // first month of the season
    while (await page.getByLabel('Previous month').isEnabled()) await page.getByLabel('Previous month').click();
    for (let guard = 0; guard < 14; guard++) {
      const r = await page.locator('.ck-team-grid').evaluate((g) => {
        const cells = [...g.querySelectorAll<HTMLElement>('.ck-day-cell')];
        const card = g.querySelector('.ck-card');
        const cs = (el: Element) => getComputedStyle(el);
        return {
          month: document.querySelector('[data-testid="period-title"]')!.textContent!,
          weeks: Number((g as HTMLElement).dataset.weeks),
          scale: Number((g as HTMLElement).dataset.scale),
          logo: card?.querySelector('.ck-matchup .ck-logo-backing')?.getBoundingClientRect().width ?? 0,
          cell: `${cells[0]!.getBoundingClientRect().width.toFixed(1)} × ${cells[0]!.getBoundingClientRect().height.toFixed(1)}`,
          clipped: cells.filter((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).map((c) => c.dataset.date),
          // fullest cell: card bottom vs the cell's content box bottom
          fill: cells.map((c) => {
            const k = c.querySelector('.ck-card');
            const b = c.getBoundingClientRect();
            const room = b.bottom - parseFloat(cs(c).paddingBottom) - parseFloat(cs(c).borderBottomWidth);
            return k ? { used: k.getBoundingClientRect().bottom - b.top, room: room - b.top } : { used: 0, room: room - b.top };
          }).sort((a, b) => b.used - a.used)[0]!,
          // no lines between the cells (B2B bars, road-trip bands): the labels on the cells say it
          connectors: g.querySelectorAll('[data-b2b-bar], .ck-b2b-bar, .ck-run-band').length,
          scroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        };
      });
      const name = `${tri} ${r.month}`;
      expect(r.clipped, name).toEqual([]);
      expect(r.scroll, name).toBeLessThanOrEqual(await scrollAway(page));
      expect(r.connectors, name).toBe(0);
      if (p === 'desktop-xl') {
        expect(r.scale, name).toBeGreaterThanOrEqual(0.95); // was 1.2; the opponent's line (CK-29) takes a line of every cell
        if (r.logo) expect(r.logo, name).toBeCloseTo(16 * r.scale, 1);
      } else expect(r.scale, name).toBeGreaterThanOrEqual(0.7); // 1280 × 900: the one-line matchup sets it (0.77–0.79; the floor is TEAM_MONTH_SCALE_MIN)
      const prev = seen.get(r.weeks);
      if (!prev || r.fill.used > prev.used) seen.set(r.weeks, { cell: `${name}: cell ${r.cell} px, scale ${r.scale}`, ...r.fill });
      const next = page.getByLabel('Next month');
      if (await next.isDisabled()) break;
      await next.click();
      await expect(page.getByTestId('period-title')).not.toHaveText(r.month);
    }
  }
  for (const [weeks, s] of seen) console.log(`[${p}] team calendar ${weeks}-week months: fullest cell ${s.cell}, content ${s.used.toFixed(1)} of ${s.room.toFixed(1)} px`);
});

test('league week view: 7 equal columns, counts match the data, toggle, prev/next, month popup, day header → list', async ({ page }, info) => {
  test.skip(!weekView(info.project.name), 'count grid below the width cutoff');
  const errors = collectErrors(page);
  const p = info.project.name;
  await open(page, '?view=league&layout=calendar');
  const games = await feed(page);
  const count = (from: string, days: number) => games.filter((g) => dateOf(g) >= from && dateOf(g) < addDays(from, days)).length;
  const title = page.getByTestId('period-title');
  await expect(title).toHaveText(/^Nov 15 – 21, 2026/);
  const lines = page.locator('.ck-week-view .ck-month-game');
  await expect(lines).toHaveCount(count('2026-11-15', 7));
  const cols = await page.evaluate(() => [...document.querySelectorAll('.ck-week-view [role="gridcell"]')].map((c) => Math.round(c.getBoundingClientRect().left)));
  expect(new Set(cols).size).toBe(7);
  await page.mouse.move(0, 0);
  await shot(page, 'league-calendar-1w', p);

  await page.getByLabel('Next week').click();
  await expect(title).toHaveText(/^Nov 22 – 28, 2026/);
  await expect(lines).toHaveCount(count('2026-11-22', 7));
  await page.getByRole('tab', { name: '2 weeks' }).click();
  await expect(page).toHaveURL(/weeks=2/);
  await expect(title).toHaveText(/^Nov 22 – Dec 5, 2026/);
  await expect(lines).toHaveCount(count('2026-11-22', 14));
  await page.getByLabel('Previous 2 weeks').click();
  await expect(title).toHaveText(/^Nov 8 – 21, 2026/);
  await expect(lines).toHaveCount(count('2026-11-08', 14));
  await page.mouse.move(0, 0);
  await shot(page, 'league-calendar-2w', p);

  // month popup (the calendar icon after ›, as in every view): counts per day, jump to any week
  await page.getByTestId('date-pick').click();
  const popup = page.getByRole('dialog', { name: 'Jump to a week' });
  await expect(popup).toBeVisible();
  await expect(popup.getByLabel(`November 2: ${count('2026-11-02', 1)} games`)).toBeVisible();
  await popup.getByLabel('Next month').click();
  await popup.getByLabel(`December 23: ${count('2026-12-23', 1)} games`).click();
  await expect(popup).toBeHidden();
  await expect(title).toHaveText(/^Dec 20, 2026 – Jan 2, 2027|^Dec 20 – Jan 2/);
  await expect(lines).toHaveCount(count('2026-12-20', 14));
  expect(await sideways(page)).toBeLessThanOrEqual(0);
  // day header → League List at that day
  await page.locator('[data-date="2026-12-23"] [data-testid="day-header"]').click();
  await expect(page.getByRole('region', { name: 'League schedule' })).toBeVisible();
  await expect(page.getByTestId('day-title')).toHaveText(/(December|Dec) 23, 2026/);
  expect(errors).toEqual([]);
});

test('league week view fits without page scroll (1920×1080 and 1280×900): every week of the season, 1 and 2 weeks', async ({ page }, info) => {
  test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop widths');
  const P = info.project.name;
  test.setTimeout(240_000);
  await open(page, '?view=league&layout=calendar');
  const games = await feed(page);
  const first = sunday(dateOf(games[0]!));
  const perWeek = new Map<string, number>();
  for (const g of games) perWeek.set(sunday(dateOf(g)), (perWeek.get(sunday(dateOf(g))) ?? 0) + 1);
  const busiest = [...perWeek].sort((a, b) => b[1] - a[1])[0]!;
  const busiest2 = [...perWeek.keys()].map((w) => [w, perWeek.get(w)! + (perWeek.get(addDays(w, 7)) ?? 0)] as const).sort((a, b) => b[1] - a[1])[0]!;
  console.log(`[${P}] busiest week ${busiest[0]} (${busiest[1]} games), busiest 2 weeks from ${busiest2[0]} (${busiest2[1]} games)`);
  const lineWidths: Record<number, number> = {};
  for (const weeks of [1, 2]) {
    await open(page, `?view=league&layout=calendar&date=${first}&weeks=${weeks}`);
    let worst = { spare: Infinity, start: '', need: 0, cell: 0 };
    let maxScroll = 0;
    const size = await page.evaluate(() => ({ scale: Number(document.querySelector<HTMLElement>('.ck-week-view')!.dataset.scale), line: document.querySelector('.ck-month-game')!.getBoundingClientRect().width, logo: document.querySelector('.ck-month-game .ck-logo-backing')?.getBoundingClientRect().width ?? 0 /* 0: every game of the week is final */, font: getComputedStyle(document.querySelector('.ck-mtri')!).fontSize }));
    console.log(`[${P}] ${weeks} week(s): scale ${size.scale}, line ${size.line} px, logo ${size.logo} px, tricode ${size.font}`);
    lineWidths[weeks] = size.line;
    // the aligned 155 px line: 1 week about 1.25× at 1920 (1.5× with the 119 px line), 1× at 1280
    if (weeks === 1) expect(size.scale).toBeGreaterThanOrEqual(P === 'desktop-xl' ? 1.25 : 1);
    else expect([size.scale, size.line, size.font]).toEqual([1, 155, '11px']);
    for (let guard = 0; guard < 40; guard++) {
      const r = await page.evaluate(() => {
        const cells = [...document.querySelectorAll<HTMLElement>('.ck-week-view [role="gridcell"]')];
        const out = cells.map((c) => {
          const b = c.getBoundingClientRect();
          const items = [...c.querySelectorAll('li, .ck-tlabel')].map((i) => i.getBoundingClientRect());
          const lines = [...c.querySelectorAll('li')].map((i) => i.getBoundingClientRect());
          return {
            need: Math.max(b.top, ...items.map((i) => i.bottom)) - b.top,
            spare: b.bottom - Math.max(b.top, ...items.map((i) => i.bottom)),
            clipped:
              lines.filter((l) => l.left < b.left - 0.5 || l.right > b.right + 0.5 || l.bottom > b.bottom + 0.5).length +
              // a tricode wider than its column would run into the next logo
              [...c.querySelectorAll('.ck-mtri-text')].filter((t) => t.getBoundingClientRect().width > t.parentElement!.getBoundingClientRect().width + 0.5).length,
            h: b.height,
            // aligned columns: logos, tricodes (away left edge, home right edge), scores and "@" at one x
            // down the day (one column of games per day)
            crooked: (['.ck-mline > :nth-child(1)', '.ck-mline > :nth-child(2) .ck-mtri-text', '.ck-at', '.ck-mline > :nth-child(6) .ck-mtri-text', '.ck-mline > :nth-child(7)', '.ck-mline > :nth-child(3)', '.ck-mline > :nth-child(5)'] as const).filter((sel, k) => {
              const xs = [...c.querySelectorAll(sel)].map((e) => (k === 3 ? e.getBoundingClientRect().right : e.getBoundingClientRect().left).toFixed(1));
              return new Set(xs).size > 1;
            }),
          };
        });
        return { start: cells[0]!.dataset.date!, scroll: document.documentElement.scrollHeight - document.documentElement.clientHeight, games: document.querySelectorAll('.ck-week-view li').length, cells: out };
      });
      // no page scroll anywhere (2 weeks at 1280 × 900 used to scroll by up to 164 px; e2e/two-week-fit.spec.ts)
      maxScroll = Math.max(maxScroll, r.scroll);
      expect(r.scroll, `${weeks}w ${r.start}`).toBeLessThanOrEqual(await scrollAway(page));
      // the crooked check must see every line's parts (it silently checked nothing once the line got its link wrapper)
      expect(await page.locator('.ck-mline > :nth-child(1)').count()).toBe(r.games);
      expect(r.cells.reduce((n, c) => n + c.clipped, 0), `${weeks}w ${r.start}`).toBe(0);
      expect(r.cells.flatMap((c) => c.crooked), `${weeks}w ${r.start}: columns not straight`).toEqual([]);
      expect(r.games).toBe([...Array(7 * weeks)].reduce((n, _, i) => n + games.filter((g) => dateOf(g) === addDays(r.start, i)).length, 0));
      for (const c of r.cells) if (c.spare < worst.spare) worst = { spare: c.spare, start: r.start, need: c.need, cell: c.h };
      const next = page.getByLabel(weeks === 1 ? 'Next week' : 'Next 2 weeks');
      if (await next.isDisabled()) break;
      await next.click();
      await expect(page.locator('.ck-week-view [role="gridcell"]').first()).not.toHaveAttribute('data-date', r.start);
    }
    console.log(`[${P}] ${weeks} week(s): tallest day content ${worst.need.toFixed(1)} px in a ${worst.cell.toFixed(1)} px cell (week of ${worst.start}), ${worst.spare.toFixed(1)} px to spare, most page scroll ${maxScroll} px`);
    expect(worst.spare).toBeGreaterThanOrEqual(0);
  }
  // 1-week lines larger than 2-week at 1920; the same at 1280 (1 week: 164.9 px cells, the 155 px line at 1×)
  if (P === 'desktop-xl') expect(lineWidths[1]).toBeGreaterThan(lineWidths[2]!);
  else expect(lineWidths[1]).toBe(lineWidths[2]);
});

test('week view width cutoff: full-size lines at the cutoff, count grid one pixel below', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one width sweep is enough');
  await page.setViewportSize({ width: 1300, height: 900 });
  await open(page, '?view=league&layout=calendar&date=2026-11-02');
  // window width − widget width = page padding + scrollbar gutter (innerWidth − clientWidth reads 0 here even
  // though scrollbar-gutter: stable reserves the gutter, so it is measured from the widget)
  const sb = 1300 - 32 - (await page.locator('.ck-root').evaluate((e) => e.getBoundingClientRect().width));
  const cutoff = 1179 + 32 + sb; // widget width 1179 (WEEK_MIN_WIDTH, 155 px line) + page padding + scrollbar gutter
  await page.setViewportSize({ width: cutoff, height: 900 });
  await open(page, '?view=league&layout=calendar&date=2026-11-02');
  await expect(page.getByRole('region', { name: 'League week' })).toBeVisible();
  const r = await page.evaluate(() => {
    const lines = [...document.querySelectorAll('.ck-month-game')];
    return {
      content: document.querySelector('.ck-root')!.getBoundingClientRect().width,
      line: lines[0]!.getBoundingClientRect().width,
      clipped: lines.filter((l) => {
        const c = l.closest('.ck-cell')!;
        const cs = getComputedStyle(c);
        const b = c.getBoundingClientRect();
        return l.getBoundingClientRect().right > b.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) + 0.5;
      }).length,
      font: getComputedStyle(document.querySelector('.ck-mtri')!).fontSize,
    };
  });
  console.log(`[desktop] week view cutoff: window ${cutoff} px (scrollbar ${sb} px) → content ${r.content} px, line ${r.line} px, clipped ${r.clipped}`);
  expect(r.content).toBe(1179);
  expect(r.line).toBe(155);
  expect(r.font).toBe('11px');
  expect(r.clipped).toBe(0);
  await page.setViewportSize({ width: cutoff - 1, height: 900 });
  await expect(page.getByRole('region', { name: 'Month navigator' })).toBeVisible();
  expect(await sideways(page)).toBeLessThanOrEqual(0);
});

test('back-to-back pairs: labels on both cells and no line between them, plane, tooltips, list bracket', async ({ page }, info) => {
  const errors = collectErrors(page);
  const p = info.project.name;
  await open(page, '?view=team&layout=calendar&team=ORL');
  const all = await feed(page);
  const orl = all.filter((g) => g.homeTeam.teamId === ORL || g.awayTeam.teamId === ORL);
  const pairs = orl.slice(1).flatMap((b, i) => {
    const a = orl[i]!;
    if (addDays(dateOf(a), 1) !== dateOf(b)) return [];
    const ha = (g: RawGame) => (g.homeTeam.teamId === ORL ? 'H' : 'A');
    return [{ a, b, code: ha(a) + ha(b), travels: !!a.arenaCity && !!b.arenaCity && metro(a.arenaCity) !== metro(b.arenaCity) }];
  });
  const nov = pairs.filter((x) => dateOf(x.a).startsWith('2026-11') && dateOf(x.b).startsWith('2026-11'));
  expect(nov.length).toBeGreaterThanOrEqual(3);
  const isBreak = (x: (typeof nov)[number]) => new Date(`${dateOf(x.a)}T00:00:00Z`).getUTCDay() === 6;
  expect(nov.some(isBreak)).toBe(true);
  expect(nov.some((x) => x.travels)).toBe(true);
  expect(nov.some((x) => !x.travels)).toBe(true);
  await imagesLoaded(page);
  await page.mouse.move(0, 0);
  await shot(page, 'team-calendar', p);

  for (const x of nov) {
    const r = await page.evaluate(({ a, b }) => {
      const box = (e: Element) => e.getBoundingClientRect();
      const ca = document.querySelector(`[data-date="${a}"]`)!;
      const cb = document.querySelector(`[data-date="${b}"]`)!;
      const bars = [...document.querySelectorAll<HTMLElement>(`[data-pair="${a}/${b}"]`)];
      const label = (c: Element) => {
        const l = c.querySelector('.ck-b2b-label')!;
        const cs = getComputedStyle(l);
        return { text: l.textContent, plane: !!l.querySelector('[data-testid="plane"]'), bg: cs.backgroundColor, border: cs.borderTopColor, tip: l.getAttribute('data-tip'), inside: box(l).right <= box(c).right + 0.5 };
      };
      return {
        a: { ...box(ca).toJSON() },
        b: { ...box(cb).toJSON() },
        bars: [...bars, ...document.querySelectorAll('.ck-b2b-bar')].map((el) => el.className),
        la: label(ca),
        lb: label(cb),
      };
    }, { a: dateOf(x.a), b: dateOf(x.b) });
    const name = `${dateOf(x.a)}→${dateOf(x.b)}`;
    // labels: 1/2 outlined (no fill), 2/2 solid (yellow fill), same code; short on phones
    expect(r.la.text, name).toBe(p === 'phone' ? '1/2' : `1/2 · ${x.code}`);
    expect(r.lb.text, name).toBe(p === 'phone' ? '2/2' : `2/2 · ${x.code}`);
    expect(r.la.bg).toBe('rgba(0, 0, 0, 0)');
    expect(r.lb.bg).toBe(r.la.border);
    expect(r.la.plane && r.lb.plane, name).toBe(x.travels);
    expect(r.la.inside && r.lb.inside, name).toBe(true);
    expect(r.la.tip).toBe(r.lb.tip);
    // no line between the two cells (side by side or across a week break): the labels say it
    expect(r.bars, name).toEqual([]);
  }

  // tooltip on hover and on keyboard focus, exact text, inside the viewport
  const travel = nov.find((x) => x.travels)!;
  const side = (g: RawGame) => (g.homeTeam.teamId === ORL ? `vs ${g.awayTeam.teamTricode} (home)` : `@ ${g.homeTeam.teamTricode} (away)`);
  const tip = `Back-to-back: ${side(travel.a)} → ${side(travel.b)} · travels ${travel.a.arenaCity} → ${travel.b.arenaCity}`;
  const label = page.locator(`[data-date="${dateOf(travel.b)}"] .ck-b2b-label`);
  await label.hover();
  const tooltip = page.getByTestId('tooltip');
  await expect(tooltip).toHaveText(tip);
  const tb = (await tooltip.boundingBox())!;
  expect(tb.x).toBeGreaterThanOrEqual(0);
  expect(tb.x + tb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  await label.focus();
  await expect(tooltip).toHaveText(tip);
  const same = nov.find((x) => !x.travels)!;
  await page.locator(`[data-date="${dateOf(same.a)}"] .ck-b2b-label`).focus();
  await expect(tooltip).toHaveText(`Back-to-back: ${side(same.a)} → ${side(same.b)}`);

  // opponent on its 2/2: the mark on the opponent's own line (CK-29; it was a yellow dot on its tricode), tooltip
  const dot = page.locator('.ck-team-grid [data-testid="opp-b2b"][data-night="2"]').first();
  await expect(dot).toBeVisible();
  await expect(dot).toHaveText(/^2\/2/);
  await dot.scrollIntoViewIfNeeded(); // the tooltip closes on scroll: scroll first, then hover
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await dot.hover();
  await expect(tooltip).toHaveText(/^[A-Z]{3}: Back-to-back: (vs|@) [A-Z]{3} \((home|away)\) → (vs|@) [A-Z]{3} \((home|away)\)/);

  // team list: bracket on the left edge of both rows, joined across the gap; same labels and plane
  await page.getByRole('tab', { name: 'List' }).click();
  await page.getByTestId('team-list').evaluate((el) => (el.scrollTop = 0));
  await imagesLoaded(page);
  for (const x of nov) {
    const r = await page.getByTestId('team-list').evaluate((el, ids) => {
      const row = (id: string) => el.querySelector(`[data-game-id="${id}"]`)!;
      const br = (id: string) => {
        const cs = getComputedStyle(row(id), '::before');
        const b = row(id).getBoundingClientRect();
        return { color: cs.borderLeftColor, left: cs.borderLeftWidth, top: parseFloat(cs.top), bottom: parseFloat(cs.bottom), h: b.height, ...(() => {
          // desktop: the Fatigue component; tablet/phone: the "1/2 · HA" label as before
          const fx = row(id).querySelector('[data-testid="fatigue-team"] .ck-fx');
          const label = row(id).querySelector('.ck-b2b-label')?.textContent ?? '';
          return fx ? { code: fx.getAttribute('data-code'), night: fx.getAttribute('data-night'), plane: null } : { code: label.slice(6), night: label.slice(0, 1), plane: !!row(id).querySelector('.ck-b2b-label [data-testid="plane"]') };
        })() };
      };
      const gap = row(ids[1]!).getBoundingClientRect().top - row(ids[0]!).getBoundingClientRect().bottom;
      return { a: br(ids[0]!), b: br(ids[1]!), gap };
    }, [x.a.gameId, x.b.gameId]);
    const name = `list ${dateOf(x.a)}`;
    expect(r.a.left, name).toBe('2px');
    expect(r.a.color).toBe('rgb(245, 224, 66)'); // --ck-b2b yellow
    // The Fatigue component in the team column (travel is in its tooltip; the plane there means "away")
    expect([r.a.code, r.a.night, r.b.code, r.b.night]).toEqual([x.code, '1', x.code, '2']);
    if (r.a.plane !== null) expect(r.a.plane && r.b.plane).toBe(x.travels);
    // night 1's bracket runs from its middle down past its edge, night 2's from above its edge to its middle: they meet in the gap
    expect(-r.a.bottom + -r.b.top).toBeGreaterThanOrEqual(r.gap - 0.5);
  }
  await page.mouse.move(0, 0);
  await shot(page, 'team-list', p);
  expect(errors).toEqual([]);
});

test('lists capped at ~960 px (Team List 1110 px) and centered — the desktop League List left-aligned at 910 × zoom (round 8); calendars full width', async ({ page }, info) => {
  const p = info.project.name;
  for (const [search, sel] of [['?view=league&layout=list', '.ck-league-list'], ['?view=team&layout=list&team=ORL', '.ck-team-list']] as const) {
    await open(page, search);
    const r = await page.evaluate((sel) => {
      const root = document.querySelector('.ck-root')!.getBoundingClientRect();
      const list = document.querySelector(sel)!.getBoundingClientRect();
      const inner = [...document.querySelectorAll(`${sel} .ck-week, ${sel} .ck-lday-head, ${sel} .ck-card, .ck-team-header`)].map((e) => e.getBoundingClientRect());
      return { root: root.width, w: list.width, leftGap: list.left - root.left, rightGap: root.right - list.right, outside: inner.filter((b) => b.width && (b.left < list.left - 0.5 || b.right > list.right + 0.5)).length };
    }, sel);
    console.log(`[${p}] ${sel}: ${r.w.toFixed(0)} px of ${r.root.toFixed(0)} px`);
    // The desktop League List is left-aligned, LEAGUE_LIST_COLUMN (910) × its zoom (1.3 at 1920, 1 at 1280), the map
    // on its right; tablets and phones keep the centered 960 px column
    // the Team List is left-aligned too where its map fits (desktop-xl), at its 1110 px
    const side = (sel === '.ck-league-list' && (p === 'desktop' || p === 'desktop-xl')) || (sel === '.ck-team-list' && p === 'desktop-xl');
    const cap = side && sel === '.ck-league-list' ? Math.round(910 * (p === 'desktop-xl' ? 1.3 : 1)) : sel === '.ck-team-list' && r.root >= 1110 ? 1110 : 960; // the Team List is 1110 px where its fatigue columns show
    expect(r.w).toBeLessThanOrEqual(cap + 0.5);
    if (r.root > cap) expect(r.w).toBeCloseTo(cap, 0);
    if (side) expect(r.leftGap).toBeLessThanOrEqual(0.5);
    else expect(Math.abs(r.leftGap - r.rightGap)).toBeLessThanOrEqual(1);
    expect(r.outside).toBe(0);
    if (p === 'desktop-xl') await shot(page, sel === '.ck-league-list' ? 'league-list' : 'team-list-top', p);
  }
  if (p === 'desktop-xl') {
    await open(page, '?view=league&layout=calendar');
    expect(await page.locator('.ck-week-view').evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(1800);
    await open(page, '?view=team&layout=calendar&team=ORL');
    expect(await page.locator('.ck-team-grid').evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(1800);
  }
});

test('TV games only: per day never more games than without the filter, and every game shown has a national broadcaster', async ({ page }, info) => {
  const p = info.project.name;
  // The list shows one day — Nov 16, which has a national TV game (Nov 15 has none)
  await open(page, weekView(p) ? '?view=league&layout=calendar&date=2026-11-15&weeks=2' : '?view=league&layout=list&date=2026-11-16');
  const games = await feed(page);
  const national = new Set(games.filter((g) => (g.broadcasters.nationalBroadcasters ?? []).length > 0).map((g) => g.gameId));
  const perDay = () =>
    page.evaluate(() => {
      const out: Record<string, string[]> = {};
      for (const d of document.querySelectorAll<HTMLElement>('.ck-week-view [data-date], [data-testid="league-list"] [data-day]')) out[d.dataset.date ?? d.dataset.day!] = [...d.querySelectorAll('[data-game-id]')].map((g) => g.getAttribute('data-game-id')!);
      return out;
    });
  const before = await perDay();
  expect(Object.keys(before).length).toBe(weekView(p) ? 14 : 1);
  await setOption(page, 'TV games only', true);
  await expect(page).toHaveURL(/tv=1/);
  const after = await perDay();
  let shown = 0;
  for (const [day, ids] of Object.entries(after)) {
    if (!(day in before)) continue;
    expect(ids.length, day).toBeLessThanOrEqual(before[day]!.length);
    for (const id of ids) expect(national.has(id), `${day} ${id}`).toBe(true);
    shown += ids.length;
  }
  expect(shown).toBeGreaterThan(0);
});
