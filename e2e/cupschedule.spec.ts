// Cup → Schedule against the served snapshot. League (round 18): By group (6 panels = each group's 10 games in date order
// with dates, teams and results; the knockout column) and By date (the strip = the Cup and knockout nights as dates; every
// night = its Cup games grouped by group, no game twice); fatigue marks from the whole schedule with one legend line; the
// row tooltip (group game numbers, season series). Team (round 12, unchanged): Played / Remaining. Copies and the marquee,
// and the fit rule — all 67 games with no vertical scrolling at 1920 × 950 and 1600 × 1000, every row one line, text at
// the List views' size. A "full Cup" version of the snapshot (every group game final, BOS through to the Final, a non-Cup
// game added on a quarterfinal night) stands in for the knockout games the feed hasn't filled in yet.

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
 * dates; the six groups' games and the Cup nights (group and knockout), each in date and tip-off order; what each Cup row
 * must show (date, tricodes, the result or the local tip-off: the page's own time zone, America/Sao_Paulo).
 */
const snapshot = (page: Page) =>
  page.evaluate(async (app) => {
    const raw = await (await fetch(`${app}data/schedule.json`)).json();
    const tip = (g: RawGame) => (g.gameStatusText === 'TBD' ? 'Z' : g.gameDateTimeUTC); // a TBD time sorts last, as in the app
    const games = (raw.leagueSchedule.gameDates as { games: RawGame[] }[])
      .flatMap((d) => d.games)
      .filter((g) => /^00[2456]/.test(g.gameId))
      .sort((a, b) => a.gameDateEst.localeCompare(b.gameDateEst) || tip(a).localeCompare(tip(b)) || a.gameId.localeCompare(b.gameId));
    const groups: Record<string, string[]> = {};
    const nights: Record<string, string[]> = {};
    const knockout: Record<string, string[]> = { Quarterfinal: [], Semifinal: [], Championship: [] };
    const dates: Record<string, string[]> = {};
    const date: Record<string, string> = {};
    const tri: Record<string, [string, string]> = {};
    const result: Record<string, string> = {};
    const pill: Record<string, string> = {};
    const local = (iso: string) => new Date(iso).toLocaleDateString('en-CA'); // YYYY-MM-DD in the page's zone
    for (const g of games) {
      const d = g.gameDateEst.slice(0, 10);
      for (const t of [g.homeTeam, g.awayTeam]) if (t.teamTricode) (dates[t.teamTricode] ??= []).push(d);
      if (!/^in-season/.test(g.gameSubtype)) continue;
      date[g.gameId] = d;
      tri[g.gameId] = [g.awayTeam.teamTricode ?? 'TBD', g.homeTeam.teamTricode ?? 'TBD'];
      (nights[d] ??= []).push(g.gameId);
      if (g.gameSubtype === 'in-season') {
        (groups[g.gameSubLabel] ??= []).push(g.gameId);
        pill[g.gameId] = g.gameSubLabel.replace(' Group ', ' ');
      } else knockout[g.gameSubLabel]!.push(g.gameId); // no pill: the night's heading names the round
      const ot = /^Final\/(\d*OT)$/i.exec(g.gameStatusText)?.[1];
      if (g.gameStatus === 3) result[g.gameId] = `${g.awayTeam.score}–${g.homeTeam.score}${ot ? ` ${ot}` : ''}`;
      else if (g.gameStatusText === 'TBD' || !g.gameDateTimeUTC) result[g.gameId] = 'TBD';
      else {
        const time = new Date(g.gameDateTimeUTC).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        const off = Math.round((Date.parse(`${local(g.gameDateTimeUTC)}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 864e5);
        result[g.gameId] = off ? `${time} (${off > 0 ? '+' : ''}${off})` : time;
      }
    }
    return { groups, nights, knockout, dates, date, tri, result, pill, nightKeys: Object.keys(nights).sort() };
  }, APP);

async function openSchedule(page: Page, list: 'league' | 'team' | 'date' = 'league') {
  await page.goto(`${APP}?view=cup`);
  await page.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click();
  if (list === 'team') await page.getByRole('tablist', { name: 'Cup list' }).getByRole('tab', { name: 'Team' }).click();
  else {
    await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'group');
    if (list === 'date') {
      await page.getByRole('tablist', { name: 'Cup layout' }).getByRole('tab', { name: 'By date' }).click();
      await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'date');
    }
  }
  await page.evaluate(() => document.fonts.ready);
}
const pickTeam = async (page: Page, name: string) => {
  await page.getByTestId('team-picker').click();
  await page.getByRole('option', { name }).click();
  await expect(page.getByTestId('cup-team')).toBeVisible();
};
const rowIds = (scope: Locator) => scope.locator('[data-game-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-game-id')!));
/** What each row shows: id, date cell, matchup, result cell, pill (By date). */
const rowsOf = (scope: Locator) =>
  scope.locator('.ck-cg').evaluateAll((els) =>
    els.map((e) => {
      const t = (s: string) => e.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim();
      return { id: e.getAttribute('data-game-id')!, date: t('.ck-cg-date'), match: t('.ck-cg-match'), result: t('[data-testid="cup-result"]'), pill: t('.ck-cg-pill') };
    }),
  );
/** The Team List's row date, "Fri 06/11". */
const fmtShort = (date: string) => `${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${date.slice(8)}/${date.slice(5, 7)}`;
const GROUPS = ['West Group A', 'West Group B', 'West Group C', 'East Group A', 'East Group B', 'East Group C'];
const PILL_ORDER = ['West A', 'West B', 'West C', 'East A', 'East B', 'East C'];

test.describe('Cup schedule', () => {
  test.beforeEach(({}, info) => test.skip(!desktop(info.project.name), 'desktop only'));

  test('opens on Standings; Schedule on League By group; the switches; not remembered across a reload', async ({ page }) => {
    await page.goto(`${APP}?view=cup`);
    await expect(page.getByTestId('cup-group')).toHaveCount(6);
    await expect(page.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Standings' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click();
    await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'group');
    await expect(page.getByRole('tablist', { name: 'Cup list' }).getByRole('tab', { name: 'League' })).toHaveAttribute('aria-selected', 'true');
    const layout = page.getByRole('tablist', { name: 'Cup layout' });
    await expect(layout.getByRole('tab', { name: 'By group' })).toHaveAttribute('aria-selected', 'true');
    await layout.getByRole('tab', { name: 'By date' }).click();
    await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'date');
    await expect(page.getByTestId('cup-board')).toHaveCount(0);
    await layout.getByRole('tab', { name: 'By group' }).click();
    await expect(page.getByTestId('cup-board')).toBeVisible();
    await layout.getByRole('tab', { name: 'By date' }).click();
    await page.getByRole('tablist', { name: 'Cup list' }).getByRole('tab', { name: 'Team' }).click();
    await expect(page.getByRole('tablist', { name: 'Cup layout' })).toHaveCount(0);
    await expect(page.getByTestId('team-picker')).toHaveText(/Pick a team/);
    await expect(page.getByTestId('cup-pick')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('cup-group')).toHaveCount(6);
    await expect(page.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Standings' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('cup-league')).toHaveCount(0);
    await page.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click();
    await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'group');
  });

  for (const data of ['real', 'full Cup'] as const)
    test(`By group (${data} data): each panel = its group's 10 games in date order, dates / teams / results right; the knockout column`, async ({ page }) => {
      if (data === 'full Cup') await fullCup(page);
      await openSchedule(page);
      const s = await snapshot(page);
      const panels = page.getByTestId('cup-group');
      await expect(panels).toHaveCount(6);
      expect(await panels.evaluateAll((els) => els.map((e) => e.getAttribute('data-group')))).toEqual(GROUPS);
      await expect(panels.locator('.ck-cg-head')).toHaveText(['West A', 'West B', 'West C', 'East A', 'East B', 'East C']);
      const seen: string[] = [];
      for (const [i, grp] of GROUPS.entries()) {
        const rows = await rowsOf(panels.nth(i));
        expect(rows.map((r) => r.id), grp).toEqual(s.groups[grp]);
        expect(rows).toHaveLength(10);
        const ds = rows.map((r) => s.date[r.id]!);
        expect(ds).toEqual([...ds].sort());
        for (const r of rows) {
          expect(r.date).toBe(fmtShort(s.date[r.id]!));
          expect(r.match).toBe(`${s.tri[r.id]![0]} @ ${s.tri[r.id]![1]}`);
          expect(r.result, `${r.id} ${r.match}`).toBe(s.result[r.id]);
        }
        seen.push(...rows.map((r) => r.id));
      }
      expect(new Set(seen).size).toBe(60);
      // the knockout, beside the groups (the fourth column): quarterfinals, then semifinals and the Final
      for (const [t, k] of [['cup-qf', 'Quarterfinal'], ['cup-sf', 'Semifinal'], ['cup-final', 'Championship']] as const) {
        const rows = await rowsOf(page.getByTestId(t));
        expect(rows.map((r) => r.id)).toEqual(s.knockout[k]);
        for (const r of rows) expect([r.match, r.result]).toEqual([`${s.tri[r.id]![0]} @ ${s.tri[r.id]![1]}`, s.result[r.id]]);
      }
      const ko = (await page.getByTestId('cup-knockout').boundingBox())!;
      const westC = (await panels.nth(2).boundingBox())!;
      expect(ko.x).toBeGreaterThan(westC.x + westC.width - 1);
      expect(Math.abs(ko.y - westC.y)).toBeLessThan(2);
      expect(await rowIds(page.getByTestId('cup-league'))).not.toContain(EXTRA_ID);
    });

  test('By date: the strip = the Cup and knockout nights, all as dates; every night = its Cup games grouped by group, pills beside the teams, no game twice', async ({ page }) => {
    await fullCup(page);
    await openSchedule(page, 'date');
    const s = await snapshot(page);
    const days = page.locator('.ck-cup-strip .ck-strip-day');
    expect(await days.evaluateAll((els) => els.map((e) => e.getAttribute('data-date')))).toEqual(s.nightKeys);
    expect(s.nightKeys).toHaveLength(11);
    for (const t of await days.allTextContents()) expect(t).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Oct|Nov|Dec)\d{1,2}\d{1,2}$/);
    await expect(page.getByTestId('cup-league')).not.toContainText(/Round \d/);
    const nights = page.getByTestId('cup-night');
    expect(await nights.evaluateAll((els) => els.map((e) => e.getAttribute('data-night')))).toEqual(s.nightKeys);
    const all: string[] = [];
    for (const [i, d] of s.nightKeys.entries()) {
      const rows = await rowsOf(nights.nth(i));
      expect(rows.map((r) => r.id).sort(), d).toEqual([...s.nights[d]!].sort());
      const order = rows.map((r) => PILL_ORDER.indexOf(r.pill!));
      expect(order, `${d}: grouped by group`).toEqual([...order].sort((a, b) => a - b));
      for (const r of rows) {
        expect(r.pill).toBe(s.pill[r.id]);
        expect([r.match, r.result]).toEqual([`${s.tri[r.id]![0]} @ ${s.tri[r.id]![1]}`, s.result[r.id]]);
      }
      // within a group, tip-off order
      for (const g of new Set(rows.map((r) => r.pill))) {
        const ids = rows.filter((r) => r.pill === g).map((r) => r.id);
        expect(ids).toEqual(s.nights[d]!.filter((id) => ids.includes(id)));
      }
      all.push(...rows.map((r) => r.id));
    }
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(67);
    expect(all).not.toContain(EXTRA_ID);
    // the pill sits right after the teams (no dead space between)
    const gaps = await page.locator('.ck-cg:has(.ck-cg-pill)').evaluateAll((els) => els.map((e) => e.querySelector('.ck-cg-pill')!.getBoundingClientRect().left - e.querySelector('.ck-cg-match')!.getBoundingClientRect().right));
    expect(Math.max(...gaps)).toBeLessThan(20);
    // the strip picks a night: outlined, aria-current; ← / → step it
    await page.locator('.ck-cup-strip .ck-strip-day[data-date="2026-12-04"]').click();
    await expect(page.locator('[data-testid="cup-night"][aria-current="true"]')).toHaveAttribute('data-night', '2026-12-04');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // arrow keys inside a tab row move its focus (the League List's rule)
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-testid="cup-night"][aria-current="true"]')).toHaveAttribute('data-night', '2026-12-05');
    await expect(page.locator('.ck-cup-strip .ck-strip-day[data-date="2026-12-05"]')).toHaveAttribute('aria-selected', 'true');
  });

  test('real snapshot: undecided knockout sides read "TBD"; back-to-backs counted over the whole schedule; one legend line', async ({ page }) => {
    await openSchedule(page);
    const s = await snapshot(page);
    const prevDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
    const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
    const cupOn = (t: string, d: string) => Object.keys(s.date).some((id) => s.date[id] === d && s.tri[id]!.includes(t));
    for (const by of ['group', 'date'] as const) {
      if (by === 'date') {
        await page.getByRole('tablist', { name: 'Cup layout' }).getByRole('tab', { name: 'By date' }).click();
        await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'date');
      }
      let flagged = 0;
      let fromNonCup = 0;
      // the marks on the tricodes (yellow fill = 2nd night, yellow outline = 1st), the League views' standard
      const rows = await page.locator('.ck-cg').evaluateAll((els) =>
        els.map((e) => ({
          id: e.getAttribute('data-game-id')!,
          nights: [...e.querySelectorAll<HTMLElement>('.ck-cg-match .ck-team')].map((t) => {
            const m = t.querySelector('.ck-fm');
            return m?.classList.contains('ck-fm-n2') ? '2' : m?.classList.contains('ck-fm-n1') ? '1' : '';
          }),
          teams: e.querySelector('.ck-cg-match')!.textContent!.replace(/\s+/g, ' ').trim(),
        })),
      );
      expect(rows).toHaveLength(67);
      for (const r of rows) {
        const [away, home] = s.tri[r.id]!;
        const d = s.date[r.id]!;
        if (away === 'TBD' && home === 'TBD') {
          expect(r.teams).toBe('TBD @ TBD');
          continue;
        }
        const expected = [away, home].map((t) => (s.dates[t]!.includes(prevDay(d)) ? '2' : s.dates[t]!.includes(nextDay(d)) ? '1' : ''));
        expect(r.nights, `${d} ${away} @ ${home}`).toEqual(expected);
        for (const [i, t] of [away, home].entries())
          if (expected[i]) {
            flagged++;
            if (!cupOn(t, expected[i] === '2' ? prevDay(d) : nextDay(d))) fromNonCup++;
          }
      }
      console.log(`[cup schedule] ${by}: ${flagged} back-to-back marks on Cup rows, ${fromNonCup} of them paired with a non-Cup game`);
      expect(fromNonCup).toBeGreaterThan(0);
      await expect(page.getByTestId('fatigue-legend')).toHaveCount(1);
      await expect(page.getByTestId('fatigue-legend')).toHaveText(/2nd night · .*1st night · .*changed cities · 3-in-4/);
      // nothing else drawn on the teams: every outline / underline is a fatigue mark the legend names
      const odd = await page.locator('.ck-cg-match').evaluateAll((els) =>
        els.flatMap((m) => [...m.querySelectorAll<HTMLElement>('*')]).filter((e) => {
          const c = getComputedStyle(e);
          return (c.textDecorationLine !== 'none' || c.outlineStyle !== 'none') && !e.matches('.ck-fm-n1, .ck-fm-n2, .ck-fm-tif');
        }).map((e) => e.outerHTML.slice(0, 80)),
      );
      expect(odd).toEqual([]);
    }
  });

  test('the tooltip: each team’s group game number and the season series, no chip on the row', async ({ page }) => {
    await openSchedule(page);
    const s = await snapshot(page);
    const count: Record<string, number> = {};
    const want: Record<string, string> = {};
    for (const id of Object.values(s.groups).flat().sort((a, b) => Object.keys(s.date).indexOf(a) - Object.keys(s.date).indexOf(b))) {
      const [a, h] = s.tri[id]!;
      const na = (count[a] = (count[a] ?? 0) + 1);
      const nh = (count[h] = (count[h] ?? 0) + 1);
      const o = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`;
      want[id] = na === nh ? `Both teams' ${o(na)} group game` : `${a}'s ${o(na)} group game, ${h}'s ${o(nh)}`;
    }
    const tips = await page.locator('[data-testid="cup-group"] .ck-cg').evaluateAll((els) => els.map((e) => [e.getAttribute('data-game-id')!, e.getAttribute('data-tip')!] as const));
    let split = 0;
    for (const [id, tip] of tips) {
      expect(tip.split('\n')[2], id).toBe(want[id!]);
      expect(tip).toMatch(/\nSeason series: G\d\/\d · /);
      if (!want[id!]!.startsWith('Both')) split++;
    }
    expect(split).toBe(16);
    await expect(page.locator('[data-testid="cup-league"] .ck-series, [data-testid="cup-league"] [data-testid="series-chip"]')).toHaveCount(0);
    // hover shows it
    const row = page.locator('[data-testid="cup-group"] .ck-cg').first();
    const b = (await row.locator('.ck-cg-date').boundingBox())!;
    await page.mouse.move(b.x + 4, b.y + b.height / 2);
    await expect(page.getByTestId('tooltip')).toContainText('Season series');
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

  test('copies: the whole view (By group, By date, Team); marquee selection', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-xl', 'clipboard checks once');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openSchedule(page);
    const size = async (button: Locator) => {
      await page.evaluate(() => navigator.clipboard.writeText(''));
      await button.click();
      await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 60_000 });
      return page.evaluate(async () => {
        // the image can reach the clipboard a moment after the button shows ✓ (seen on CI, Linux): read until it is there
        let item: ClipboardItem | undefined;
        for (let t = 0; t < 50 && !item; t++) {
          item = (await navigator.clipboard.read()).find((i) => i.types.includes('image/png'));
          if (!item) await new Promise((r) => setTimeout(r, 100));
        }
        if (!item) throw new Error('no image/png on the clipboard after 5 s');
        const bmp = await createImageBitmap(await item.getType('image/png'));
        return { w: bmp.width, h: bmp.height };
      });
    };
    /** The copy = the view's whole content (every panel / night and the legend), at 4× its size on screen. */
    const copiesAll = async () => {
      const copy = page.getByTestId('cup-league').getByTestId('cup-copy');
      const box = (await copy.boundingBox())!;
      const all = await copy.evaluate((c) => {
        const r = c.getBoundingClientRect();
        return [...c.querySelectorAll('.ck-cg, [data-testid="fatigue-legend"]')].every((e) => {
          const b = e.getBoundingClientRect();
          return b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5 && b.left >= r.left - 0.5 && b.right <= r.right + 0.5;
        });
      });
      expect(all, 'every row and the legend inside the copied node').toBe(true);
      const view = await size(page.getByTestId('copy-view'));
      expect(Math.abs(view.w / 4 - box.width)).toBeLessThan(3);
      expect(Math.abs(view.h / 4 - box.height)).toBeLessThan(3);
      return view;
    };
    await expect(page.getByTestId('cup-league').getByTestId('cup-copy').locator('.ck-cg')).toHaveCount(67);
    await copiesAll();
    // marquee: a drag across the first three rows of West A
    const rows = page.getByTestId('cup-group').first().locator('.ck-cg');
    const a = (await rows.nth(0).boundingBox())!;
    const c = (await rows.nth(2).boundingBox())!;
    await page.mouse.move(a.x + 6, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + 60, c.y + c.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByTestId('selection-count')).toHaveText('3 games selected');
    const sel = await size(page.getByTestId('copy-selection'));
    expect(sel.h).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    // By date: every night
    await page.getByRole('tablist', { name: 'Cup layout' }).getByRole('tab', { name: 'By date' }).click();
    await expect(page.getByTestId('cup-league')).toHaveAttribute('data-by', 'date');
    await expect(page.getByTestId('cup-league').getByTestId('cup-copy').locator('[data-testid="cup-night"]')).toHaveCount(11);
    await copiesAll();
    // Team list: the whole view = the team's header and its sections
    await page.getByRole('tablist', { name: 'Cup list' }).getByRole('tab', { name: 'Team' }).click();
    await pickTeam(page, 'Boston Celtics');
    const t = (await page.getByTestId('cup-team').boundingBox())!;
    const tv = await size(page.getByTestId('copy-view'));
    expect(Math.abs(tv.w / 4 - t.width)).toBeLessThan(3);
    expect(Math.abs(tv.h / 4 - t.height)).toBeLessThan(3);
  });
});

// The fit rule (as round 11's Standings): no vertical scrolling, nothing clipped, every row one line, text at the List
// views' size.
test.describe('Cup schedule fits the window', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'fixed window sizes: one desktop project is enough'));

  const measure = (page: Page, sel: string, row = '.ck-card') =>
    page.evaluate(
      ([sel, row]) => {
        const view = document.querySelector<HTMLElement>(sel!)!;
        const out: string[] = [];
        for (const e of [view, ...view.querySelectorAll<HTMLElement>('*')]) {
          const b = e.getBoundingClientRect();
          if (!b.width && !b.height) continue;
          if (b.bottom > innerHeight + 0.5) out.push(`below the window: ${e.className || e.tagName} (${b.bottom.toFixed(0)})`);
          if (e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== 'visible') out.push(`scrolls / cut off (height): ${e.className}`);
          if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') out.push(`cut off: ${e.className} "${e.textContent}"`);
        }
        const rows = [...view.querySelectorAll<HTMLElement>(row!)];
        // a row's parts never stick out of it (the longest tricodes, 3-digit scores with "2OT", "00:00 (+1)", "Quarterfinal")
        for (const r of rows) {
          const rb = r.getBoundingClientRect();
          const pb = (r.closest('.ck-cg-panel') ?? r).getBoundingClientRect();
          for (const p of r.querySelectorAll<HTMLElement>('*')) {
            const b = p.getBoundingClientRect();
            if (b.width && (b.right > Math.min(rb.right, pb.right) + 0.5 || b.left < rb.left - 0.5)) out.push(`sticks out of its row: ${p.className} "${r.textContent}"`);
          }
        }
        const t = view.querySelector(`${row} .ck-team`)!;
        return { scroll: document.documentElement.scrollHeight, win: innerHeight, bottom: Math.round(view.getBoundingClientRect().bottom), out, font: getComputedStyle(t).fontSize, zoom: (t as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1, rows: rows.length, heights: [...new Set(rows.map((c) => Math.round(c.getBoundingClientRect().height)))] };
      },
      [sel, row],
    );

  for (const size of [{ width: 1920, height: 950 }, { width: 1600, height: 1000 }]) {
    test(`${size.width}×${size.height}: League By group and By date, all 67 games on one screen, real and full-Cup data`, async ({ page }) => {
      await page.setViewportSize(size);
      // the League List's row text at this size, to compare
      await page.goto(`${APP}?view=league&layout=list`);
      await expect(page.locator('.ck-card').first()).toBeVisible();
      const ref = await measure(page, '[data-testid="league-list"]');
      for (const data of ['real', 'full Cup'] as const) {
        if (data === 'full Cup') await fullCup(page);
        for (const by of ['group', 'date'] as const) {
          await openSchedule(page, by === 'date' ? 'date' : 'league');
          await expect(page.getByTestId('cup-league').locator('.ck-cg')).toHaveCount(67);
          const r = await measure(page, '[data-testid="cup-league"]', '.ck-cg');
          await page.screenshot({ path: `test-output/cupschedule-by${by}-${size.width}x${size.height}-${data.replace(' ', '-')}.png` });
          console.log(`[cup schedule fit] by ${by} ${size.width}×${size.height} ${data}: ${r.rows} games, view bottom ${r.bottom} / window ${r.win}, row text ${r.font} × ${r.zoom}, row heights ${r.heights.join('/')}`);
          expect(r.rows).toBe(67);
          expect(r.scroll, `by ${by}: page scrolls vertically`).toBeLessThanOrEqual(r.win);
          expect(r.out, `by ${by}`).toEqual([]);
          expect(r.heights, `by ${by}: every row one line`).toHaveLength(1);
          expect([r.font, r.zoom], 'rows at the League List’s size').toEqual([ref.font, ref.zoom]);
        }
      }
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
