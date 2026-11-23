// The Cup › Groups page's pieces, shared with Cup › History (CK-43: each past season is laid out like Groups): the
// team pill (marker, logo, name, the game squares, W, L, DIFF), the group card and the wild-card race panel. The data
// comes in already worked out: the current Cup's from src/data/cup.ts, a past one's from cupHistory.json.

import type { CSSProperties, ReactNode } from 'react';
import { TEAM_BY_ID, teamLogo } from '../data/teams';
import { TeamLink } from '../slate/teamLink';

/** Pill colors: each team's main color, lifted where it is near black or too light for white text on the dark page. */
export const TEAM_COLOR: Readonly<Record<string, string>> = {
  ATL: '#c8102e', BOS: '#007a33', BKN: '#5a5f66', CHA: '#00788c', CHI: '#ce1141', CLE: '#860038', DAL: '#00538c',
  DEN: '#1d4e89', DET: '#c8102e', GSW: '#1d428a', HOU: '#ce1141', IND: '#1f4f9a', LAC: '#c8102e', LAL: '#552583',
  MEM: '#5d76a9', MIA: '#98002e', MIL: '#00471b', MIN: '#236192', NOP: '#2b4a7a', NYK: '#006bb6', OKC: '#007ac1',
  ORL: '#0077c0', PHI: '#006bb6', PHX: '#e56020', POR: '#e03a3e', SAC: '#5a2d81', SAS: '#6b7177', TOR: '#ce1141',
  UTA: '#4b2e83', WAS: '#e31837',
};

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
export const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** What a pill shows. */
export interface PillLine {
  teamId: number;
  tricode: string;
  w: number;
  l: number;
  diff: number;
  rank: number;
  tied?: boolean;
  status?: 'leader' | 'wild-card';
}

export function Marker({ t, done = false }: { t: PillLine; /** a finished season: "won", not "leads" */ done?: boolean }) {
  if (t.status === 'leader')
    return (
      <span className="ck-cup-mark ck-cup-star" aria-label={done ? 'Won group' : 'Leads group'} title={done ? 'Won its group' : 'Leads its group'}>
        ★
      </span>
    );
  if (t.status === 'wild-card')
    return (
      <span className="ck-cup-mark ck-cup-wc" aria-label={done ? 'Wild card' : 'Holds wild card'} title={done ? 'The wild card' : 'Holds the wild card'}>
        WC
      </span>
    );
  return <span className="ck-cup-mark">{t.rank}</span>;
}

export function DiffChip({ diff }: { diff: number }) {
  return <span className={`ck-cup-chip ${diff > 0 ? 'ck-cup-pos' : diff < 0 ? 'ck-cup-neg' : 'ck-cup-zero'}`}>{signed(diff)}</span>;
}

export function Logo({ teamId, size = 20 }: { teamId: number; size?: number }) {
  const src = teamLogo(teamId);
  return (
    <TeamLink teamId={teamId} className="ck-logo-backing" aria-label={TEAM_BY_ID.get(teamId)?.tricode}>
      {src && <img src={src} alt="" width={size} height={size} />}
    </TeamLink>
  );
}

/** One team's row: `slots` are its game squares (live ones on Groups, stored ones in History). */
export function TeamPill({ t, slots, why, done }: { t: PillLine; slots: ReactNode; why?: string; done?: boolean }) {
  const team = TEAM_BY_ID.get(t.teamId);
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
        <Marker t={t} done={done} />
        {t.tied && <span className="ck-cup-tied">tied</span>}
      </span>
      <Logo teamId={t.teamId} />
      <span className="ck-cup-main">
        <span className="ck-cup-namebox">
          <TeamLink teamId={t.teamId} className="ck-cup-name">
            {team ? `${team.city} ${team.name}` : t.tricode}
          </TeamLink>
        </span>
        <span className="ck-cup-slots" data-testid="cup-slots">
          {slots}
        </span>
      </span>
      <span className="ck-cup-num">{t.w}</span>
      <span className="ck-cup-num">{t.l}</span>
      <span className="ck-cup-diff-col">
        <DiffChip diff={t.diff} />
      </span>
    </div>
  );
}

/** A group card: its short name ("WEST A"), the column heads, then the pills. */
export function GroupCard({ group, short, focus, children }: { group: string; short: string; focus?: boolean; children: ReactNode }) {
  return (
    <div className={`ck-cup-card${focus ? ' ck-cup-card-focus' : ''}`} data-group={group} data-focus={focus || undefined} data-testid="cup-group">
      <div className="ck-cup-row ck-cup-cols">
        <span className="ck-cup-group-name">{short}</span>
        <span className="ck-cup-num">W</span>
        <span className="ck-cup-num">L</span>
        <span className="ck-cup-num ck-cup-diff-col">DIFF</span>
      </div>
      {children}
    </div>
  );
}

/** A wild-card race row's team. */
export interface RaceLine {
  teamId: number;
  tricode: string;
  w: number;
  l: number;
  diff: number;
  group: string;
  rank: number;
  tip?: string;
}

/** The race panel: per conference the three 2nd-place teams (the first holds / held the wild card), then the chasers. */
export function WildCardPanel({ races }: { races: { conference: string; teams: RaceLine[]; chasing: RaceLine[] }[] }) {
  const row = (t: RaceLine, cls: string, mark: string) => (
    <div key={t.teamId} className={`ck-cup-race-row${cls}`} data-team={t.tricode} title={t.tip}>
      <span className="ck-cup-mark">{mark}</span>
      <Logo teamId={t.teamId} />
      <TeamLink teamId={t.teamId} className="ck-cup-tri">
        {t.tricode}
      </TeamLink>
      <span className="ck-cup-sub">
        {ordinal(t.rank)}, {t.group.replace(' Group ', ' ')}
      </span>
      <span className="ck-cup-rec">
        {t.w}-{t.l}
      </span>
      <DiffChip diff={t.diff} />
    </div>
  );
  return (
    <div className="ck-cup-panel" data-testid="cup-wildcards">
      <h3>Wild card race</h3>
      <div className="ck-cup-races">
        {races.map((r) => (
          <div key={r.conference} className="ck-cup-race" data-conference={r.conference}>
            <h4>{r.conference}</h4>
            {r.teams.map((t, i) => row(t, i === 0 ? ' ck-cup-holder' : '', i === 0 ? 'WC' : ''))}
            {r.chasing.map((t) => row(t, ' ck-cup-chaser', ''))}
          </div>
        ))}
      </div>
    </div>
  );
}
