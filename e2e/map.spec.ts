// Round 8 (Part 2): the League List's map in a real browser at 1280 × 900 (desktop) and 1920 × 1080 (desktop-xl):
// beside the list and never over it, one dot per game where the feed says it's played, yellow for back-to-backs, edge
// markers for places off the map, out of every copy, not in the Slate or on tablets/phones.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
const YELLOW = 'rgb(245, 224, 66)';
const desktop = (p: string) => p === 'desktop' || p === 'desktop-xl';

async function open(page: Page, date: string, extra = '') {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/?view=league&layout=list&date=${date}${extra}`);
  await page.waitForFunction(() => !!document.querySelector('[data-testid="league-list"] [data-game-id]'));
}
const map = (page: Page) => page.getByTestId('league-map');

type FeedGame = { gameId: string; gameDateEst: string; arenaName: string; arenaCity: string; arenaState: string; homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } };
const feedDay = (page: Page, date: string) =>
  page.evaluate(async (date) => {
    const raw = await (await fetch('/data/schedule.json')).json();
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

test('one dot per game, at the feed\'s arena (inside its state), labeled with the home team; yellow = a back-to-back', async ({ page }) => {
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
        return { id: (e as HTMLElement).dataset.mapGame!, kind: (e as HTMLElement).dataset.kind, code: e.querySelector('.ck-map-code')?.textContent, color: getComputedStyle(e.querySelector('.ck-map-pin')!).backgroundColor, states: [...states], pin: pin.width };
      }),
    );
    const listIds = await page.getByTestId('league-list').locator('[data-game-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.gameId));
    expect(dots.map((d) => d.id).sort(), date).toEqual(listIds.sort());
    expect(dots.map((d) => d.id).sort(), date).toEqual(feed.map((g) => g.gameId).sort());
    for (const d of dots) {
      const g = feed.find((x) => x.gameId === d.id)!;
      expect(d.kind, d.id).toBe('map');
      expect(d.code, d.id).toBe(g.homeTeam.teamTricode);
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
  for (const [date, home, text] of [['2026-11-07', 'IND', /^IND · Mexico City ↓$/], ['2027-01-14', 'SAS', /^SAS · Paris →$/], ['2027-01-17', 'NOP', /^NOP · Manchester →$/]] as const) {
    await open(page, date);
    const feed = await feedDay(page, date);
    const g = feed.find((x) => x.homeTeam.teamTricode === home && x.arenaCity !== '')!;
    const dot = map(page).locator(`[data-map-game="${g.gameId}"]`);
    await expect(dot).toHaveAttribute('data-kind', 'edge');
    await expect(dot.locator('.ck-map-code')).toHaveText(text);
    expect(await dot.getAttribute('title')).toMatch(/(Mexico City, Mexico|Paris, France|Manchester, England) \(off this map\)$/);
    // the marker and its label inside the map box
    const [m, l] = [await map(page).locator('.ck-map-box').boundingBox(), await dot.locator('.ck-map-code').boundingBox()];
    expect(l!.x).toBeGreaterThanOrEqual(m!.x - 0.5);
    expect(l!.x + l!.width).toBeLessThanOrEqual(m!.x + m!.width + 0.5);
    expect(l!.y + l!.height).toBeLessThanOrEqual(m!.y + m!.height + 0.5);
  }
  // Cup knockout games the feed hasn't placed yet (no arena; Dec 4–8 in the snapshot of round 8): listed as unknown,
  // never guessed. The day comes from the served snapshot; once the NBA places them, the unit test (fixture) still covers it.
  const day = await page.evaluate(async () => {
    const raw = await (await fetch('/data/schedule.json')).json();
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
    const raw = await (await fetch('/data/schedule.json')).json();
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
  await page.goto('/?view=league&layout=slate');
  await expect(page.getByTestId('slate')).toBeVisible();
  await expect(map(page)).toHaveCount(0);
});

test('no map on tablets and phones (the list keeps the width)', async ({ page }, info) => {
  test.skip(desktop(info.project.name), 'narrow widths');
  await open(page, '2026-11-02');
  await page.waitForTimeout(300);
  await expect(map(page)).toHaveCount(0);
});

// ——— Part 3: hover and travel ———

/** Each game of `date` with its teams' back-to-back ends, from the served snapshot (independent of the app). */
const feedAround = (page: Page, date: string) =>
  page.evaluate(async (date) => {
    const raw = await (await fetch('/data/schedule.json')).json();
    const games = (raw.leagueSchedule.gameDates as { games: FeedGame[] }[]).flatMap((d) => d.games).filter((g) => /^00[2456]/.test(g.gameId));
    const day = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
    const on = (tri: string, d: string) => games.find((g) => g.gameDateEst.startsWith(d) && (g.awayTeam.teamTricode === tri || g.homeTeam.teamTricode === tri));
    return games
      .filter((g) => g.gameDateEst.startsWith(date))
      .map((g) => ({
        id: g.gameId,
        arena: g.arenaName,
        city: g.arenaCity,
        travel: [g.awayTeam.teamTricode, g.homeTeam.teamTricode].flatMap((tri) => {
          const y = on(tri, day(date, -1));
          const t = on(tri, day(date, 1));
          return [...(y ? [`${tri}:2 ${y.arenaName} -> ${g.arenaName}`] : []), ...(t ? [`${tri}:1 ${g.arenaName} -> ${t.arenaName}`] : [])];
        }),
      }));
  }, date);

test('hover a row: its dot lit, the others dimmed, the place and arena shown; exactly the right travel lines; none at rest', async ({ page }) => {
  for (const date of ['2026-11-02', '2026-11-07']) {
    await open(page, date);
    await expect(map(page).locator('.ck-map-svg')).toBeVisible();
    const feed = await feedAround(page, date);
    expect(feed.some((g) => g.travel.length > 0)).toBe(true);
    for (const g of feed) {
      await page.locator(`[data-testid="league-list"] .ck-card[data-game-id="${g.id}"] .ck-time`).hover();
      await expect(map(page).locator('.ck-map-hot')).toHaveAttribute('data-map-game', g.id);
      expect(await map(page).locator('.ck-map-box').getAttribute('class')).toContain('ck-map-dimmed');
      await expect.poll(() => map(page).locator('.ck-map-dot:not(.ck-map-hot)').evaluateAll((els) => els.every((e) => +getComputedStyle(e).opacity < 0.5))).toBe(true);
      await expect(page.getByTestId('map-info')).toContainText(g.arena);
      await expect(page.getByTestId('map-info')).toContainText(g.city);
      // a line per team night whose other game is at another arena (the same arena: "stays", said in words)
      const want = g.travel.filter((t) => { const [a, b] = t.slice(t.indexOf(' ') + 1).split(' -> '); return a !== b; }).sort();
      const got = (await map(page).locator('[data-travel]').evaluateAll((els) => els.map((e) => `${(e as SVGElement).dataset.travel} ${(e as SVGElement).dataset.from} -> ${(e as SVGElement).dataset.to}`))).sort();
      expect(got, `${date} ${g.id}`).toEqual(want);
    }
    // nothing hovered: no lines, nothing dimmed, no row lit
    await page.mouse.move(2, 2);
    await expect(map(page).locator('[data-travel]')).toHaveCount(0);
    await expect(map(page).locator('.ck-map-dimmed')).toHaveCount(0);
    await expect(page.locator('.ck-card.ck-map-hot')).toHaveCount(0);
  }
});

test('a known B2B whose first night was a road game: BOS @ HOU, Nov 2 — the line runs from Orlando (BOS @ ORL, Nov 1) to Houston', async ({ page }) => {
  await open(page, '2026-11-02');
  const row = page.locator('[data-testid="league-list"] .ck-card').filter({ hasText: 'BOS' }).filter({ hasText: 'HOU' });
  await row.locator('.ck-time').hover();
  const line = map(page).locator('[data-travel="BOS:2"]');
  await expect(line).toHaveAttribute('data-from', 'Kia Center');
  await expect(line).toHaveAttribute('data-to', 'Toyota Center');
  await expect(map(page).locator('[data-travel-end="BOS:2"]')).toContainText('BOS yesterday');
  await expect(page.getByTestId('map-info')).toContainText('BOS from Orlando, FL yesterday (@ ORL)');
  expect(await line.evaluate((e) => getComputedStyle(e).stroke)).toBe('rgb(255, 143, 90)'); // the away team's colour
});

test('hover a dot: its row lit (scrolled into view on a busy night), both ways; rows never move', async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 640 }); // the 15 rows don't fit
  await open(page, '2026-11-02');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  const list = page.getByTestId('league-list');
  const rects = () => list.locator('.ck-card').evaluateAll((els) => els.map((e) => { const h = e as HTMLElement; return [h.offsetLeft, h.offsetTop, h.offsetWidth, h.offsetHeight].join(','); })); // layout boxes: unaffected by scrolling
  const before = await rects();
  const ids = await map(page).locator('.ck-map-dot[data-map-game]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mapGame!));
  expect(ids).toHaveLength(15);
  let scrolled = 0;
  for (const id of ids) {
    const top0 = await list.evaluate((el) => el.scrollTop);
    await map(page).locator(`[data-map-game="${id}"] .ck-map-pin`).hover({ force: true });
    const row = list.locator(`.ck-card[data-game-id="${id}"]`);
    await expect(row).toHaveClass(/ck-map-hot/);
    await expect(page.locator('.ck-card.ck-map-hot')).toHaveCount(1);
    const [r, l] = [await row.boundingBox(), await list.boundingBox()];
    expect(r!.y).toBeGreaterThanOrEqual(l!.y - 1);
    expect(r!.y + r!.height).toBeLessThanOrEqual(l!.y + l!.height + 1);
    if ((await list.evaluate((el) => el.scrollTop)) !== top0) scrolled++;
  }
  expect(scrolled, 'some rows were off screen and got scrolled in').toBeGreaterThan(0);
  // no layout shift: every row's box (in list coordinates) is as before any hover
  expect(await rects()).toEqual(before);
  // the hover highlight is never in a copy: the copied node (the row, or its day) is marked .ck-capturing while it's taken
  const outline = (on: 'row' | 'day') => page.locator('.ck-card.ck-map-hot').evaluate((e, on) => { const n = on === 'row' ? e : e.closest('.ck-lday')!; n.classList.add('ck-capturing'); const o = getComputedStyle(e).boxShadow; n.classList.remove('ck-capturing'); return o; }, on);
  expect(await outline('row')).toBe('none');
  expect(await outline('day')).toBe('none');
  // lit with the sky bar (box-shadow), not an outline: the marquee selection's outline stays its own
  expect(await page.locator('.ck-card.ck-map-hot').evaluate((e) => [getComputedStyle(e).boxShadow.includes('94, 200, 255'), getComputedStyle(e).outlineStyle])).toEqual([true, 'none']);
});

test('hover feels instant: pointer → highlight painted, row → dot and dot → row (median printed)', async ({ page }, info) => {
  await open(page, '2026-11-02');
  await expect(map(page).locator('.ck-map-svg')).toBeVisible();
  // in the page: from the pointer event to the second frame after the target got its class (it's on screen by then)
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
  const take = async () => {
    await page.waitForTimeout(100);
    return page.evaluate(() => (window as unknown as { __hov: number[] }).__hov.splice(0));
  };
  const rowTimes: number[] = [];
  const dotTimes: number[] = [];
  for (const id of ids) {
    await page.mouse.move(2, 2);
    await take();
    await page.locator(`.ck-card[data-game-id="${id}"] .ck-time`).hover();
    rowTimes.push(Math.min(...(await take())));
    await page.mouse.move(2, 2);
    await take();
    await map(page).locator(`[data-map-game="${id}"] .ck-map-pin`).hover({ force: true });
    dotTimes.push(Math.min(...(await take())));
  }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  console.log(`[map] ${info.project.name} hover → highlight on screen (2nd frame): row → dot median ${med(rowTimes).toFixed(1)} ms (max ${Math.max(...rowTimes).toFixed(1)}), dot → row median ${med(dotTimes).toFixed(1)} ms (max ${Math.max(...dotTimes).toFixed(1)})`);
  // two frames of a 60 Hz display are ~33 ms; 50 leaves room for a slow runner
  expect(med(rowTimes)).toBeLessThan(50);
  expect(med(dotTimes)).toBeLessThan(50);
});
