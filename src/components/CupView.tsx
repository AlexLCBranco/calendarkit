// Cup (round 11): NBA Cup group standings "if group play ended today", worked out from the schedule already loaded
// (src/data/cup.ts) — six group cards (West A/B/C over East A/B/C), then who advances + the tiebreakers, and each
// conference's wild-card race. Desktop only; its own chunk, loaded and computed only when the Cup view is opened.
// Round 12: Standings | Schedule (the switch is in the top bar); the Schedule (CupSchedule.tsx) is worked out only once
// its tab is opened.

import { useMemo, type CSSProperties } from 'react';
import { cupStandings, type CupSlot, type CupTeamLine, type Tiebreak, type WildCardRace } from '../data/cup';
import { dateFormat, type CalendarData } from '../data/model';
import { TEAM_BY_ID, teamLogo } from '../data/teams';
import { TeamLink } from '../slate/teamLink';
import { CupSquare } from '../slate/CupSquare';
import type { GameLink } from '../slate/links';
import CupSchedule, { type CupScheduleProps } from './CupSchedule';
import CupSimulator, { type CupSimulatorProps } from './CupSimulator';
import './styles/cup.css';

/** Pill colors: each team's main color, lifted where it is near black or too light for white text on the dark page. */
export const TEAM_COLOR: Readonly<Record<string, string>> = {
  ATL: '#c8102e', BOS: '#007a33', BKN: '#5a5f66', CHA: '#00788c', CHI: '#ce1141', CLE: '#860038', DAL: '#00538c',
  DEN: '#1d4e89', DET: '#c8102e', GSW: '#1d428a', HOU: '#ce1141', IND: '#1f4f9a', LAC: '#c8102e', LAL: '#552583',
  MEM: '#5d76a9', MIA: '#98002e', MIL: '#00471b', MIN: '#236192', NOP: '#2b4a7a', NYK: '#006bb6', OKC: '#007ac1',
  ORL: '#0077c0', PHI: '#006bb6', PHX: '#e56020', POR: '#e03a3e', SAC: '#5a2d81', SAS: '#6b7177', TOR: '#ce1141',
  UTA: '#4b2e83', WAS: '#e31837',
};

const TIEBREAK_TEXT: Record<Tiebreak, string> = {
  h2h: 'head-to-head',
  diff: 'point differential',
  points: 'points scored',
  'last-season': '2025-26 record',
};

const fmtThrough = (date: string) => dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

export interface CupViewProps {
  data: CalendarData;
  /** Round 21: every game square is its game page (new tab). */
  gameLink?: GameLink;
  /** Round 12: the schedule instead of the standings (default: standings). */
  schedule?: Omit<CupScheduleProps, 'data'>;
  /** Round 21 (item 4): the simulator instead. */
  sim?: Omit<CupSimulatorProps, 'data' | 'gameLink'>;
}

export default function CupView({ data, schedule, gameLink, sim }: CupViewProps) {
  if (sim) return <CupSimulator data={data} gameLink={gameLink} {...sim} />;
  return schedule ? <CupSchedule data={data} {...schedule} /> : <CupStandingsView data={data} gameLink={gameLink} />;
}

function CupStandingsView({ data, gameLink }: { data: CalendarData; gameLink?: GameLink }) {
  const s = useMemo(() => cupStandings(data.games, data.regulation), [data]);
  return (
    <section className="ck-cupview" aria-label="NBA Cup standings" data-testid="cup">
      <div className="ck-cup-capture" data-testid="cup-grid">
        <header className="ck-cup-head">
          <h2 className="ck-cup-title">NBA Cup · Group play</h2>
          <span className="ck-cup-through" data-testid="cup-through">
            {s.through ? `Through ${fmtThrough(s.through)}` : 'No group games played yet'}
          </span>
          <span className="ck-cup-ifended">If group play ended today</span>
        </header>
        <div className="ck-cup-grid">
          {s.groups.map((g) => (
            <div key={g.group} className="ck-cup-card" data-group={g.group} data-testid="cup-group">
              <div className="ck-cup-row ck-cup-cols">
                <span className="ck-cup-group-name">{g.short}</span>
                <span className="ck-cup-num">W</span>
                <span className="ck-cup-num">L</span>
                <span className="ck-cup-num ck-cup-diff-col">DIFF</span>
              </div>
              {g.teams.map((t) => (
                <TeamPill key={t.teamId} t={t} gameLink={gameLink} />
              ))}
            </div>
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

function Marker({ t }: { t: CupTeamLine }) {
  if (t.status === 'leader')
    return (
      <span className="ck-cup-mark ck-cup-star" aria-label="Leads group" title="Leads its group">
        ★
      </span>
    );
  if (t.status === 'wild-card')
    return (
      <span className="ck-cup-mark ck-cup-wc" aria-label="Holds wild card" title="Holds the wild card">
        WC
      </span>
    );
  return <span className="ck-cup-mark">{t.rank}</span>;
}

function DiffChip({ diff }: { diff: number }) {
  return <span className={`ck-cup-chip ${diff > 0 ? 'ck-cup-pos' : diff < 0 ? 'ck-cup-neg' : 'ck-cup-zero'}`}>{signed(diff)}</span>;
}

function Logo({ teamId }: { teamId: number }) {
  const src = teamLogo(teamId);
  return (
    <TeamLink teamId={teamId} className="ck-logo-backing" aria-label={TEAM_BY_ID.get(teamId)?.tricode}>
      {src && <img src={src} alt="" width={20} height={20} />}
    </TeamLink>
  );
}

function TeamPill({ t, gameLink }: { t: CupTeamLine; gameLink?: GameLink }) {
  const team = TEAM_BY_ID.get(t.teamId);
  const why = t.tied ? 'Tied: no tiebreaker separates them yet' : t.tiebreak ? `Placed by ${TIEBREAK_TEXT[t.tiebreak]}` : undefined;
  return (
    <div
      className="ck-cup-row ck-cup-pill"
      style={{ '--ck-team': TEAM_COLOR[t.tricode] ?? '#3a3f4a' } as CSSProperties}
      data-team={t.tricode}
      data-status={t.status ?? ''}
      data-tied={t.tied || undefined}
      title={why}
    >
      {/* "tied" sits under the marker, not after the name: the name's row space holds the game slots */}
      <span className="ck-cup-markcell">
        <Marker t={t} />
        {t.tied && <span className="ck-cup-tied">tied</span>}
      </span>
      <Logo teamId={t.teamId} />
      <span className="ck-cup-main">
        <TeamLink teamId={t.teamId} className="ck-cup-name">{team ? `${team.city} ${team.name}` : t.tricode}</TeamLink>
        <Slots slots={t.slots} gameLink={gameLink} />
      </span>
      <span className="ck-cup-num">{t.w}</span>
      <span className="ck-cup-num">{t.l}</span>
      <span className="ck-cup-diff-col">
        <DiffChip diff={t.diff} />
      </span>
    </div>
  );
}

/**
 * Round 13: the team's 4 group games in date order, between the name and W / L — round 21 (item 5): the shared CupSquare
 * ("@PHX" / "vs HOU" over W / L; upcoming games the opponent alone, muted), each one its game page. No per-game margin
 * here (it doesn't fit beside the longest name at 1600 × 1000, e2e/cup.spec.ts); the full final score is the tooltip.
 */
function Slots({ slots, gameLink }: { slots: readonly CupSlot[]; gameLink?: GameLink }) {
  return (
    <span className="ck-cup-slots" data-testid="cup-slots">
      {slots.map((s) => (
        <CupSquare key={s.gameId} g={s} url={gameLink?.(s.game)} />
      ))}
    </span>
  );
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
    <div className="ck-cup-panel" data-testid="cup-wildcards">
      <h3>Wild card race</h3>
      <div className="ck-cup-races">
        {races.map((r) => (
          <div key={r.conference} className="ck-cup-race" data-conference={r.conference}>
            <h4>{r.conference}</h4>
            {r.teams.map((t, i) => (
              <div key={t.teamId} className={`ck-cup-race-row${i === 0 ? ' ck-cup-holder' : ''}`} data-team={t.tricode} title={t.wcTied ? 'Tied: no tiebreaker separates them yet' : t.wcTiebreak ? `Placed by ${TIEBREAK_TEXT[t.wcTiebreak]}` : undefined}>
                <span className="ck-cup-mark">{i === 0 ? 'WC' : ''}</span>
                <Logo teamId={t.teamId} />
                <TeamLink teamId={t.teamId} className="ck-cup-tri">{t.tricode}</TeamLink>
                <span className="ck-cup-sub">2nd, {t.group.replace(' Group ', ' ')}</span>
                <span className="ck-cup-rec">
                  {t.w}-{t.l}
                </span>
                <DiffChip diff={t.diff} />
              </div>
            ))}
            {r.chasing.map((t) => (
              <div key={t.teamId} className="ck-cup-race-row ck-cup-chaser" data-team={t.tricode} title={`${ordinal(t.rank)} in its group today: in the race only by moving up to 2nd`}>
                <span className="ck-cup-mark" />
                <Logo teamId={t.teamId} />
                <TeamLink teamId={t.teamId} className="ck-cup-tri">{t.tricode}</TeamLink>
                <span className="ck-cup-sub">
                  {ordinal(t.rank)}, {t.group.replace(' Group ', ' ')}
                </span>
                <span className="ck-cup-rec">
                  {t.w}-{t.l}
                </span>
                <DiffChip diff={t.diff} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
