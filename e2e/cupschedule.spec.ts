// Cup → Schedule (round 12), against the served snapshot: the League list (every Cup night = the snapshot's Cup games of
// that night, nothing else; headings, group / round tags; back-to-backs from the whole schedule), the Team list (Played /
// Remaining), copies and the marquee, and the fit rule — no vertical scrolling at 1920 × 950 and 1600 × 1000 on the
// busiest night and for a team with every Cup game possible (4 group games + QF + SF + Final), text at the List views'
// size. A "full Cup" version of the snapshot (every group game final, BOS through to the Final, a non-Cup game added on a
// quarterfinal night) stands in for the knockout games the feed hasn't filled in yet.

import { expect, test, type Locator, type Page } from './fixtures';
import { APP } from './app';

const desktop = (name: string) => ['desktop', 'desktop-xl'].includes(name);

type RawTeam = { teamId: number; teamTricode: string | null; teamName: string | null; teamCity: string | null; teamSlug: string | null; score: number };
type RawGame = { gameId: string; gameDateEst: string; gameDateTimeUTC: string; gameStatus: number; gameStatusText: string; gameSubtype: string; gameSubLabel: string; awayTeam: RawTeam; homeTeam: RawTeam };
const shown = (g: RawGame) => /^00[2456]/.test(g.gameId);

const BOS = { teamId: 1610612738, teamTricode: 'BOS', teamName: 'Celtics', teamCity: 'Boston', teamSlug: 'celtics' };
const NYK = { teamId: 1610612752, teamTricode: 'NYK', teamName: 'Knicks', teamCity: 'New York', teamSlug: 'knicks' };
const OKC = { teamId: 1610612760, teamTricode: 'OKC', teamName: 'Thunder', teamCity: 'Oklahoma City', teamSlug: 'thunder' };
const SAS = { teamId: 1610612759, teamTricode: 'SAS', teamName: 'Spurs', teamCity: 'San Antonio', teamSlug: 'spurs' };
const EXTRA_ID = '0022699999';

/** The full Cup: every group game final (some in OT), BOS @ NYK QF final (BOS won), BOS vs OKC SF and BOS vs SAS Final to
 * come, and a non-Cup game (MIL @ CHI) on the first quarterfinal night. */
async function fullCup(page: Page) {
  await page.route('**/data/schedule.json', async (route) => {
    const raw = await (await route.fetch()).json();
    const days = raw.leagueSchedule.gameDates as { games: RawGame[] }[];
    let k = 0;
    const ko: RawGame[] = [];
    for (const d of days)
      for (const g of d.games) {
        if (g.gameSubtype === 'in-season') {
          k++;
          g.gameStatus = 3;
          g.gameStatusText = k % 5 ? 'Final' : 'Final/OT';
          g.homeTeam.score = 95 + ((k * 7) % 31);
          g.awayTeam.score = 95 + ((k * 13) % 29);
          if (g.homeTeam.score === g.awayTeam.score) g.homeTeam.score++;
        } else if (g.gameSubtype === 'in-season-knockout') ko.push(g);
      }
    const [qf, , , , sf, , fin] = ko;
    const set = (g: RawGame, away: object, home: object, utc: string, final?: [number, number]) => {
      Object.assign(g.awayTeam, away, { score: final?.[0] ?? 0 });
      Object.assign(g.homeTeam, home, { score: final?.[1] ?? 0 });
      g.gameDateTimeUTC = utc;
      g.gameStatus = final ? 3 : 1;
      g.gameStatusText = final ? 'Final' : '7:30 pm ET';
    };
    set(qf!, BOS, NYK, '2026-12-05T00:30:00Z', [118, 109]);
    set(sf!, OKC, BOS, '2026-12-09T00:30:00Z');
    set(fin!, SAS, BOS, fin!.gameDateTimeUTC);
    // a non-Cup game on the quarterfinal night: a copy of an ordinary game, moved there
    const plain = days.flatMap((d) => d.games).find((g) => !g.gameSubtype && shown(g))!;
    const extra = { ...structuredClone(plain), gameId: EXTRA_ID, gameDateEst: qf!.gameDateEst, gameDateTimeUTC: '2026-12-05T01:00:00Z' };
    days.find((d) => d.games.includes(qf!))!.games.push(extra);
    await route.fulfill({ json: raw });
  });
}

/**
 * The snapshot as the page gets it (the route included), worked out here independently of the app: every team's game
 * dates; the Cup's stops — group play's rounds (Round N = every team's Nth group game, in tip-off order) and the knockout
 * nights — with their games; each group game's number per team.
 */
const snapshot = (page: Page) =>
  page.evaluate(async (app) => {
    const raw = await (await fetch(`${app}data/schedule.json`)).json();
    const tip = (g: RawGame) => (g.gameStatusText === 'TBD' ? 'Z' : g.gameDateTimeUTC); // a TBD time sorts last, as in the app
    const games = (raw.leagueSchedule.gameDates as { games: RawGame[] }[])
      .flatMap((d) => d.games)
      .filter((g) => /^00[2456]/.test(g.gameId))
      .sort((a, b) => a.gameDateEst.localeCompare(b.gameDateEst) || tip(a).localeCompare(tip(b)) || a.gameId.localeCompare(b.gameId));
    const stops: Record<string, string[]> = {};
    const dates: Record<string, string[]> = {};
    const date: Record<string, string> = {};
    const num: Record<string, [number, number]> = {};
    const tri: Record<string, [string, string]> = {};
    const count: Record<string, number> = {};
    for (const g of games) {
      const d = g.gameDateEst.slice(0, 10);
      for (const t of [g.homeTeam, g.awayTeam]) if (t.teamTricode) (dates[t.teamTricode] ??= []).push(d);
      if (!/^in-season/.test(g.gameSubtype)) continue;
      date[g.gameId] = d;
      tri[g.gameId] = [g.awayTeam.teamTricode ?? '', g.homeTeam.teamTricode ?? ''];
      if (g.gameSubtype === 'in-season') {
        const a = (count[g.awayTeam.teamTricode!] = (count[g.awayTeam.teamTricode!] ?? 0) + 1);
        const h = (count[g.homeTeam.teamTricode!] = (count[g.homeTeam.teamTricode!] ?? 0) + 1);
        num[g.gameId] = [a, h];
        for (const r of new Set([a, h])) (stops[`r${r}`] ??= []).push(g.gameId);
      } else (stops[d] ??= []).push(g.gameId);
    }
    const keys = Object.keys(stops).sort((x, y) => (x[0] === 'r') !== (y[0] === 'r') ? (x[0] === 'r' ? -1 : 1) : x.localeCompare(y));
    return { stops, keys, dates, date, num, tri };
  }, APP);

async function openSchedule(page: Page, list: 'league' | 'team' = 'league') {
  await page.goto(`${APP}?view=cup`);
  await page.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click();
  if (list === 'team') await page.getByRole('tablist', { name: 'Cup list' }).getByRole('tab', { name: 'Team' }).click();
  else await expect(page.getByTestId('cup-league')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const pickTeam = async (page: Page, name: string) => {
  await page.getByTestId('team-picker').click();
  await page.getByRole('option', { name }).click();
  await expect(page.getByTestId('cup-team')).toBeVisible();
};
const stop = (page: Page, key: string) => page.locator(`.ck-cup-strip .ck-strip-day[data-date="${key}"]`).click();
const rowIds = (scope: Locator) => scope.locator('[data-game-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-game-id')!));
/** The Team List's row date, "Fri 06/11". */
const fmtShort = (date: string) => `${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${date.slice(8)}/${date.slice(5, 7)}`;
const fmt = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

test.describe('Cup schedule', () => {
  test.beforeEach(({}, info) => test.skip(!desktop(info.project.name), 'desktop only'));

  test('opens on Standings; Schedule on League; the switches; not remembered across a reload', async ({ page }) => {
    await page.goto(`${APP}?view=cup`);
    await expect(page.getByTestId('cup-group')).toHaveCount(6);
    await expect(page.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Standings' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click();
    await expect(page.getByTestId('cup-league')).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Cup list' }).getByRole('tab', { name: 'League' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tablist', { name: 'Cup list' }).getByRole('tab', { name: 'Team' }).click();
    await expect(page.getByTestId('team-picker')).toHaveText(/Pick a team/);
    await expect(page.getByTestId('cup-pick')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('cup-group')).toHaveCount(6);
    await expect(page.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Standings' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('cup-league')).toHaveCount(0);
  });

  test('League: Round 1–4 then the knockout nights, each = the snapshot’s games; headings, dates, tags; non-Cup games left out', async ({ page }) => {
    await fullCup(page);
    await openSchedule(page);
    const s = await snapshot(page);
    expect(s.keys.slice(0, 4)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(await page.locator('.ck-cup-strip .ck-strip-day').evaluateAll((els) => els.map((e) => e.getAttribute('data-date')))).toEqual(s.keys);
    for (const k of s.keys) {
      await stop(page, k);
      const list = page.getByTestId('cup-night');
      await expect(page.getByTestId('cup-league')).toHaveAttribute('data-stop', k);
      const ids = await rowIds(list);
      expect(ids).toEqual(s.stops[k]); // in date and tip-off order
      expect(ids).not.toContain(EXTRA_ID);
      const head = (await list.locator('.ck-lday-head').textContent())!;
      const tags = await list.locator('.ck-card .ck-tag.ck-cup, .ck-card .ck-tag.ck-cup-final').allTextContents();
      expect(tags).toHaveLength(ids.length);
      if (k[0] === 'r') {
        // every team exactly once in the round
        const teams = ids.flatMap((id) => s.tri[id]!.filter((_, i) => s.num[id]![i] === Number(k.slice(1))));
        expect(new Set(teams).size).toBe(30);
        expect(teams).toHaveLength(30);
        expect(head).toMatch(new RegExp(`^Group play · Round ${k.slice(1)} · [A-Z][a-z]{2} \\d+( – ([A-Z][a-z]{2} )?\\d+)?$`));
        // the date on every row; the tag: the group, and both numbers on a split game
        expect(await list.locator('.ck-card .ck-date').allTextContents()).toEqual(ids.map((id) => `${fmtShort(s.date[id]!)}`));
        tags.forEach((t, i) => {
          const [a, h] = s.num[ids[i]!]!;
          expect(t).toMatch(a === h ? /^(West|East) [ABC]$/ : new RegExp(`^(West|East) [ABC] · G${a}\/G${h}$`));
        });
        // two columns, filled top to bottom
        const xs = await list.locator('.ck-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
        expect(new Set(xs).size).toBe(2);
        expect(xs.slice(0, Math.ceil(xs.length / 2)).every((x) => x === xs[0])).toBe(true);
      } else {
        expect(head).toMatch(new RegExp(`^(Quarterfinals|Semifinals|Final) · ${fmt(k)}$`));
        for (const t of tags) expect(t).toMatch(/^(Quarterfinal|Semifinal|Final)$/);
        await expect(list.locator('.ck-date')).toHaveCount(0);
      }
    }
    await page.getByRole('tablist', { name: 'Round', exact: true }).getByRole('tab', { name: 'Quarterfinals' }).click();
    await expect(page.getByTestId('cup-night').locator('.ck-teams').first()).toHaveText(/BOS\s+118\s+@\s+109\s+NYK/);
    await page.getByRole('tablist', { name: 'Round', exact: true }).getByRole('tab', { name: 'Group play' }).click();
    await expect(page.getByTestId('cup-league')).toHaveAttribute('data-stop', 'r1');
  });

  test('League, real snapshot: undecided knockout sides read "TBD"; back-to-backs counted over the whole schedule', async ({ page }) => {
    await openSchedule(page);
    const s = await snapshot(page);
    const prevDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
    const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
    const cupOn = (t: string, d: string) => Object.keys(s.date).some((id) => s.date[id] === d && s.tri[id]!.includes(t));
    let flagged = 0;
    let fromNonCup = 0;
    for (const k of s.keys) {
      await stop(page, k);
      await expect(page.getByTestId('cup-league')).toHaveAttribute('data-stop', k);
      // rounds: the marks on the tricodes (fill = 2nd night, outline = 1st); knockout nights: the Fatigue components
      const rows = await page.getByTestId('cup-night').locator('.ck-card').evaluateAll((els) =>
        els.map((e) => {
          const fx = [...e.querySelectorAll<HTMLElement>('[data-testid="fatigue"]')];
          const marks = [...e.querySelectorAll<HTMLElement>('.ck-teams .ck-team')].map((t) => {
            const m = t.querySelector('.ck-fm');
            return m?.classList.contains('ck-fm-n2') ? '2' : m?.classList.contains('ck-fm-n1') ? '1' : '';
          });
          return { id: e.getAttribute('data-game-id')!, nights: fx.length ? fx.map((f) => f.dataset.night ?? '') : marks, teams: e.querySelector('.ck-teams')!.textContent!.replace(/\s+/g, ' ').trim() };
        }),
      );
      for (const r of rows) {
        const [away, home] = s.tri[r.id]!;
        const d = s.date[r.id]!;
        if (!away && !home) {
          expect(r.teams).toBe('TBD @ TBD');
          continue;
        }
        const expected = [away, home].map((t) => (s.dates[t]!.includes(prevDay(d)) ? '2' : s.dates[t]!.includes(nextDay(d)) ? '1' : ''));
        expect(r.nights, `${d} ${away} @ ${home}`).toEqual(expected);
        for (const [i, t] of [away, home].entries())
          if (expected[i]) {
            flagged++;
            if (!cupOn(t!, expected[i] === '2' ? prevDay(d) : nextDay(d))) fromNonCup++;
          }
      }
    }
    console.log(`[cup schedule] ${flagged} back-to-back marks on Cup rows, ${fromNonCup} of them paired with a non-Cup game`);
    expect(fromNonCup).toBeGreaterThan(0);
  });

  test('Team: Played with scores, Remaining in date order, knockout games once assigned; nothing left; empty headings hidden', async ({ page }) => {
    await fullCup(page);
    await openSchedule(page, 'team');
    await pickTeam(page, 'Boston Celtics');
    await expect(page.locator('.ck-cup-sec-head')).toHaveText(['Played', 'Remaining']);
    const played = page.getByTestId('cup-played');
    const remaining = page.getByTestId('cup-remaining');
    await expect(played.locator('.ck-card')).toHaveCount(5);
    await expect(remaining.locator('.ck-card')).toHaveCount(2);
    for (const t of await played.locator('.ck-teams').allTextContents()) expect(t.replace(/\s+/g, ' ').trim()).toMatch(/^BOS \d+ (vs|@) \d+ [A-Z]{3}$/);
    expect(await played.locator('.ck-tag.ck-cup').allTextContents()).toEqual(['Group round 1 · East C', 'Group round 2 · East C', 'Group round 3 · East C', 'Group round 4 · East C', 'Quarterfinal']);
    expect(await remaining.locator('.ck-tag.ck-cup, .ck-tag.ck-cup-final').allTextContents()).toEqual(['Semifinal', 'Final']);
    expect((await remaining.locator('.ck-teams').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())).toEqual(['BOS vs OKC', 'BOS vs SAS']);
    const dates = await page.locator('[data-testid="cup-team"] .ck-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-row-date')));
    expect(dates).toEqual([...dates].sort());
    // a team out of the Cup with every group game final: nothing left
    await pickTeam(page, 'Chicago Bulls');
    await expect(page.locator('.ck-cup-sec-head')).toHaveText(['Played']);
    await expect(page.getByTestId('cup-remaining')).toHaveText('No remaining Cup games');
    // the real snapshot: today nothing is final for most teams → no Played heading
    await page.unrouteAll();
    await openSchedule(page, 'team');
    await pickTeam(page, 'Charlotte Hornets');
    const s = await snapshot(page);
    const cha = Object.keys(s.tri).filter((id) => s.tri[id]!.includes('CHA'));
    expect((await rowIds(page.getByTestId('cup-team'))).sort()).toEqual(cha.sort());
  });

  test('copies: the view, a night, a game; marquee selection', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-xl', 'clipboard checks once');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openSchedule(page);
    const size = async (button: Locator) => {
      await page.evaluate(() => navigator.clipboard.writeText(''));
      await button.click();
      await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 60_000 });
      return page.evaluate(async () => {
        const item = (await navigator.clipboard.read()).find((i) => i.types.includes('image/png'))!;
        const bmp = await createImageBitmap(await item.getType('image/png'));
        return { w: bmp.width, h: bmp.height };
      });
    };
    const day = page.getByTestId('cup-night').locator('.ck-lday');
    const box = (await day.boundingBox())!;
    const view = await size(page.getByTestId('copy-view'));
    expect(Math.abs(view.w / 4 - box.width)).toBeLessThan(3);
    expect(Math.abs(view.h / 4 - box.height)).toBeLessThan(3);
    await day.hover();
    expect(await size(day.locator('> [data-testid="copy-day"]'))).toEqual(view);
    const card = day.locator('.ck-card').first();
    await card.hover();
    const one = await size(card.locator('> [data-testid="copy-game"]'));
    expect(one.h).toBeLessThan(view.h / 3);
    // marquee: a drag across the first three rows
    const cards = day.locator('.ck-card');
    const a = (await cards.nth(0).boundingBox())!;
    const c = (await cards.nth(2).boundingBox())!;
    await page.mouse.move(a.x + 6, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + 60, c.y + c.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByTestId('selection-count')).toHaveText('3 games selected');
    const sel = await size(page.getByTestId('copy-selection'));
    expect(sel.h).toBeGreaterThan(one.h * 2);
    // Team list: the whole view = the team's header and its sections
    await page.getByRole('tablist', { name: 'Cup list' }).getByRole('tab', { name: 'Team' }).click();
    await pickTeam(page, 'Boston Celtics');
    const t = (await page.getByTestId('cup-team').boundingBox())!;
    const tv = await size(page.getByTestId('copy-view'));
    expect(Math.abs(tv.w / 4 - t.width)).toBeLessThan(3);
    expect(Math.abs(tv.h / 4 - t.height)).toBeLessThan(3);
  });
});

// The fit rule (as round 11's Standings): no vertical scrolling, nothing clipped, text at the List views' size.
test.describe('Cup schedule fits the window', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'fixed window sizes: one desktop project is enough'));

  const measure = (page: Page, sel: string) =>
    page.evaluate((sel) => {
      const view = document.querySelector<HTMLElement>(sel)!;
      const out: string[] = [];
      for (const e of [view, ...view.querySelectorAll<HTMLElement>('*')]) {
        const b = e.getBoundingClientRect();
        if (!b.width && !b.height) continue;
        if (b.bottom > innerHeight + 0.5) out.push(`below the window: ${e.className || e.tagName} (${b.bottom.toFixed(0)})`);
        if (e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== 'visible') out.push(`scrolls / cut off (height): ${e.className}`);
        if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') out.push(`cut off: ${e.className} "${e.textContent}"`);
      }
      const t = view.querySelector('.ck-card .ck-team')!;
      return { scroll: document.documentElement.scrollHeight, win: innerHeight, bottom: Math.round(view.getBoundingClientRect().bottom), out, font: getComputedStyle(t).fontSize, zoom: (t as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1, rows: view.querySelectorAll('.ck-card').length, heights: [...new Set([...view.querySelectorAll('.ck-card')].map((c) => Math.round(c.getBoundingClientRect().height)))], tall: (() => { const cs = [...view.querySelectorAll<HTMLElement>('.ck-card')]; const min = Math.min(...cs.map((c) => c.getBoundingClientRect().height)); return cs.filter((c) => c.getBoundingClientRect().height > min + 1).map((c) => `${c.querySelector('.ck-matchup')!.textContent!.replace(/s+/g, ' ')} | ${c.querySelector('.ck-tags')!.textContent} | card ${c.clientWidth} parts ${[...c.children].map((x) => `${x.className.split(' ')[0]} ${Math.round((x as HTMLElement).offsetWidth)}`).join(', ')}`); })() };
    }, sel);

  for (const size of [{ width: 1920, height: 950 }, { width: 1600, height: 1000 }]) {
    test(`${size.width}×${size.height}: League, every round and knockout night, real and full-Cup data`, async ({ page }) => {
      await page.setViewportSize(size);
      // the League List's row text at this size, to compare
      await page.goto(`${APP}?view=league&layout=list`);
      await expect(page.locator('.ck-card').first()).toBeVisible();
      const ref = await measure(page, '[data-testid="league-list"]');
      for (const data of ['real', 'full Cup'] as const) {
        if (data === 'full Cup') await fullCup(page);
        await openSchedule(page);
        const s = await snapshot(page);
        for (const k of s.keys) {
          await stop(page, k);
          await expect(page.getByTestId('cup-night').locator('.ck-card')).toHaveCount(s.stops[k]!.length);
          const r = await measure(page, '[data-testid="cup-league"]');
          if (k === 'r2' || k === 'r3') await page.screenshot({ path: `test-output/cupschedule-league-${k}-${size.width}x${size.height}-${data.replace(' ', '-')}.png` });
          console.log(`[cup schedule fit] league ${size.width}×${size.height} ${data} ${k}: ${r.rows} games, view bottom ${r.bottom} / window ${r.win}, row text ${r.font} × ${r.zoom}, row heights ${r.heights.join('/')}`);
          expect(r.scroll, `${k}: page scrolls vertically`).toBeLessThanOrEqual(r.win);
          expect(r.out, k).toEqual([]);
          expect(r.heights, `${k}: every row one line ${r.tall.join(' / ')}`).toHaveLength(1);
          expect([r.font, r.zoom], 'rows at the League List’s size').toEqual([ref.font, ref.zoom]);
        }
      }
      // a knockout night (full Cup: one quarterfinal decided and final, the other still TBD): for the report
      await page.getByRole('tablist', { name: 'Round', exact: true }).getByRole('tab', { name: 'Quarterfinals' }).click();
      await page.screenshot({ path: `test-output/cupschedule-knockout-${size.width}x${size.height}.png` });
    });

    test(`${size.width}×${size.height}: Team with every Cup game possible (4 group + QF + SF + Final)`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(`${APP}?view=team&layout=list&team=1610612738`);
      await expect(page.getByTestId('team-list').locator('.ck-card').first()).toBeVisible();
      const ref = await measure(page, '[data-testid="team-list"]');
      await fullCup(page);
      await openSchedule(page, 'team');
      await pickTeam(page, 'Boston Celtics');
      const r = await measure(page, '[data-testid="cup-team"]');
      await page.screenshot({ path: `test-output/cupschedule-team-${size.width}x${size.height}.png` });
      console.log(`[cup schedule fit] team ${size.width}×${size.height}: ${r.rows} games, view bottom ${r.bottom} / window ${r.win}, row text ${r.font}`);
      expect(r.rows).toBe(7);
      expect((await page.getByTestId('top-bar').boundingBox())!.height, 'top bar one row with the Cup switches and the picker').toBeLessThanOrEqual(40);
      expect(r.scroll, 'page scrolls vertically').toBeLessThanOrEqual(r.win);
      expect(r.out).toEqual([]);
      expect([r.font, r.zoom], 'rows at the Team List’s size').toEqual([ref.font, ref.zoom]);
    });
  }
});
