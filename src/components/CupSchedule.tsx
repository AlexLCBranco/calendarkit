// Cup → Schedule (round 12; League list redone in round 18): the NBA Cup's games from the schedule already loaded
// (src/data/cupSchedule.ts).
// League, two layouts (the top bar's "By group | By date", By group first):
//  - By group: six panels (West A/B/C over East A/B/C), each its group's 10 games in date order, and a fourth column with
//    the knockout (quarterfinals; semifinals + Final). Every game on one screen, no scrolling.
//  - By date: the strip of every Cup night (group and knockout, all dates), ‹ › and ← / → step them; the night's games
//    grouped by group, the group pill beside the teams.
//  Rows are compact (one line): the tricodes carry the League views' fatigue marks (FatigueMark: yellow back-to-back,
//  purple 3-in-4) with one legend line; the teams are team links, the game page the shared "↗" icon; the rest (each
//  team's group game number, season series, national TV) is in the row's tooltip.
// Team: one team's Cup games under "Played" and "Remaining", drawn with the Team List (unchanged since round 12).
// Fatigue and records come from the whole schedule (leagueFatigue reads `data`, not the Cup games). Part of the Cup
// view's chunk; nothing here runs until the Schedule tab is opened.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cupTag, finalScore, nationalTv, overtime, teamLabel, tipoff, type CalendarData } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { cupBoard, cupNightHeading, cupNights, cupOpeningNight, cupTeamTag, type CupNight, groupNumberLine, groupShort, nightByGroup, teamCupGames } from '../data/cupSchedule';
import { leagueFatigue, type TeamFatigue } from '../data/fatigue';
import { GameLinkIcon, TeamLogo, TipTime } from '../slate/parts';
import { seriesLine } from '../slate/series';
import { TeamLink } from '../slate/teamLink';
import type { GameLink } from './GameCard';
import { FatigueLegend, FatigueMark } from './FatigueMark';
import { TeamHeader } from './TeamHeader';
import { rowDate, TeamListView } from './TeamListView';
import { WeekStrip } from './WeekStrip';
import { fmtDate, leagueZoom, plural, type WidgetSize } from './widget';

export type CupLayout = 'group' | 'date';

export interface CupScheduleProps {
  data: CalendarData;
  list: 'league' | 'team';
  /** League list: By group (the default) or By date. */
  by?: CupLayout;
  /** Team list: the picked team; none until one is picked (no default, nothing remembered). */
  teamId?: number;
  size: WidgetSize;
  now: number;
  /** Local date (the clock's): By date opens on the Cup night of today, else the next one. */
  today: string;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  gameLink?: GameLink;
  /** By date: told the night on show (the host clears a marquee selection when it changes). */
  onNight?: (date: string) => void;
}

export default function CupSchedule(p: CupScheduleProps) {
  if (p.list === 'team') return <CupTeam {...p} />;
  return p.by === 'date' ? <CupByDate {...p} /> : <CupByGroup {...p} />;
}

type Fatigue = Map<string, Map<number, TeamFatigue>>;

/** The row's tooltip: date and matchup, result or tip-off, each team's group game number, season series, TV, the Cup stage. */
function rowTip(data: CalendarData, g: ScheduleGame, timeZone?: string) {
  const away = teamLabel(g.awayTeam);
  const home = teamLabel(g.homeTeam);
  const r = finalScore(g, g.awayTeam.teamId);
  const ot = r && overtime(g);
  const tip = tipoff(g, timeZone);
  const tv = nationalTv(g);
  const stage = g.isCupGroupGame ? `Group play · ${groupShort(g.gameSubLabel)}` : cupTag(g);
  return [
    `${fmtDate(g.dateEt, { weekday: 'short', month: 'short', day: 'numeric' })} · ${away} @ ${home} · ${stage}`,
    r ? `Final: ${away} ${r.score}, ${home} ${r.oppScore}${ot ? ` (${ot})` : ''}` : tip.tbd ? 'Tip-off: TBD' : `Tip-off: ${tip.label}`,
    groupNumberLine(data, g),
    seriesLine(data, g),
    tv.length ? `US national TV: ${tv.join(' · ')}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * One game on one line. By group: date · matchup · score or time · ↗. By date: time or score · matchup · group pill · ↗.
 * The cells sit in the list's grid columns (subgrid), so every row of a list lines up.
 */
function CupRow({ g, data, fatigue, by, pill, timeZone, gameLink, groupStart }: { g: ScheduleGame; data: CalendarData; fatigue: Fatigue; by: CupLayout; pill?: string; timeZone?: string; gameLink?: GameLink; groupStart?: boolean }) {
  const r = finalScore(g, g.awayTeam.teamId);
  const ot = r && overtime(g);
  const tip = tipoff(g, timeZone);
  const f = fatigue.get(g.gameId);
  const url = gameLink?.(g);
  // an undecided side is plain text (no team to link to)
  const team = (t: ScheduleGame['homeTeam'], win: boolean) => !t.teamId ? <span className="ck-cg-tbd">TBD</span> : (
    <TeamLink teamId={t.teamId} className={`ck-team${r ? (win ? ' ck-win' : ' ck-loss') : ''}`}>
      {f?.get(t.teamId) ? <FatigueMark f={f.get(t.teamId)}>{teamLabel(t)}</FatigueMark> : teamLabel(t)}
    </TeamLink>
  );
  const result = (
    <span className={`ck-cg-res${r ? '' : ' ck-cg-time'}${!r && tip.tbd ? ' ck-tbd' : ''}`} data-testid="cup-result">
      {r ? (
        <>
          <span className={r.win ? 'ck-score-win' : undefined}>{r.score}</span>–<span className={r.win ? undefined : 'ck-score-win'}>{r.oppScore}</span>
          {ot && <span className="ck-ot"> {ot}</span>}
        </>
      ) : (
        <TipTime tip={tip} />
      )}
    </span>
  );
  const label = `${teamLabel(g.awayTeam)} at ${teamLabel(g.homeTeam)}, ${fmtDate(g.dateEt, { month: 'short', day: 'numeric' })}, ${r ? `final ${r.score}–${r.oppScore}${ot ? ` (${ot})` : ''}` : tip.label}`;
  return (
    <article className={`ck-cg${r ? ' ck-cg-final' : ''}${groupStart ? ' ck-cg-newgroup' : ''}`} data-game-id={g.gameId} data-tip={rowTip(data, g, timeZone)} aria-label={label}>
      {by === 'group' ? <span className="ck-cg-date">{rowDate(g.dateEt)}</span> : result}
      <span className="ck-cg-match">
        <TeamLogo team={g.awayTeam} />
        {team(g.awayTeam, !!r?.win)} <span className="ck-vsat">@</span> {team(g.homeTeam, !!r && !r.win)}
        <TeamLogo team={g.homeTeam} />
      </span>
      {by === 'group' ? result : pill ? <span className="ck-tag ck-cup ck-cg-pill">{pill}</span> : <span />}
      <span className="ck-cg-link">{url && <GameLinkIcon url={url} />}</span>
    </article>
  );
}

const zoomStyle = (width: number) => {
  const zoom = leagueZoom(width);
  return { zoom, width: Math.floor(width / zoom) } as CSSProperties;
};

/** "Dec 4 – 5", "Dec 8": the ET dates a set of games spans. */
const span = (games: ScheduleGame[]) => {
  if (!games.length) return '';
  const a = games[0]!.dateEt;
  const b = games.at(-1)!.dateEt;
  const md = (d: string) => fmtDate(d, { month: 'short', day: 'numeric' });
  return a === b ? md(a) : a.slice(0, 7) === b.slice(0, 7) ? `${md(a)} – ${Number(b.slice(8))}` : `${md(a)} – ${md(b)}`;
};

function Panel({ title, games, testId, group, ...row }: { title: string; games: ScheduleGame[]; testId: string; group?: string; data: CalendarData; fatigue: Fatigue; timeZone?: string; gameLink?: GameLink }) {
  return (
    <section className="ck-cg-panel" data-testid={testId} data-group={group} aria-label={title}>
      <h3 className="ck-cg-head">{title}</h3>
      <div className="ck-cg-list">
        {games.length ? games.map((g) => <CupRow key={g.gameId} g={g} by="group" {...row} />) : <p className="ck-cg-none">Not in the schedule yet</p>}
      </div>
    </section>
  );
}

function CupByGroup({ data, size, timeZone, gameLink }: CupScheduleProps) {
  const board = useMemo(() => cupBoard(data), [data]);
  const fatigue = leagueFatigue(data); // once per data set
  if (!board.groups.length) return <p className="ck-empty">The schedule has no Cup games.</p>;
  const row = { data, fatigue, timeZone, gameLink };
  const panel = (i: number) => {
    const grp = board.groups[i];
    return grp ? <Panel key={grp.label} title={groupShort(grp.label)} games={grp.games} testId="cup-group" group={grp.label} {...row} /> : <div key={i} />;
  };
  const ko = (title: string, games: ScheduleGame[], testId: string) => <Panel title={games.length ? `${title} · ${span(games)}` : title} games={games} testId={testId} {...row} />;
  return (
    <section className="ck-cup-sched ck-cup-bygroup" aria-label="NBA Cup schedule by group" data-testid="cup-league" data-by="group" style={zoomStyle(size.width)}>
      <div className="ck-cup-copy" data-testid="cup-copy">
        <div className="ck-cup-board" data-testid="cup-board" data-select-scroller>
          {[0, 1, 2].map(panel)}
          <div className="ck-cg-ko" data-testid="cup-knockout">
            {ko('Quarterfinals', board.qf, 'cup-qf')}
          </div>
          {[3, 4, 5].map(panel)}
          <div className="ck-cg-ko">
            {ko('Semifinals', board.sf, 'cup-sf')}
            {ko('Final', board.final, 'cup-final')}
          </div>
          {board.groups.slice(6).map((_, k) => panel(6 + k))}
        </div>
        <FatigueLegend />
      </div>
    </section>
  );
}

function CupByDate({ data, size, today, timeZone, gameLink, onNight }: CupScheduleProps) {
  const nights = useMemo(() => cupNights(data), [data]);
  const fatigue = leagueFatigue(data);
  const [date, setDate] = useState(() => cupOpeningNight(nights, today));
  const i = nights.findIndex((n) => n.date === date);
  const n = nights[i];
  const onNightRef = useRef(onNight);
  onNightRef.current = onNight;
  useEffect(() => void (date && onNightRef.current?.(date)), [date]);

  const go = (k: number) => nights[k] && setDate(nights[k].date);
  // ← / → step the nights, with the League List's rules (not in a field, a tab row, a listbox, an open picker, or with a modifier)
  const goRef = useRef(go);
  goRef.current = go;
  const at = useRef(i);
  at.current = i;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"], [role="tablist"], [role="listbox"], [role="grid"], [role="dialog"]')) return;
      e.preventDefault();
      goRef.current(at.current + (e.key === 'ArrowLeft' ? -1 : 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const strip = useMemo(() => nights.map((x) => ({ date: x.date, sub: String(x.games.length), disabled: false })), [nights]);
  // one card per group night; the knockout nights (2, 2, 2, 1 games) share one card, so every night fits the window
  const cards = useMemo(() => {
    const out: { night: CupNight; games: ScheduleGame[] }[][] = [];
    for (const x of nights) {
      const item = { night: x, games: nightByGroup(x) };
      const last = out.at(-1);
      if (x.round !== 'group' && last && last[0]!.night.round !== 'group') last.push(item);
      else out.push([item]);
    }
    return out;
  }, [nights]);
  if (!n) return <p className="ck-empty">The schedule has no Cup games.</p>;
  // the group pill; a knockout row has none (its night's heading names the round, and the pill would not fit at 1600 px)
  const pillOf = (g: ScheduleGame) => (g.isCupGroupGame ? groupShort(g.gameSubLabel) : undefined);
  return (
    <section className="ck-cup-sched ck-cup-bydate" aria-label="NBA Cup schedule by date" data-testid="cup-league" data-by="date" data-night={n.date} style={zoomStyle(size.width)}>
      <div className="ck-cup-strip" style={{ '--ck-nights': nights.length } as CSSProperties}>
        <WeekStrip days={strip} selected={n.date} today={today} onPick={setDate} onPrev={() => go(i - 1)} onNext={() => go(i + 1)} prevDisabled={i <= 0} nextDisabled={i >= nights.length - 1} unit="night" label="Cup nights" />
      </div>
      <div className="ck-cup-copy" data-testid="cup-copy">
        {/* every night at once, in date order down four balanced columns; the strip's night is outlined */}
        <div className="ck-cup-nights" data-select-scroller>
          {cards.map((card) => (
            <div key={card[0]!.night.date} className={`ck-cg-panel ck-cg-card${card.length > 1 ? ' ck-cg-kocard' : ''}`}>
              {card.map(({ night, games }) => (
                <section key={night.date} className={`ck-cg-night${night.date === n.date ? ' ck-cg-picked' : ''}`} data-testid="cup-night" data-night={night.date} aria-label={cupNightHeading(night)} aria-current={night.date === n.date || undefined}>
                  <h3 className="ck-cg-head">
                    {cupNightHeading(night)} · {plural(games.length)}
                  </h3>
                  <div className="ck-cg-list">
                    {games.map((g, k) => (
                      <CupRow key={g.gameId} g={g} data={data} fatigue={fatigue} by="date" pill={pillOf(g)} timeZone={timeZone} gameLink={gameLink} groupStart={k > 0 && pillOf(games[k - 1]!) !== pillOf(g)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ))}
        </div>
        <FatigueLegend />
      </div>
    </section>
  );
}

function CupTeam({ data, teamId, size, now, timeZone, onOpenGame, gameLink }: CupScheduleProps) {
  const games = useMemo(() => (teamId === undefined ? undefined : teamCupGames(data, teamId)), [data, teamId]);
  const teamTag = useMemo(() => (teamId === undefined ? undefined : cupTeamTag(data, teamId)), [data, teamId]);
  const ids = useMemo(() => games && { played: new Set(games.played.map((g) => g.gameId)), remaining: new Set(games.remaining.map((g) => g.gameId)) }, [games]);
  if (teamId === undefined || !games || !ids)
    return (
      <p className="ck-empty ck-cup-pick" data-testid="cup-pick">
        Pick a team above to see its Cup games.
      </p>
    );
  const rows = { width: size.width, height: 1e6 }; // every row shown: the page never scrolls (at most 7 Cup games)
  return (
    <section className="ck-cup-team" aria-label="NBA Cup games" data-testid="cup-team">
      <TeamHeader teamId={teamId} period="NBA Cup" link />
      {games.played.length > 0 && (
        <div className="ck-cup-section" data-testid="cup-played">
          <h3 className="ck-cup-sec-head">Played</h3>
          <TeamListView data={data} teamId={teamId} tvOnly={false} series={false} only={ids.played} markNext={false} cupTag={teamTag} size={rows} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} />
        </div>
      )}
      <div className="ck-cup-section" data-testid="cup-remaining">
        {games.remaining.length > 0 ? (
          <>
            <h3 className="ck-cup-sec-head">Remaining</h3>
            <TeamListView data={data} teamId={teamId} tvOnly={false} series={false} only={ids.remaining} cupTag={teamTag} size={rows} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} />
          </>
        ) : (
          <p className="ck-empty ck-cup-none">No remaining Cup games</p>
        )}
      </div>
    </section>
  );
}
