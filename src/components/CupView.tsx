// Cup: NBA Cup group standings "if group play ended today", worked out from the schedule already loaded
// (src/data/cup.ts) — six group cards (West A/B/C over East A/B/C), then who advances + the tiebreakers, and each
// conference's wild-card race. Desktop only; its own chunk, loaded and computed only when the Cup view is opened.
// Standings | Schedule (the switch is in the top bar); the Schedule (CupSchedule.tsx) is worked out only once
// its tab is opened.

import { lazy, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
/** The history and its data file, their own chunk, loaded when the tab is opened. */
const CupHistory = lazy(() => import('./CupHistory'));
import { CupTonight } from './CupTonight';
import { cupStandings, type CupSlot, type Tiebreak, type WildCardRace } from '../data/cup';
import { GroupCard, ordinal, TeamPill, WildCardPanel } from './CupGroupParts';
import { dateFormat, type CalendarData } from '../data/model';
import { CupSquare, cupSquareNow } from '../slate/CupSquare';
import { useLive } from '../slate/live';
import type { GameLink } from '../slate/links';
import CupSchedule, { type CupScheduleProps } from './CupSchedule';
import CupSimulator, { type CupSimulatorProps } from './CupSimulator';
import './styles/cup.css';

export { TEAM_COLOR } from './CupGroupParts';

const TIEBREAK_TEXT: Record<Tiebreak, string> = {
  h2h: 'head-to-head',
  diff: 'point differential',
  points: 'points scored',
  'last-season': '2025-26 record',
};

const fmtThrough = (date: string) => dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));

export interface CupViewProps {
  data: CalendarData;
  /** Every game square is its game page (new tab). */
  gameLink?: GameLink;
  /** The local date — "Tonight in the Cup" on a night with Cup games. */
  today?: string;
  /** The schedule instead of the standings (default: standings). */
  schedule?: Omit<CupScheduleProps, 'data'>;
  /** The history instead (its season, and the season picked). */
  history?: { season?: number; view?: 'groups' | 'bracket'; onSeason: (year: number | undefined) => void; onView: (view: 'groups' | 'bracket') => void };
  /** The simulator instead. */
  sim?: Omit<CupSimulatorProps, 'data' | 'gameLink' | 'focusBracket'>;
  /** A Cup label's target, brought into view: a group ("West Group A") or "bracket" (the simulator's). */
  focus?: string;
}

export default function CupView({ data, schedule, gameLink, sim, today, history, focus }: CupViewProps) {
  if (history)
    return (
      <Suspense fallback={<p className="ck-empty">Loading the Cup history…</p>}>
        <CupHistory data={data} {...history} />
      </Suspense>
    );
  // the simulator's "Tonight in the Cup" is in the page rows (CupDestination): the simulator fills the window
  if (sim) return <CupSimulator data={data} gameLink={gameLink} focusBracket={focus === 'bracket'} {...sim} />;
  return schedule ? <CupSchedule data={data} {...schedule} /> : <CupStandingsView data={data} gameLink={gameLink} focus={focus} tonight={today ? <CupTonight data={data} today={today} gameLink={gameLink} inline /> : null} />;
}

function CupStandingsView({ data, gameLink, tonight, focus }: { data: CalendarData; gameLink?: GameLink; tonight?: ReactNode; focus?: string }) {
  const s = useMemo(() => cupStandings(data.games, data.regulation), [data]);
  // a Cup label's group: in view (it already is on a full-size window) and outlined
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) grid.current?.querySelector('[data-focus]')?.scrollIntoView?.({ block: 'nearest' });
  }, [focus]);
  return (
    <section className="ck-cupview" aria-label="NBA Cup standings" data-testid="cup">
      <div className="ck-cup-capture" data-testid="cup-grid">
        <header className="ck-cup-head">
          <h2 className="ck-cup-title">NBA Cup · Group play</h2>
          <span className="ck-cup-through" data-testid="cup-through">
            {s.through ? `Through ${fmtThrough(s.through)}` : 'No group games played yet'}
          </span>
          <span className="ck-cup-ifended">If group play ended today</span>
          {tonight}
        </header>
        <div className="ck-cup-grid" ref={grid}>
          {s.groups.map((g) => (
            <GroupCard key={g.group} group={g.group} short={g.short} focus={g.group === focus}>
              {g.teams.map((t) => (
                <TeamPill key={t.teamId} t={t} why={t.tied ? 'Tied: no tiebreaker separates them yet' : t.tiebreak ? `Placed by ${TIEBREAK_TEXT[t.tiebreak]}` : undefined} slots={<Slots slots={t.slots} gameLink={gameLink} />} />
              ))}
            </GroupCard>
          ))}
        </div>
      </div>
      <div className="ck-cup-panels">
        <Rules otPending={s.otWithoutRegulation} />
        <WildCards races={s.wildCards} />
      </div>
    </section>
  );
}

/**
 * The team's 4 group games in date order, between the name and W / L — the shared CupSquare
 * ("@PHX" / "vs HOU" over W / L; upcoming games the opponent alone, muted), each one its game page. No per-game margin
 * here (it doesn't fit beside the longest name at 1600 × 1000, e2e/cup.spec.ts); the full final score is the tooltip.
 */
function Slots({ slots, gameLink }: { slots: readonly CupSlot[]; gameLink?: GameLink }) {
  return (
    <>
      {slots.map((s) => (
        <LiveSquare key={s.gameId} s={s} url={gameLink?.(s.game)} />
      ))}
    </>
  );
}

/** A square as it stands now (CK-21): LIVE with the score so far while being played, W / L once ESPN has it final. */
function LiveSquare({ s, url }: { s: CupSlot; url?: string }) {
  const { game, live } = useLive(s.game);
  return <CupSquare g={cupSquareNow(s, game, live)} url={url} />;
}

function Rules({ otPending }: { otPending: number }) {
  return (
    <div className="ck-cup-panel" data-testid="cup-rules">
      <h3>Who advances</h3>
      <div className="ck-cup-rules-text">
        <p>The six group winners and one wild card per conference (the 2nd-place team with the best group record) go to the quarterfinals.</p>
        <p>Teams are ranked by record (games over .500, then win %; no games counts as .500). Ties are broken in this order:</p>
        <ol>
          <li>Head-to-head record among the tied teams (group games only).</li>
          <li>Point differential in group games.</li>
          <li>Points scored in group games.</li>
          <li>2025-26 regular-season record.</li>
          <li>Still tied: shown in a fixed order and marked “tied”.</li>
        </ol>
        <p>If a rule settles only part of a tie, the teams still level start again from rule 1. Wild-card ties use the same list without head-to-head; group ties are settled first.</p>
        <p className="ck-cup-ot" data-testid="cup-ot-note">
          A game that went to overtime counts 0 in rule 2 (it was tied after regulation) and only its regulation points in rule 3 (from the NBA's box scores).
          {otPending > 0 && ` ${otPending === 1 ? 'One OT game counts its' : `${otPending} OT games count their`} final score until the next daily update.`}
        </p>
      </div>
    </div>
  );
}

function WildCards({ races }: { races: WildCardRace[] }) {
  return (
    <WildCardPanel
      races={races.map((r) => ({
        conference: r.conference,
        teams: r.teams.map((t) => ({ ...t, group: t.group, rank: 2, tip: t.wcTied ? 'Tied: no tiebreaker separates them yet' : t.wcTiebreak ? `Placed by ${TIEBREAK_TEXT[t.wcTiebreak]}` : undefined })),
        chasing: r.chasing.map((t) => ({ ...t, tip: `${ordinal(t.rank)} in its group today: in the race only by moving up to 2nd` })),
      }))}
    />
  );
}
