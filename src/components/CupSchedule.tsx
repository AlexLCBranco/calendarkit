// Cup → Schedule (round 12): the NBA Cup's games as lists, from the schedule already loaded (src/data/cupSchedule.ts).
// League: one Cup night at a time (round tabs, a strip of the Cup nights, ← / →), drawn with the League List's day
// section and rows. Team: one team's Cup games under "Played" and "Remaining", drawn with the Team List. Every row is
// the existing one, with the facts it has elsewhere; back-to-backs, 3-in-4s and records come from the whole schedule
// (leagueFatigue, teamB2BPairs, teamSeason read `data`, not the Cup games). Part of the Cup view's chunk; nothing here
// runs until the Schedule tab is opened.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { CalendarData } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { CUP_ROUNDS, cupLeagueTag, cupOpeningStop, cupStopHeading, cupStops, cupTeamTag, teamCupGames } from '../data/cupSchedule';
import type { GameLink } from './GameCard';
import { FatigueLegend } from './FatigueMark';
import { FATIGUE_SLOTS_MIN_WIDTH, leagueListStyle, ListDaySection } from './LeagueListView';
import { Segmented } from './Segmented';
import { TeamHeader } from './TeamHeader';
import { rowDate, TeamListView } from './TeamListView';
import { WeekStrip } from './WeekStrip';
import type { WidgetSize } from './widget';

export interface CupScheduleProps {
  data: CalendarData;
  list: 'league' | 'team';
  /** Team list: the picked team; none until one is picked (no default, nothing remembered). */
  teamId?: number;
  size: WidgetSize;
  now: number;
  /** Local date (the clock's): the League list opens on the Cup night of today, else the next one. */
  today: string;
  timeZone?: string;
  onOpenGame?: (gameId: string) => void;
  gameLink?: GameLink;
  /** Told the night on show (the host clears a marquee selection when it changes). */
  onNight?: (date: string) => void;
}

export default function CupSchedule(p: CupScheduleProps) {
  return p.list === 'league' ? <CupLeague {...p} /> : <CupTeam {...p} />;
}

const dateLabel = (g: ScheduleGame) => rowDate(g.dateEt);
/** Group rounds (18–20 games) in two columns: every Cup night fits the window without scrolling (round 12b). */
export const CUP_ROUND_COLUMNS = 2;
const COL_GAP = 16;
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function CupLeague({ data, size, now, today, timeZone, onOpenGame, gameLink, onNight }: CupScheduleProps) {
  const stops = useMemo(() => cupStops(data), [data]);
  const tag = useMemo(() => cupLeagueTag(data), [data]);
  const [key, setKey] = useState(() => cupOpeningStop(stops, today));
  const i = stops.findIndex((x) => x.key === key);
  const n = stops[i];
  const onNightRef = useRef(onNight);
  onNightRef.current = onNight;
  useEffect(() => void (key && onNightRef.current?.(key)), [key]);

  const go = (k: number) => stops[k] && setKey(stops[k].key);
  // ← / → step the rounds and nights, with the League List's rules (not in a field, a tab row, a listbox, an open picker, or with a modifier)
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

  const strip = useMemo(
    () =>
      stops.map((x) =>
        x.group !== undefined
          ? { date: x.key, top: 'Round', num: String(x.group), aria: `Group play, round ${x.group}`, sub: String(x.games.length), disabled: false }
          : { date: x.key, sub: String(x.games.length), disabled: false },
      ),
    [stops],
  );
  const day = useMemo(() => n && { date: n.first, games: n.games }, [n]);
  if (!n || !day) return <p className="ck-empty">The schedule has no Cup games.</p>;
  const base = leagueListStyle(size.width);
  const cols = n.group !== undefined ? CUP_ROUND_COLUMNS : undefined;
  const zoom = (base?.zoom as number | undefined) ?? 1;
  // two columns take the whole widget width (at the List's zoom, so the text keeps its size)
  const style = base && cols ? ({ ...base, width: Math.floor(size.width / zoom), maxWidth: Math.floor(size.width / zoom), '--ck-col-gap': `${COL_GAP}px` } as CSSProperties) : base;
  return (
    <section className={`ck-league-list ck-cup-sched${base ? ' ck-league-side' : ''}${cols ? ' ck-cup-rounds-view' : ''}`} aria-label="NBA Cup schedule" data-testid="cup-league" data-stop={n.key} style={style}>
      <div className="ck-cup-rounds">
        <Segmented
          label="Round"
          value={n.round}
          options={CUP_ROUNDS.map((r) => [r.round, r.label])}
          onChange={(r) => {
            const d = stops.find((x) => x.round === r);
            if (d) setKey(d.key);
          }}
        />
      </div>
      <div className="ck-cup-strip" style={{ '--ck-nights': stops.length } as CSSProperties}>
        <WeekStrip days={strip} selected={n.key} today={today} onPick={setKey} onPrev={() => go(i - 1)} onNext={() => go(i + 1)} prevDisabled={i <= 0} nextDisabled={i >= stops.length - 1} unit="stop" label="Cup rounds and nights" />
      </div>
      <div className="ck-llist" data-testid="cup-night" data-select-scroller>
        <ListDaySection key={n.key} day={day} data={data} compact={false} fatigueSlots={!cols && size.width >= FATIGUE_SLOTS_MIN_WIDTH} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} heading={cupStopHeading(n)} cupTag={tag} dateLabel={cols ? dateLabel : undefined} columns={cols} tvPill={!!cols} />
      </div>
      {cols && (
        <p className="ck-cup-note" data-testid="cup-round-note">
          Round {n.group} = every team’s {ordinal(n.group!)} Cup group game. “G2/G1”: the away team’s 2nd group game and the home team’s 1st — a game like that is in both rounds.
        </p>
      )}
      <FatigueLegend component={!cols && size.width >= FATIGUE_SLOTS_MIN_WIDTH} />
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
      <TeamHeader teamId={teamId} period="NBA Cup" />
      {games.played.length > 0 && (
        <div className="ck-cup-section" data-testid="cup-played">
          <h3 className="ck-cup-sec-head">Played</h3>
          <TeamListView data={data} teamId={teamId} tvOnly={false} only={ids.played} markNext={false} cupTag={teamTag} size={rows} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} />
        </div>
      )}
      <div className="ck-cup-section" data-testid="cup-remaining">
        {games.remaining.length > 0 ? (
          <>
            <h3 className="ck-cup-sec-head">Remaining</h3>
            <TeamListView data={data} teamId={teamId} tvOnly={false} only={ids.remaining} cupTag={teamTag} size={rows} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} />
          </>
        ) : (
          <p className="ck-empty ck-cup-none">No remaining Cup games</p>
        )}
      </div>
    </section>
  );
}
