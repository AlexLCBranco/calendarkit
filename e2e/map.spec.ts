// The League List's map in a real browser at 1280 × 900 (desktop) and 1920 × 1080 (desktop-xl):
// beside the list and never over it, one dot per game where the feed says it's played, yellow for back-to-backs, edge
// markers for places off the map, out of every copy, not in the Slate or on tablets/phones.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
const YELLOW = 'rgb(245, 224, 66)';
const desktop = (p: string) => p === 'desktop' || p === 'desktop-xl';

async function open(page: Page, date: string, extra = '') {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/?view=league&layout=list&date=${date}${extra}`);
  await page.waitForFunction(() => !!document.querySelector('[data-testid="league-list"] [data-game-id]'));
}
const map = (page: Page) => page.getByTestId('league-map');

type FeedGame = { gameId: string; gameDateEst: string; arenaName: string; arenaCity: string; arenaState: string; homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } };
const feedDay = (page: Page, date: string) =>
  page.evaluate(async (date) => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    return (raw.leagueSchedule.gameDates as { games: FeedGame[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId) && g.gameDateEst.startsWith(date));
  }, date);

test.beforeEach(({}, info) => test.skip(!desktop(info.project.name) && !info.title.startsWith('no map on'), 'desktop widths'));

test('placement: right of the list, inside the window, never over list content; stays put while a busy night scrolls', async ({ page }, info) => {
  await open(page, '2026-11-02');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  const r = await page.evaluate(() => {
    const box = (e: Element) => e.getBoundingClientRect();
    const m = box(document.querySelector('[data-testid="league-map"]')!);
    const list = box(document.querySelector('.ck-league-list')!);
    const root = box(document.querySelector('.ck-root')!);
    const bar = box(document.querySelector('[data-testid="top-bar"]')!);
    const hits = [...document.querySelectorAll('.ck-league-list *')].filter((e) => {
      const b = box(e);
      return b.width > 0 && b.right > m.left && b.left < m.right && b.bottom > m.top && b.top < m.bottom;
    }).length;
    return { m: [m.left, m.top, m.right, m.bottom] as [number, number, number, number], list: [list.left, list.right] as [number, number], root: [root.left, root.right] as [number, number], bar: bar.bottom, hits, vw: innerWidth };
  });
  console.log(`[map] ${info.project.name}: map ${Math.round(r.m[2] - r.m[0])} × ${Math.round(r.m[3] - r.m[1])} px at x ${Math.round(r.m[0])}`);
  expect(r.m[0]).toBeGreaterThanOrEqual(r.list[1] + 20);
  expect(r.m[2]).toBeLessThanOrEqual(r.root[1] + 0.5);
  expect(r.m[1]).toBeGreaterThanOrEqual(r.bar);
  expect(r.hits).toBe(0);
  expect(r.m[2] - r.m[0]).toBeGreaterThan(info.project.name === 'desktop-xl' ? 600 : 280);
  // a short window: the day overflows and scrolls; the map doesn't move
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 640 });
  const before = await map(page).boundingBox();
  const list = page.getByTestId('league-list');
  await list.hover();
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 400);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  expect(await map(page).boundingBox()).toEqual(before);
});

test('one dot per game, at the feed\'s arena (inside its state), labeled AWAY @ HOME (+ city) where it fits; yellow = a back-to-back', async ({ page }) => {
  for (const date of ['2026-11-02', '2026-11-15', '2027-01-07']) {
    await open(page, date);
    await expect(map(page).locator('.ck-map-svg')).toBeVisible();
    const feed = await feedDay(page, date);
    const dots = await map(page).locator('[data-map-game]').evaluateAll((els) =>
      els.map((e) => {
        const pin = e.querySelector('.ck-map-pin')!.getBoundingClientRect();
        const style = (e as HTMLElement).style;
        // the place before any spreading (close pairs move ≤ 7 px): left/top of the dot
        const box = e.parentElement!.getBoundingClientRect();
        const x = box.left + (parseFloat(style.left) / 100) * box.width;
        const y = box.top + (parseFloat(style.top) / 100) * box.height;
        // the states under the place and within 3 px of it (an arena near a state line, at this scale)
        const states = new Set<string>();
        for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]] as const)
          for (const el of document.elementsFromPoint(x + dx, y + dy)) if (el instanceof SVGPathElement && (el.dataset.state || el.dataset.country)) states.add(el.dataset.state ?? el.dataset.country!);
        return { id: (e as HTMLElement).dataset.mapGame!, kind: (e as HTMLElement).dataset.kind, label: e.querySelector('.ck-map-label')?.textContent ?? '', color: getComputedStyle(e.querySelector('.ck-map-pin')!).backgroundColor, states: [...states], pin: pin.width };
      }),
    );
    const listIds = await page.getByTestId('league-list').locator('[data-game-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.gameId));
    expect(dots.map((d) => d.id).sort(), date).toEqual(listIds.sort());
    expect(dots.map((d) => d.id).sort(), date).toEqual(feed.map((g) => g.gameId).sort());
    for (const d of dots) {
      const g = feed.find((x) => x.gameId === d.id)!;
      expect(d.kind, d.id).toBe('map');
      // the label's longest variant that fits: AWAY @ HOME + city, AWAY @ HOME, HOME (or none on a crowded spot)
      const m = `${g.awayTeam.teamTricode} @ ${g.homeTeam.teamTricode}`;
      if (d.label) expect([`${m}${g.arenaCity}`, m, g.homeTeam.teamTricode], d.id).toContain(d.label);
      // a US state's outline, or Canada (Toronto, ON: the provinces aren't drawn)
      expect(d.states, `${d.id} at ${g.arenaName}, ${g.arenaCity}, ${g.arenaState}`).toContain(g.arenaState === 'ON' ? 'CA' : g.arenaState);
      // yellow iff the row shows a B2B badge for either team
      const b2b = await page.locator(`[data-testid="league-list"] .ck-card[data-game-id="${d.id}"] .ck-fx-b2b:not(:empty)`).count();
      expect(d.color, `${d.id} b2b ${b2b}`).toBe(b2b > 0 ? YELLOW : 'rgb(207, 214, 226)');
    }
    expect(dots.some((d) => d.color === YELLOW), `${date}: some back-to-back`).toBe(true);
  }
});

test('places off the map: an edge marker with the place and its direction; no arena yet: "location unknown"', async ({ page }) => {
  for (const [date, home, text] of [['2026-11-07', 'IND', 'Mexico City ↓'], ['2027-01-14', 'SAS', 'Paris →'], ['2027-01-17', 'NOP', 'Manchester →']] as const) {
    await open(page, date);
    const feed = await feedDay(page, date);
    const g = feed.find((x) => x.homeTeam.teamTricode === home && x.arenaCity !== '')!;
    const dot = map(page).locator(`[data-map-game="${g.gameId}"]`);
    await expect(dot).toHaveAttribute('data-kind', 'edge');
    const label = dot.locator('.ck-map-label');
    if (await label.count()) await expect(label).toContainText((await label.getAttribute('data-variant')) === '0' ? text : home);
    expect(await dot.getAttribute('title')).toMatch(/(Mexico City, Mexico|Paris, France|Manchester, England) \(off this map\)$/);
    // the marker and its label inside the map box
    const [m, l] = [await map(page).locator('.ck-map-box').boundingBox(), await dot.locator((await label.count()) ? '.ck-map-label' : '.ck-map-pin').boundingBox()];
    expect(l!.x).toBeGreaterThanOrEqual(m!.x - 0.5);
    expect(l!.x + l!.width).toBeLessThanOrEqual(m!.x + m!.width + 0.5);
    expect(l!.y + l!.height).toBeLessThanOrEqual(m!.y + m!.height + 0.5);
  }
  // Cup knockout games the feed hasn't placed yet (no arena; Dec 4–8 in an early-season snapshot): listed as unknown,
  // never guessed. The day comes from the served snapshot; once the NBA places them, the unit test (fixture) still covers it.
  const day = await page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    return (raw.leagueSchedule.gameDates as { games: FeedGame[] }[]).flatMap((d) => d.games).find((g) => /^00[2456]/.test(g.gameId) && !g.arenaName)?.gameDateEst.slice(0, 10);
  });
  test.skip(!day, 'every game in the served snapshot has an arena');
  await open(page, day!);
  const tbd = (await feedDay(page, day!)).filter((g) => !g.arenaName);
  expect(tbd.length).toBeGreaterThan(0);
  for (const g of tbd) await expect(map(page).locator(`[data-map-game="${g.gameId}"]`)).toHaveAttribute('data-kind', 'unknown');
  await expect(page.getByTestId('map-unknown')).toContainText('location unknown');
});

test('every game in the served season resolves to a place on the map, an edge marker, or "unknown" only without an arena', async ({ page }) => {
  await open(page, '2026-11-02');
  const feed = await page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    return (raw.leagueSchedule.gameDates as { games: FeedGame[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId)).map((g) => [g.arenaName, g.arenaCity] as const);
  });
  const { ARENAS } = await import('../src/map/arenas');
  const known = new Set(ARENAS.map((a) => `${a.arena}|${a.city}`.toLowerCase()));
  const missing = [...new Set(feed.filter(([n]) => n).map(([n, c]) => `${n}|${c}`))].filter((k) => !known.has(k.toLowerCase()));
  expect(missing, 'arenas in the feed with no entry in src/map/arenas.ts').toEqual([]);
  console.log(`[map] ${feed.length} games, ${feed.filter(([n]) => !n).length} without an arena in the feed`);
});

test('the map is in no copy: the view copy and a day are the list only', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, '2026-11-02');
  await expect(map(page)).toHaveAttribute('data-capture-exclude', 'true');
  const listW = await page.locator('.ck-league-list').evaluate((e) => e.getBoundingClientRect().width);
  const button = page.getByTestId('copy-view');
  await button.click();
  await expect(button).toHaveAttribute('data-captured', /^\d+x\d+@/);
  const w = Number((await button.getAttribute('data-captured'))!.split('x')[0]);
  // the list's width + the stage's padding on both sides, nowhere near list + map
  expect(w).toBeGreaterThanOrEqual(listW);
  expect(w).toBeLessThan(listW + 100);
});

test('no map in the Slate', async ({ page }) => {
  await open(page, '2026-11-02', '&layout=slate');
  await page.goto('/calendar/?view=league&layout=slate');
  await expect(page.getByTestId('slate')).toBeVisible();
  await expect(map(page)).toHaveCount(0);
});

test('no map on tablets and phones (the list keeps the width)', async ({ page }, info) => {
  test.skip(desktop(info.project.name), 'narrow widths');
  await open(page, '2026-11-02');
  await page.waitForTimeout(300);
  await expect(map(page)).toHaveCount(0);
});

// ——— The travel view: hover, pin, zoom, panel ———

type Leg = { tri: string; kind: 'prev' | 'next'; from: string; to: string };
/** Each game of `date` with both teams' previous / next game arenas, from the served snapshot (independent of the app). */
const feedLegs = (page: Page, date: string) =>
  page.evaluate(async (date) => {
    type G = FeedGame & { gameDateTimeUTC: string };
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const games = (raw.leagueSchedule.gameDates as { games: G[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId)).sort((a, b) => a.gameDateTimeUTC.localeCompare(b.gameDateTimeUTC));
    return games
      .filter((g) => g.gameDateEst.startsWith(date))
      .map((g) => ({
        id: g.gameId,
        arena: g.arenaName,
        legs: [g.awayTeam.teamTricode, g.homeTeam.teamTricode].flatMap((tri) => {
          const mine = games.filter((x) => x.awayTeam.teamTricode === tri || x.homeTeam.teamTricode === tri);
          const i = mine.findIndex((x) => x.gameId === g.gameId);
          const [p, n] = [mine[i - 1], mine[i + 1]];
          return [...(p ? [{ tri, kind: 'prev' as const, from: p.arenaName, to: g.arenaName }] : []), ...(n ? [{ tri, kind: 'next' as const, from: g.arenaName, to: n.arenaName }] : [])];
        }),
      }));
  }, date);

const row = (page: Page, id: string) => page.locator(`[data-testid="league-list"] .ck-card[data-game-id="${id}"]`);
/** A point on the map box with no dot under it (bottom left corner: the Pacific off Mexico). */
const emptyMap = async (page: Page) => {
  const b = (await map(page).locator('.ck-map-box').boundingBox())!;
  return { x: b.x + 6, y: b.y + b.height - 6 };
};
const unfocused = (page: Page) => expect(map(page)).not.toHaveAttribute('data-focus', /./);

test('hover a row: the game focused — exactly its teams\' legs (solid since the last game, dashed to the next), miles on each, both teams in the panel', async ({ page }) => {
  for (const date of ['2026-11-02', '2026-11-07']) {
    await open(page, date);
    await expect(map(page).locator('.ck-map-svg')).toBeVisible();
    for (const g of await feedLegs(page, date)) {
      await row(page, g.id).locator('.ck-time').hover();
      await expect(map(page)).toHaveAttribute('data-focus', g.id);
      await expect(map(page).locator('.ck-map-dot.ck-map-hot')).toHaveAttribute('data-map-game', g.id);
      // a line per leg between two arenas; the same arena: no line, "stayed / stays · 0 mi" by the dot
      const want = (g.legs as Leg[]).filter((l) => l.from !== l.to).map((l) => `${l.tri}:${l.kind} ${l.from} -> ${l.to}`).sort();
      const got = (await map(page).locator('path[data-leg]').evaluateAll((els) => els.map((e) => `${(e as SVGElement).dataset.leg} ${(e as SVGElement).dataset.from} -> ${(e as SVGElement).dataset.to}`))).sort();
      expect(got, `${date} ${g.id}`).toEqual(want);
      for (const l of (g.legs as Leg[]).filter((x) => x.from === x.to)) await expect(map(page).locator('.ck-tv-this .ck-map-label').first()).toContainText(`${l.tri} ${l.kind === 'prev' ? 'stayed' : 'stays'} · 0 mi`);
      // every line has its miles printed on it; past solid, next dashed
      for (const l of want) {
        const key = l.split(' ')[0]!;
        await expect(map(page).locator(`[data-dist="${key}"]`)).toHaveText(/^[\d,]+ mi$/);
        const dash = await map(page).locator(`path[data-leg="${key}"]`).evaluate((e) => getComputedStyle(e).strokeDasharray);
        expect(dash === 'none', key).toBe(key.endsWith(':prev'));
      }
      const panel = page.getByTestId('map-panel');
      await expect(panel).toContainText(g.arena);
      await expect(panel.locator('[data-team]')).toHaveCount(2);
    }
    // nothing hovered: nothing focused, no lines, no row lit
    await page.mouse.move(2, 2);
    await unfocused(page);
    await expect(map(page).locator('path[data-leg]')).toHaveCount(0);
    await expect(page.locator('.ck-card.ck-map-hot')).toHaveCount(0);
  }
});

test('the panel: last / this / next per team in its colour; rest = the row\'s rest chip (B2B badge for 1 day); season opener; time-zone change', async ({ page }) => {
  // BOS @ HOU, Nov 2 (real): BOS came from @ ORL the night before
  await open(page, '2026-11-02');
  const g = (await feedLegs(page, '2026-11-02')).find((x) => (x.legs as Leg[]).some((l) => l.tri === 'BOS'))!;
  await row(page, g.id).locator('.ck-time').hover();
  const bos = page.getByTestId('map-panel').locator('[data-team="BOS"]');
  const last = bos.locator('[data-leg="prev"]');
  await expect(last).toContainText('last @ ORL');
  await expect(last).toContainText('Orlando →');
  await expect(last).toHaveAttribute('data-rest', '1');
  await expect(last.locator('.ck-tv-b2b')).toHaveText('B2B');
  await expect(last).toHaveAttribute('data-tz', '−1h');
  await expect(last).toContainText(/Sun 01\/11 \d\d:\d\d/);
  await expect(bos.locator('[data-leg="this"]')).toContainText('this @ HOU · Mon 02/11');
  // the team's colour: its lines and its text in the panel
  const [line, text] = [await map(page).locator('path[data-leg="BOS:prev"]').evaluate((e) => getComputedStyle(e).stroke), await bos.evaluate((e) => getComputedStyle(e).color)];
  expect(line).toBe(text);
  expect(line).toBe('rgb(255, 122, 184)'); // away: pink
  // rest days = the rest chip in the row, for every game of a day and both teams
  await open(page, '2026-11-15');
  let compared = 0;
  for (const id of await page.getByTestId('league-list').locator('.ck-card[data-game-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.gameId!))) {
    await row(page, id).locator('.ck-time').hover();
    await expect(map(page)).toHaveAttribute('data-focus', id);
    const chips = await row(page, id).locator('[data-testid="fatigue"]').evaluateAll((els) => els.map((e) => ({ b2b: e.querySelector('.ck-fx-b2b')?.getAttribute('data-leg') ?? null, rest: e.querySelector('[data-break="after"]')?.getAttribute('data-days') ?? null })));
    const panel = await page.getByTestId('map-panel').locator('[data-team]').evaluateAll((els) => els.map((e) => e.querySelector('[data-leg="prev"]')!.getAttribute('data-rest')));
    expect(chips).toHaveLength(2);
    // rows: the away team's component first; the panel: away first
    chips.forEach((c, i) => {
      if (c.rest) expect(panel[i], `${id} team ${i}`).toBe(c.rest);
      if (c.b2b === '2') expect(panel[i], `${id} team ${i}`).toBe('1');
      if (panel[i] === '1') expect(c.b2b, `${id} team ${i}`).toBe('2');
      compared++;
    });
  }
  expect(compared).toBeGreaterThan(10);
  // the season opener: "last none (season opener)"
  await open(page, '2026-10-20');
  await page.getByTestId('league-list').locator('.ck-card[data-game-id] .ck-time').first().hover();
  await expect(page.getByTestId('map-panel').locator('[data-leg="prev"]').first()).toHaveText('last none (season opener)');
});

test('click pins: stays while the pointer moves onto the map; another row shows for a moment; unpin by clicking again, Esc, empty map, another day', async ({ page }) => {
  await open(page, '2026-11-02');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  const ids = await page.getByTestId('league-list').locator('.ck-card[data-game-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.gameId!));
  const [a, b] = [ids[0]!, ids[3]!];
  const pinA = async () => {
    await row(page, a).locator('.ck-time').click();
    await expect(map(page)).toHaveAttribute('data-pinned', '');
    await expect(map(page)).toHaveAttribute('data-focus', a);
  };
  await pinA();
  // visible: the row (sky ring) and the dot (ring), "pinned" in the panel
  expect(await row(page, a).evaluate((e) => getComputedStyle(e).boxShadow)).toContain('94, 200, 255');
  await expect(map(page).locator(`.ck-map-dot[data-map-game="${a}"]`)).toHaveClass(/ck-map-pinned/);
  await expect(page.getByTestId('map-pinned')).toBeVisible();
  // onto the empty map: still a
  const e = await emptyMap(page);
  await page.mouse.move(e.x, e.y, { steps: 5 });
  await page.waitForTimeout(300);
  await expect(map(page)).toHaveAttribute('data-focus', a);
  // another row: shown while hovered, back to a after
  await row(page, b).locator('.ck-time').hover();
  await expect(map(page)).toHaveAttribute('data-focus', b);
  await expect(map(page)).not.toHaveAttribute('data-pinned', /.*/);
  await page.mouse.move(e.x, e.y, { steps: 5 });
  await expect(map(page)).toHaveAttribute('data-focus', a);
  // click again: unpinned
  await row(page, a).locator('.ck-time').click();
  await page.mouse.move(2, 2);
  await unfocused(page);
  await expect(page.getByTestId('map-pinned')).toHaveCount(0);
  // Esc
  await pinA();
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  await unfocused(page);
  // a click on the empty map
  await pinA();
  await page.mouse.click(e.x, e.y);
  await page.mouse.move(2, 2);
  await unfocused(page);
  // a marquee drag over the rows pins nothing
  const r = (await page.getByTestId('league-list').locator('.ck-card').first().boundingBox())!;
  await page.mouse.move(r.x + 30, r.y + 5);
  await page.mouse.down();
  await page.mouse.move(r.x + 200, r.y + 120, { steps: 6 });
  await page.mouse.up();
  await page.mouse.move(2, 2);
  await expect(map(page)).not.toHaveAttribute('data-pinned', /.*/);
  // a click on a dot pins too; another day unpins
  await unfocused(page); // (a dot can be hovered once the map shows the whole country again)
  await page.locator(`[data-testid="league-map"] .ck-map-dot[data-map-game="${b}"] .ck-map-pin`).click({ force: true });
  await expect(map(page)).toHaveAttribute('data-pinned', '');
  await expect(map(page)).toHaveAttribute('data-focus', b);
  await page.getByLabel('Next day').click();
  await page.mouse.move(2, 2);
  await unfocused(page);
  await expect(page.locator('style[data-map-pin]')).toHaveText('');
});

test('zoom to fit: every place of the focused game\'s legs and every label inside the map box; nothing focused = the whole map; TOR @ DET zooms in', async ({ page }) => {
  for (const date of ['2026-11-02', '2026-11-15', '2027-01-07']) {
    await open(page, date);
    await expect(map(page).locator('.ck-map-svg')).toBeVisible();
    await expect(map(page).getByTestId('map-stage')).toHaveAttribute('data-view', '500.0,320.5,1');
    for (const id of await page.getByTestId('league-list').locator('.ck-card[data-game-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.gameId!))) {
      await row(page, id).locator('.ck-time').hover();
      await expect(map(page)).toHaveAttribute('data-focus', id);
      await page.waitForTimeout(350); // the zoom's transition (300 ms)
      const r = await map(page).evaluate((m) => {
        const box = m.querySelector('.ck-map-box')!.getBoundingClientRect();
        const pins = [...m.querySelectorAll('.ck-tv-point, .ck-map-dot.ck-map-hot')].map((p) => { const b = p.getBoundingClientRect(); return [b.left, b.top] as const; });
        const labels = [...m.querySelectorAll('.ck-tv-point .ck-map-label, .ck-tv-dist')].map((l) => l.getBoundingClientRect());
        return { out: pins.filter(([x, y]) => x < box.left || x > box.right || y < box.top || y > box.bottom).length, labelsOut: labels.filter((l) => l.left < box.left - 1 || l.right > box.right + 1 || l.top < box.top - 1 || l.bottom > box.bottom + 1).length, n: pins.length };
      });
      expect(r.out, `${date} ${id}: places outside the box`).toBe(0);
      expect(r.labelsOut, `${date} ${id}: labels outside the box`).toBe(0);
      expect(r.n).toBeGreaterThan(0);
    }
  }
  const tor = await page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    return (raw.leagueSchedule.gameDates as { games: FeedGame[] }[]).flatMap((d) => d.games).find((g) => /^00[2456]/.test(g.gameId) && g.awayTeam.teamTricode === 'TOR' && g.homeTeam.teamTricode === 'DET');
  });
  test.skip(!tor, 'no TOR @ DET in the snapshot');
  await open(page, tor!.gameDateEst.slice(0, 10));
  await row(page, tor!.gameId).locator('.ck-time').click();
  await expect(map(page)).toHaveAttribute('data-pinned', '');
  const k = Number((await map(page).getByTestId('map-stage').getAttribute('data-view'))!.split(',')[2]);
  expect(k).toBeGreaterThan(1);
});

test('nothing focused, busy days: no two labels overlap, none covers a dot, all inside the map', async ({ page }) => {
  for (const date of ['2026-11-02', '2026-11-15', '2026-12-26', '2027-01-07']) {
    await open(page, date);
    await expect(map(page).locator('.ck-map-svg')).toBeVisible();
    const r = await map(page).evaluate((m) => {
      const box = m.querySelector('.ck-map-box')!.getBoundingClientRect();
      const labels = [...m.querySelectorAll('.ck-map-label')].map((l) => l.getBoundingClientRect());
      const pins = [...m.querySelectorAll('.ck-map-pin')].map((l) => l.getBoundingClientRect());
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      let pairs = 0;
      labels.forEach((a, i) => labels.forEach((b, j) => j > i && hit(a, b) && pairs++));
      return { n: labels.length, pairs, onPins: labels.filter((l) => pins.some((p) => hit(l, p))).length, out: labels.filter((l) => l.left < box.left || l.right > box.right || l.top < box.top || l.bottom > box.bottom).length };
    });
    expect(r.n, date).toBeGreaterThan(3);
    expect(r, date).toMatchObject({ pairs: 0, onPins: 0, out: 0 });
  }
});

test('hover rows quickly: no long task (the travel view is worked out once per game)', async ({ page }, info) => {
  await open(page, '2026-11-02');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ type: 'longtask' });
  });
  const rows = await page.getByTestId('league-list').locator('.ck-card[data-game-id]').all();
  for (let pass = 0; pass < 3; pass++)
    for (const r of rows) {
      const b = await r.boundingBox();
      if (!b || b.y < 0 || b.y + b.height > page.viewportSize()!.height) continue;
      await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 2 });
    }
  await page.waitForTimeout(400);
  const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  console.log(`[map] ${info.project.name} quick hover: long tasks ${JSON.stringify(long.map(Math.round))}`);
  expect(long.filter((d) => d > 80)).toEqual([]);
});

test('hover feels instant: pointer → highlight painted, row → dot and dot → row (median printed)', async ({ page }, info) => {
  await open(page, '2026-11-02');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __hov: number[]; __t0: number };
    w.__hov = [];
    addEventListener('pointerover', (e) => (w.__t0 = e.timeStamp), true);
    new MutationObserver((ms) => {
      if (!ms.some((m) => (m.target as Element).classList?.contains('ck-map-hot'))) return;
      const t0 = w.__t0;
      requestAnimationFrame(() => requestAnimationFrame((t) => w.__hov.push(t - t0)));
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  const ids = await page.getByTestId('league-list').locator('.ck-card').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.gameId!));
  const take = async (ms = 100) => {
    await page.waitForTimeout(ms);
    return page.evaluate(() => (window as unknown as { __hov: number[] }).__hov.splice(0));
  };
  const rowTimes: number[] = [];
  const dotTimes: number[] = [];
  for (const id of ids) {
    await page.mouse.move(2, 2);
    await unfocused(page);
    await take();
    await page.locator(`.ck-card[data-game-id="${id}"] .ck-time`).hover();
    rowTimes.push(Math.min(...(await take())));
    await page.mouse.move(2, 2);
    await unfocused(page);
    await take(400); // the zoom back out
    await map(page).locator(`.ck-map-dot[data-map-game="${id}"] .ck-map-pin`).hover({ force: true });
    dotTimes.push(Math.min(...(await take())));
  }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  console.log(`[map] ${info.project.name} hover → highlight on screen (2nd frame): row → dot median ${med(rowTimes).toFixed(1)} ms (max ${Math.max(...rowTimes).toFixed(1)}), dot → row median ${med(dotTimes).toFixed(1)} ms (max ${Math.max(...dotTimes).toFixed(1)})`);
  // two frames of a 60 Hz display are ~33 ms; 50 leaves room for a slow runner
  expect(med(rowTimes)).toBeLessThan(50);
  expect(med(dotTimes)).toBeLessThan(50);
});

test('hover a dot: its row lit (scrolled into view on a busy night); rows never move; the highlight never in a copy', async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 640 }); // the 15 rows don't fit
  await open(page, '2026-11-02');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  const list = page.getByTestId('league-list');
  const rects = () => list.locator('.ck-card').evaluateAll((els) => els.map((e) => { const h = e as HTMLElement; return [h.offsetLeft, h.offsetTop, h.offsetWidth, h.offsetHeight].join(','); }));
  const before = await rects();
  const ids = await map(page).locator('.ck-map-dot[data-map-game]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mapGame!));
  expect(ids).toHaveLength(15);
  let scrolled = 0;
  for (const id of ids) {
    await page.mouse.move(2, 2);
    await unfocused(page);
    await page.waitForTimeout(350);
    const top0 = await list.evaluate((el) => el.scrollTop);
    await map(page).locator(`.ck-map-dot[data-map-game="${id}"] .ck-map-pin`).hover({ force: true });
    const r = list.locator(`.ck-card[data-game-id="${id}"]`);
    await expect(r).toHaveClass(/ck-map-hot/);
    await expect(page.locator('.ck-card.ck-map-hot')).toHaveCount(1);
    // a dot hovered on the map: lines and panel, no zoom (the dot stays under the pointer for a click)
    await expect(map(page)).toHaveAttribute('data-focus', id);
    await expect(map(page).getByTestId('map-stage')).toHaveAttribute('data-view', '500.0,320.5,1');
    const [rb, l] = [await r.boundingBox(), await list.boundingBox()];
    expect(rb!.y).toBeGreaterThanOrEqual(l!.y - 1);
    expect(rb!.y + rb!.height).toBeLessThanOrEqual(l!.y + l!.height + 1);
    if ((await list.evaluate((el) => el.scrollTop)) !== top0) scrolled++;
  }
  expect(scrolled, 'some rows were off screen and got scrolled in').toBeGreaterThan(0);
  expect(await rects()).toEqual(before);
  const outline = (on: 'row' | 'day') => page.locator('.ck-card.ck-map-hot').evaluate((e, on) => { const n = on === 'row' ? e : e.closest('.ck-lday')!; n.classList.add('ck-capturing'); const o = getComputedStyle(e).boxShadow; n.classList.remove('ck-capturing'); return o; }, on);
  expect(await outline('row')).toBe('none');
  expect(await outline('day')).toBe('none');
});
