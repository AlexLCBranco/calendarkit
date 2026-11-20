// @vitest-environment jsdom
// CK-26 / CK-27 / CK-28 / CK-31: the Cup label (a link to the Cup page, its group popup), the record link (the team's
// List) and the season-series popup's playoff games of a past season.
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { cupStandingsOf } from '../src/data/cup';
import { cupFocusOf, cupPath, cupPopupData } from '../src/data/cupPopup';
import { pastPlayoffs, playoffLine, seriesKey, type HistSeason } from '../src/data/nbaHistory';
import { pastMeetings, pastStatus, type PastSeasons } from '../src/data/pastSeries';
import { CupLabel, CupLinkContext, CupPopupBody, cupLinkTarget, cupPageUrl } from '../src/slate/cupLink';
import { SlateDay } from '../src/slate/SlateCard';
import { TeamLinkContext, teamCalendarUrl, teamLinkTarget, teamListTip } from '../src/slate/teamLink';
import { data } from './feed';

afterEach(cleanup);

const groupGame = data.games.find((g) => g.isCupGroupGame)!;
const knockout = data.games.find((g) => g.isCupKnockout)!;
const plain = data.games.find((g) => !g.isCupGroupGame && !g.isCupKnockout && g.gameType === 'regular')!;

describe('CK-26: where a Cup label leads', () => {
  it('a group game: its group; a knockout game: the bracket; another game: nowhere', () => {
    expect(cupFocusOf(groupGame)).toEqual({ kind: 'group', group: groupGame.gameSubLabel });
    expect(cupFocusOf(knockout)).toEqual({ kind: 'bracket' });
    expect(cupFocusOf(plain)).toBeUndefined();
  });
  it('the address: Groups on that group, the Simulator on the bracket', () => {
    expect(cupPageUrl({ kind: 'group', group: 'West Group A' }, '/calendar/')).toBe('/calendar/?view=cup&cg=West+Group+A');
    expect(cupPageUrl({ kind: 'bracket' }, '/calendar/')).toBe('/calendar/?view=cup&cup=simulator&cg=bracket');
  });
  it('under a provider the label is a link (found by cupLinkTarget); without one, the plain label', () => {
    const linked = render(
      <CupLinkContext.Provider value={{ href: (f) => cupPageUrl(f, '/x/') }}>
        <CupLabel game={groupGame} className="ck-tag ck-cup" long="NBA Cup">
          Cup
        </CupLabel>
      </CupLinkContext.Provider>,
    );
    const a = linked.getByTestId('cup-label');
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe(cupPageUrl(cupFocusOf(groupGame)!, '/x/'));
    expect(a.getAttribute('aria-label')).toBe('NBA Cup. Open the NBA Cup page');
    expect(cupLinkTarget(a)).toEqual({ a, gameId: groupGame.gameId });
    cleanup();
    const bare = render(
      <CupLabel game={groupGame} className="ck-tag ck-cup" long="NBA Cup">
        Cup
      </CupLabel>,
    );
    expect(bare.getByTestId('cup-label').tagName).toBe('SPAN');
    expect(cupLinkTarget(bare.getByTestId('cup-label'))).toBeUndefined();
  });
  it('a Slate card of a Cup night carries the label for its game', () => {
    const el = render(
      <CupLinkContext.Provider value={{ href: (f) => cupPageUrl(f) }}>
        <SlateDay data={data} date={groupGame.dateEt} />
      </CupLinkContext.Provider>,
    );
    const label = el.container.querySelector(`[data-game-id="${groupGame.gameId}"] [data-testid="cup-label"]`)!;
    expect(label.getAttribute('data-cup-link')).toBe(groupGame.gameId);
    expect(label.getAttribute('data-cup-pop')).toBe(groupGame.gameId);
  });
});

describe('CK-27: the popup of a group game', () => {
  it('its data is the Cup standings\' table of that group, the two teams marked', () => {
    const d = cupPopupData(data, groupGame.gameId)!;
    expect(d.kind).toBe('groups');
    if (d.kind !== 'groups') return;
    const table = cupStandingsOf(data).standings.groups.find((g) => g.group === groupGame.gameSubLabel)!;
    expect(d.tables).toEqual([table]);
    expect(d.teams.sort()).toEqual([groupGame.awayTeam.teamId, groupGame.homeTeam.teamId].sort());
  });
  it('rendered: five teams in the standings\' order with W-L and differential, the game\'s two highlighted', () => {
    const el = render(<CupPopupBody data={data} gameId={groupGame.gameId} linked />);
    const table = cupStandingsOf(data).standings.groups.find((g) => g.group === groupGame.gameSubLabel)!;
    const rows = [...el.container.querySelectorAll('tbody tr')];
    expect(rows.map((r) => r.getAttribute('data-team'))).toEqual(table.teams.map((t) => t.tricode));
    expect(rows.map((r) => r.querySelector('.ck-cuppop-rec')!.textContent)).toEqual(table.teams.map((t) => `${t.w}-${t.l}`));
    expect(rows.filter((r) => r.hasAttribute('data-on')).map((r) => r.getAttribute('data-team')).sort()).toEqual([groupGame.awayTeam.teamTricode, groupGame.homeTeam.teamTricode].sort());
    expect(el.getByTestId('cup-pop-foot').textContent).toBe('Click the label: Open the NBA Cup page');
  });
  it('a knockout game: each decided team\'s way through the Cup (none while the teams are not decided)', () => {
    const d = cupPopupData(data, knockout.gameId)!;
    expect(d.kind).toBe('knockout');
    if (d.kind === 'knockout') expect(d.paths.length).toBe([knockout.homeTeam.teamId, knockout.awayTeam.teamId].filter(Boolean).length);
    const path = cupPath(data, groupGame.homeTeam.teamId);
    expect(path[0]!.round).toBe('Group play');
    expect(path[0]!.text).toMatch(/^\d(st|nd|rd|th) in (West|East) [ABC], \d-\d/);
  });
  it('a game that is not a Cup game has no popup', () => {
    expect(cupPopupData(data, plain.gameId)).toBeUndefined();
  });
});

describe('CK-28: a record is the team\'s List', () => {
  it('the Slate\'s record is a team link with view "list" and the tooltip "All BOS games"', () => {
    const hrefs: [number, string | undefined][] = [];
    const el = render(
      <TeamLinkContext.Provider value={{ href: (id, view) => (hrefs.push([id, view]), teamCalendarUrl(id, '2026-10-21', '/calendar/', view)) }}>
        <SlateDay data={data} date={data.dates[1]!} />
      </TeamLinkContext.Provider>,
    );
    const rec = el.container.querySelector<HTMLAnchorElement>('a[data-testid="slate-rec"]')!;
    const tri = rec.closest('.ck-slate-row')!.querySelector('[data-tricode]')!.getAttribute('data-tricode')!;
    expect(rec.getAttribute('data-team-view')).toBe('list');
    expect(rec.getAttribute('href')).toContain('layout=list');
    expect(rec.getAttribute('data-tip')!.split('\n')[0]).toBe(`All ${tri} games`);
    expect(teamLinkTarget(rec)!.view).toBe('list');
    // the name stays the team's Calendar
    const name = rec.closest('.ck-slate-row')!.querySelector<HTMLAnchorElement>('a.ck-slate-name')!;
    expect(teamLinkTarget(name)!.view).toBe('calendar');
    expect(name.getAttribute('href')).toContain('layout=calendar');
  });
  it('the tooltip text and a host\'s URL', () => {
    expect(teamListTip('BOS')).toBe('All BOS games');
    expect(teamCalendarUrl(1610612738, '2026-11-20', '/calendar/', 'list')).toBe('/calendar/?view=team&layout=list&team=BOS&on=2026-11-20');
  });
});

describe('CK-31: a past season\'s playoff games between two teams', () => {
  const season = JSON.parse(readFileSync('public/data/history/2026.json', 'utf8')) as HistSeason;
  const past = JSON.parse(readFileSync('public/data/past-seasons.json', 'utf8')) as PastSeasons;
  it('DET – ORL in 2025-26: both groups, counted apart', () => {
    const regular = pastMeetings(past, '2025-26', 'DET', 'ORL');
    const po = pastPlayoffs(season, 'ORL', 'DET');
    expect(po.year).toBe(2026);
    expect(po.series).toBeDefined();
    expect(po.series!.round).toBe(1);
    expect(po.series!.games).toHaveLength(po.series!.wins[0] + po.series!.wins[1]);
    expect(playoffLine(po.series!)).toBe(`Playoffs · East 1st round · ${po.series!.winner} won ${Math.max(...po.series!.wins)}-${Math.min(...po.series!.wins)}`);
    expect(seriesKey(po.series!)).toBe(`1|${po.series!.a}|${po.series!.b}`);
    // the regular-season count never includes them
    expect(regular.length).toBeGreaterThan(0);
    const days = new Set(regular.map((g) => g[0]));
    for (const g of po.series!.games) expect(days.has(g.date)).toBe(false);
    expect(pastStatus(regular, 'DET', 'ORL')).toMatch(/^(DET|ORL) won \d–\d$|^Series split/);
  });
  it('a play-in meeting is found; a pair that never met in the playoffs has none', () => {
    const g = season.playIn[0]!;
    expect(pastPlayoffs(season, g.home, g.away).playIn.map((x) => x.id)).toContain(g.id);
    const none = pastPlayoffs(season, 'DET', 'DET');
    expect(none.series).toBeUndefined();
    expect(none.playIn).toEqual([]);
  });
  it('the Finals line has no conference', () => {
    const f = season.series.find((s) => s.round === 4)!;
    expect(playoffLine(f)).toBe(`Playoffs · NBA Finals · ${f.winner} won ${Math.max(...f.wins)}-${Math.min(...f.wins)}`);
  });
});
