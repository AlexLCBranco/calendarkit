// Cup → Schedule (round 12): the NBA Cup's games as lists, from the schedule already loaded (src/data/cupSchedule.ts).
// League: one Cup night at a time (round tabs, a strip of the Cup nights, ← / →), drawn with the League List's day
// section and rows. Team: one team's Cup games under "Played" and "Remaining", drawn with the Team List. Every row is
// the existing one, with the facts it has elsewhere; back-to-backs, 3-in-4s and records come from the whole schedule
// (leagueFatigue, teamB2BPairs, teamSeason read `data`, not the Cup games). Part of the Cup view's chunk; nothing here
// runs until the Schedule tab is opened.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cupTag, type CalendarData } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { CUP_ROUNDS, cupNightHeading, cupNights, cupOpeningNight, roundFirstNight, teamCupGames } from '../data/cupSchedule';
import type { GameLink } from './GameCard';
import { FatigueLegend } from './FatigueMark';
import { FATIGUE_SLOTS_MIN_WIDTH, leagueListStyle, ListDaySection } from './LeagueListView';
import { Segmented } from './Segmented';
import { TeamHeader } from './TeamHeader';
import { TeamListView } from './TeamListView';
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

const leagueTag = (g: ScheduleGame) => cupTag(g);
const teamTag = (g: ScheduleGame) => cupTag(g, true);

function CupLeague({ data, size, now, today, timeZone, onOpenGame, gameLink, onNight }: CupScheduleProps) {
  const nights = useMemo(() => cupNights(data), [data]);
  const [night, setNight] = useState(() => cupOpeningNight(nights, today));
  const i = nights.findIndex((n) => n.date === night);
  const n = nights[i];
  const onNightRef = useRef(onNight);
  onNightRef.current = onNight;
  useEffect(() => void (night && onNightRef.current?.(night)), [night]);

  const go = (k: number) => nights[k] && setNight(nights[k].date);
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
  const day = useMemo(() => n && { date: n.date, games: n.games }, [n]);
  if (!n || !day) return <p className="ck-empty">The schedule has no Cup games.</p>;
  const style = leagueListStyle(size.width);
  return (
    <section className={`ck-league-list ck-cup-sched${style ? ' ck-league-side' : ''}`} aria-label="NBA Cup schedule" data-testid="cup-league" style={style}>
      <div className="ck-cup-rounds">
        <Segmented
          label="Round"
          value={n.round}
          options={CUP_ROUNDS.map((r) => [r.round, r.label])}
          onChange={(r) => {
            const d = roundFirstNight(nights, r);
            if (d) setNight(d);
          }}
        />
      </div>
      <div className="ck-cup-strip" style={{ '--ck-nights': nights.length } as CSSProperties}>
        <WeekStrip days={strip} selected={n.date} today={today} onPick={setNight} onPrev={() => go(i - 1)} onNext={() => go(i + 1)} prevDisabled={i <= 0} nextDisabled={i >= nights.length - 1} unit="night" label="Cup nights" />
      </div>
      <div className="ck-llist" data-testid="cup-night" data-select-scroller>
        <ListDaySection key={day.date} day={day} data={data} compact={false} fatigueSlots={size.width >= FATIGUE_SLOTS_MIN_WIDTH} now={now} timeZone={timeZone} onOpenGame={onOpenGame} gameLink={gameLink} heading={cupNightHeading(n)} cupTag={leagueTag} />
      </div>
      <FatigueLegend component={size.width >= FATIGUE_SLOTS_MIN_WIDTH} />
    </section>
  );
}

function CupTeam({ data, teamId, size, now, timeZone, onOpenGame, gameLink }: CupScheduleProps) {
  const games = useMemo(() => (teamId === undefined ? undefined : teamCupGames(data, teamId)), [data, teamId]);
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
