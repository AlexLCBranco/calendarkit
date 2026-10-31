// Cup (round 11): NBA Cup group standings "if group play ended today", worked out from the schedule already loaded
// (src/data/cup.ts) — six group cards (West A/B/C over East A/B/C), then who advances + the tiebreakers, and each
// conference's wild-card race. Desktop only; its own chunk, loaded and computed only when the Cup view is opened.

import { useMemo, type CSSProperties } from 'react';
import { cupStandings, type CupTeamLine, type Tiebreak, type WildCardRace } from '../data/cup';
import { dateFormat, type CalendarData } from '../data/model';
import { TEAM_BY_ID, teamLogo } from '../data/teams';
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
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

export interface CupViewProps {
  data: CalendarData;
}

export default function CupView({ data }: CupViewProps) {
  const s = useMemo(() => cupStandings(data.games), [data]);
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
                <TeamPill key={t.teamId} t={t} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="ck-cup-panels">
        <Rules />
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
  return <span className="ck-logo-backing">{src && <img src={src} alt="" width={20} height={20} />}</span>;
}

function TeamPill({ t }: { t: CupTeamLine }) {
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
      <Marker t={t} />
      <Logo teamId={t.teamId} />
      <span className="ck-cup-name">
        {team ? `${team.city} ${team.name}` : t.tricode}
        {t.tied && <span className="ck-cup-tied">tied</span>}
      </span>
      <span className="ck-cup-num">{t.w}</span>
      <span className="ck-cup-num">{t.l}</span>
      <span className="ck-cup-diff-col">
        <DiffChip diff={t.diff} />
      </span>
    </div>
  );
}

function Rules() {
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
          Overtime points should not count in rules 2 and 3, but the schedule only has final scores, so OT games are counted with their final score.
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
                <span className="ck-cup-tri">{t.tricode}</span>
                <span className="ck-cup-sub">2nd, {t.group.replace(' Group ', ' ')}</span>
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
