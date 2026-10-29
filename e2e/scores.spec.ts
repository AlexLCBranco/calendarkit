// Final scores in every view, against the served snapshot (games with gameStatus 3), at the desktop widths (1280,
// 1920): League List rows, league week view (1 and 2 weeks: score in the logo slot, fits it, no TV pill, "@" column
// straight), Team Calendar cells (every team with a final game). Prints the Team Calendar scale and the score
// widths. Clock: Nov 15, 2026 (games from Oct 23 on are over but not final in the snapshot: unchanged).

import { expect, test, type Page } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');
type Side = { teamId: number; teamTricode: string; score: number };
type Final = { gameId: string; date: string; home: Side; away: Side; ot?: string };

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await expect(page.getByRole('tablist', { name: 'Layout' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
}
/** Final games straight from the served snapshot (independent of the app's code). */
const finals = (page: Page): Promise<Final[]> =>
  page.evaluate(async () => {
    const raw = await (await fetch('/data/schedule.json')).json();
    type G = { gameId: string; gameStatus: number; gameStatusText: string; gameDateEst: string; homeTeam: Side; awayTeam: Side };
    return (raw.leagueSchedule.gameDates as { games: G[] }[])
      .flatMap((d) => d.games)
      .filter((g) => /^00[2456]/.test(g.gameId) && g.gameStatus === 3)
      .map((g) => ({ gameId: g.gameId, date: g.gameDateEst.slice(0, 10), home: g.homeTeam, away: g.awayTeam, ot: /^Final\/(\d*OT)$/.exec(g.gameStatusText.trim())?.[1] }));
  });
const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

test('League List: every final game shows "AWAY a @ h HOME", winner bold', async ({ page }) => {
  await open(page, '?view=league&layout=list');
  const all = await finals(page);
  expect(all.length).toBeGreaterThan(10);
  for (const date of new Set(all.map((g) => g.date))) {
    await open(page, `?view=league&layout=list&date=${date}`);
    for (const g of all.filter((x) => x.date === date)) {
      const card = page.locator(`.ck-card[data-game-id="${g.gameId}"]`);
      // the names and scores only: league cards also carry a "B2B" badge per team on a back-to-back
      expect(norm(await card.locator('.ck-matchup').evaluate((m) => [...m.querySelectorAll('.ck-team, .ck-score, .ck-vsat')].map((e) => e.textContent).join(' ')))).toBe(`${g.away.teamTricode} ${g.away.score} @ ${g.home.score} ${g.home.teamTricode}`);
      const win = await card.locator('.ck-score').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontWeight));
      expect(win).toEqual([g.away.score > g.home.score ? '700' : '500', g.home.score > g.away.score ? '700' : '500']);
    }
  }
});

for (const weeks of [1, 2] as const) {
  test(`week view, ${weeks} week(s): score in the logo slot (fits), no TV pill, "@" column straight, upcoming lines unchanged`, async ({ page }, info) => {
    await open(page, `?view=league&layout=calendar&date=2026-10-20${weeks === 2 ? '&weeks=2' : ''}`);
    const all = (await finals(page)).filter((g) => g.date >= '2026-10-18' && g.date <= (weeks === 1 ? '2026-10-24' : '2026-10-31'));
    expect(all.length).toBeGreaterThan(10);
    const r = await page.evaluate((ids) => {
      const out: string[] = [];
      let widest = 0;
      let slot = 0;
      for (const id of ids) {
        const line = document.querySelector(`.ck-month-game[data-game-id="${id}"]`)!;
        if (line.querySelector('img, .ck-tv-pill')) out.push(`${id}: logo or TV pill on a final line`);
        for (const s of line.querySelectorAll<HTMLElement>('.ck-mscore')) {
          const range = document.createRange();
          range.selectNodeContents(s);
          widest = Math.max(widest, range.getBoundingClientRect().width);
          slot = s.getBoundingClientRect().width;
          if (range.getBoundingClientRect().width > slot + 0.01) out.push(`${id}: score ${s.textContent} wider than its slot`);
        }
      }
      // "@" column: same x for every line of a day column
      for (const col of document.querySelectorAll('.ck-mcol')) {
        const xs = new Set([...col.querySelectorAll('.ck-at')].map((a) => a.getBoundingClientRect().left.toFixed(2)));
        if (xs.size > 1) out.push(`"@" not straight in ${col.closest('[data-date]')!.getAttribute('data-date')}: ${[...xs].join(' ')}`);
      }
      const scale = document.querySelector('.ck-week-view')!.getAttribute('data-scale');
      const line = document.querySelector('.ck-month-game')!.getBoundingClientRect().width;
      const font = getComputedStyle(document.querySelector('.ck-mscore')!).fontSize;
      return { out, widest, slot, scale, line, font };
    }, all.map((g) => g.gameId));
    console.log(`[scores] ${info.project.name} ${weeks}w: scale ${r.scale}, line ${r.line.toFixed(2)} px, score font ${r.font}, widest score ${r.widest.toFixed(2)} of ${r.slot.toFixed(2)} px slot`);
    expect(r.out).toEqual([]);
    for (const g of all) {
      const line = page.locator(`.ck-month-game[data-game-id="${g.gameId}"]`);
      expect(await line.locator('.ck-mscore').allTextContents()).toEqual([String(g.away.score), String(g.home.score)]);
    }
    if (weeks === 2 && info.project.name === 'desktop-xl') expect(await page.locator('.ck-month-day').first().getAttribute('data-cols')).toBe('2');
  });
}

test('Team Calendar: every team with a final game, every final cell; scale printed', async ({ page }, info) => {
  await open(page, '?view=team&layout=calendar&team=BOS');
  const all = await finals(page);
  const scale = await page.locator('.ck-team-grid').getAttribute('data-scale');
  console.log(`[scores] ${info.project.name} team calendar scale ${scale}`);
  const teams = [...new Map(all.flatMap((g) => [[g.home.teamId, g.home.teamTricode], [g.away.teamId, g.away.teamTricode]] as [number, string][])).values()];
  let n = 0;
  for (const tri of teams) {
    await open(page, `?view=team&layout=calendar&team=${tri}`);
    await page.getByLabel('Previous month').click(); // clock in November; the finals are in October
    await expect(page.getByTestId('period-title')).toHaveText('October 2026');
    for (const g of all.filter((x) => x.home.teamTricode === tri || x.away.teamTricode === tri)) {
      const home = g.home.teamTricode === tri;
      const [me, opp] = home ? [g.home, g.away] : [g.away, g.home];
      const cell = page.locator(`.ck-day-cell[data-date="${g.date}"]`);
      expect(norm(await cell.locator('.ck-matchup').textContent())).toBe(`${tri} ${me.score} ${home ? 'vs' : '@'} ${opp.score} ${opp.teamTricode}${g.ot ? ` ${g.ot}` : ''}`);
      // nothing clipped in the cell
      expect(await cell.evaluate((c) => c.scrollHeight <= c.clientHeight + 1 && c.scrollWidth <= c.clientWidth + 1)).toBe(true);
      n++;
    }
  }
  expect(n).toBe(2 * all.length);
});

// Overtime (round 4, item 1): "OT" / "2OT" after the final score, in the snapshot's own "Final/OT" games. The marker
// must not change any width budget: League List and Team List rows stay one line, the Team List matchup (worst case
// written in: widest tricodes, 3-digit scores, "3OT") stays inside its fixed slot, week-view lines keep their width.
test('overtime marker: League List, Team List (worst case in its slot), week view', async ({ page }, info) => {
  await open(page, '?view=league&layout=list');
  const ots = (await finals(page)).filter((g) => g.ot);
  expect(ots.length, 'the snapshot has overtime games').toBeGreaterThan(0);
  const oneLine = (sel: string) =>
    page.locator(sel).evaluate((a) => {
      const kids = [...a.children].filter((c) => getComputedStyle(c).position !== 'absolute' && c.getBoundingClientRect().height > 0);
      const tops = new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2)));
      return tops.size === 1 || Math.max(...tops) - Math.min(...tops) < 4;
    });
  for (const g of ots) {
    await open(page, `?view=league&layout=list&date=${g.date}`);
    const card = page.locator(`.ck-card[data-game-id="${g.gameId}"]`);
    expect(norm(await card.locator('.ck-matchup').evaluate((m) => [...m.querySelectorAll('.ck-team, .ck-score, .ck-vsat, .ck-ot')].map((e) => e.textContent).join(' ')))).toBe(`${g.away.teamTricode} ${g.away.score} @ ${g.home.score} ${g.home.teamTricode} ${g.ot}`);
    expect(await card.getAttribute('aria-label')).toContain(`(${g.ot})`);
    expect(await oneLine(`.ck-card[data-game-id="${g.gameId}"]`), `${g.gameId} League List one line`).toBe(true);
    for (const tri of [g.away.teamTricode, g.home.teamTricode]) {
      await open(page, `?view=team&layout=list&team=${tri}`);
      const row = page.locator(`[data-testid="team-list"] .ck-card[data-game-id="${g.gameId}"]`);
      expect(await row.locator('.ck-ot').textContent()).toBe(g.ot);
      expect(await oneLine(`[data-testid="team-list"] .ck-card[data-game-id="${g.gameId}"]`), `${g.gameId} Team List one line`).toBe(true);
    }
  }
  // worst case in the Team List's fixed matchup slot: write the widest tricodes, 3-digit scores and "3OT" into a row
  await open(page, `?view=team&layout=list&team=${ots[0]!.home.teamTricode}`);
  const r = await page.locator(`[data-testid="team-list"] .ck-card[data-game-id="${ots[0]!.gameId}"] .ck-matchup`).evaluate((m) => {
    m.querySelectorAll('.ck-team').forEach((t) => (t.firstChild!.textContent = 'MEM'));
    m.querySelectorAll('.ck-team').forEach((t) => t.classList.remove('ck-loss')); // both bold: the widest
    m.querySelectorAll('.ck-score').forEach((t) => (t.textContent = '188'));
    m.querySelector('.ck-ot')!.textContent = '3OT';
    // content = the outermost edges of every part's box and of its text (text can spill out of a narrow slot)
    const edges = [...m.querySelectorAll('.ck-side > *, .ck-team, .ck-score, .ck-ot')].flatMap((e) => {
      const range = document.createRange();
      range.selectNodeContents(e);
      return [e.getBoundingClientRect(), range.getBoundingClientRect()].filter((r) => r.width > 0);
    });
    const spill = [...m.querySelectorAll('.ck-team, .ck-score')].filter((e) => {
      const range = document.createRange();
      range.selectNodeContents(e.firstChild!);
      return range.getBoundingClientRect().right > e.getBoundingClientRect().right + 0.5;
    }).length;
    return { slot: m.getBoundingClientRect().width, content: Math.max(...edges.map((r) => r.right)) - Math.min(...edges.map((r) => r.left)), overflow: m.scrollWidth - m.clientWidth, spill };
  });
  console.log(`[scores] ${info.project.name} Team List worst-case matchup with OT: ${r.content.toFixed(2)} of ${r.slot} px`);
  expect(r.content).toBeLessThanOrEqual(r.slot);
  expect(r.spill, 'tricode/score text inside its slot').toBe(0);
  // week view: in the TV column of the final line, inside the line
  const g = ots[0]!;
  for (const weeks of [1, 2]) {
    await open(page, `?view=league&layout=calendar&date=${g.date}&weeks=${weeks}`);
    const w = await page.locator(`.ck-month-game[data-game-id="${g.gameId}"]`).evaluate((line) => {
      const o = line.querySelector('.ck-tv-slot .ck-ot')!;
      const range = document.createRange();
      range.selectNodeContents(o);
      return { text: o.textContent, ot: range.getBoundingClientRect().right, slot: o.parentElement!.getBoundingClientRect().right, overflow: line.scrollWidth - line.clientWidth };
    });
    expect(w.text).toBe(g.ot);
    expect(w.ot).toBeLessThanOrEqual(w.slot + 0.01);
    expect(w.overflow).toBe(0);
  }
});
