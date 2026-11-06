// Standings (round 17; round 18: both conferences side by side): the standings worked out from the schedule already
// loaded (src/data/standings.ts, computed once per data set) — West and East tables next to each other, in one of four
// column sets (both tables at once), one sort for both, with the playoff (after 6) and play-in (after 10) lines, clinch
// markers, and each tied seed’s tiebreakers on hover. Plus the condensed popup the top bar’s "Standings" button opens
// over any view. Desktop only; its own chunk, loaded (and computed) only when the view or the popup is opened.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CalendarData } from '../data/model';
import { dateFormat } from '../data/model';
import { CLINCH_TEXT, fmtPct, fmtRec, leagueStandings, PLAY_IN_SEEDS, PLAYOFF_SEEDS, tieText, type Rec, type SeededTeam } from '../data/standings';
import { TEAM_BY_ID, teamLogo } from '../data/teams';
import { TeamLink } from '../slate/teamLink';
import { CopyButton } from './CopyButton';
import { COLUMN_SETS, type StandingsSet } from './standingsSets';
import './styles/standings.css';
import { streakAttr } from '../slate/streakPopup';

const fmtThrough = (date: string) => dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
const fmtGb = (gb: number) => (gb === 0 ? '—' : gb.toFixed(1).replace(/\.0$/, ''));
const fmt1 = (n: number) => n.toFixed(1);
const signed1 = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n < 0 ? `−${(-n).toFixed(1)}` : '0.0');
const recPct = (r: Rec) => (r.w + r.l ? r.w / (r.w + r.l) : -1);
const name = (id: number) => {
  const t = TEAM_BY_ID.get(id);
  return t ? `${t.city} ${t.name}` : String(id);
};

interface Column {
  key: string;
  label: string;
  /** Header tooltip. */
  tip: string;
  /** Group header above it. */
  group: string;
  cell: (t: SeededTeam) => ReactNode;
  /** Sort value, higher = better. */
  sort: (t: SeededTeam) => number;
  /** Lower is better (GB, L, points against): the first click sorts ascending. */
  asc?: boolean;
  className?: string;
}

const rec = (key: string, label: string, group: string, tip: string, get: (t: SeededTeam) => Rec): Column => ({ key, label, group, tip, cell: (t) => fmtRec(get(t)), sort: (t) => recPct(get(t)) * 1000 + get(t).w });
const num = (key: string, label: string, group: string, tip: string, get: (t: SeededTeam) => number, opts: Partial<Column> = {}): Column => ({ key, label, group, tip, cell: (t) => get(t), sort: get, ...opts });

/** Every column after the team; `group` heads a run of adjacent columns in a set. */
const COLUMNS: Column[] = [
  { key: 'wl', label: 'W-L', group: '', tip: 'Record', cell: (t) => fmtRec(t), sort: (t) => t.pct * 1000 + t.w },
  num('w', 'W', '', 'Wins', (t) => t.w),
  num('l', 'L', '', 'Losses', (t) => t.l, { asc: true }),
  { key: 'pct', label: 'Pct', group: '', tip: 'Win %', cell: (t) => fmtPct(t.pct), sort: (t) => t.pct },
  { key: 'gb', label: 'GB', group: '', tip: 'Games behind the 1st seed', cell: (t) => fmtGb(t.gb), sort: (t) => t.gb, asc: true },
  rec('home', 'Home', 'Splits', 'Home record', (t) => t.home),
  rec('road', 'Road', 'Splits', 'Road record', (t) => t.road),
  rec('conf', 'Conf', 'Splits', 'Conference record', (t) => t.conf),
  rec('div', 'Div', 'Splits', 'Division record', (t) => t.div),
  rec('over500', '.500+', 'Games', 'vs teams at .500 or better going into the game (NBA.com’s “vs. over .500”)', (t) => t.over500),
  rec('close', 'Close', 'Games', 'Games decided by 5 points or fewer', (t) => t.close),
  rec('ot', 'OT', 'Games', 'Overtime games', (t) => t.ot),
  rec('l10', 'L10', 'Form', 'Last 10 games', (t) => t.last10),
  {
    key: 'streak', label: 'Strk', group: 'Form', tip: 'Current streak',
    cell: (t) => <span className={t.streak.startsWith('W') ? 'ck-st-good' : t.streak ? 'ck-st-bad' : ''} data-streak={t.streak ? streakAttr(t.teamId) : undefined} tabIndex={t.streak ? 0 : undefined}>{t.streak || '—'}</span>,
    sort: (t) => (t.streak.startsWith('W') ? 1 : -1) * Number(t.streak.slice(1) || 0),
  },
  num('ppg', 'PF', 'Per game', 'Points for, per game', (t) => t.ppg, { cell: (t) => fmt1(t.ppg) }),
  num('oppg', 'PA', 'Per game', 'Points against, per game', (t) => t.oppg, { cell: (t) => fmt1(t.oppg), asc: true }),
  num('diff', 'Diff', 'Per game', 'Point differential, per game', (t) => t.diffPg, { cell: (t) => <span className={t.diffPg > 0 ? 'ck-st-good' : t.diffPg < 0 ? 'ck-st-bad' : ''}>{signed1(t.diffPg)}</span> }),
  num('left', 'Left', 'Remaining', 'Regular-season games left on the schedule', (t) => t.left.total, { asc: true }),
  num('leftHome', 'Home', 'Remaining', 'Home games left', (t) => t.left.home),
  num('leftRoad', 'Road', 'Remaining', 'Road games left', (t) => t.left.road, { asc: true }),
  num('leftB2b', 'B2B', 'Remaining', 'Back-to-backs left (2nd night still to come)', (t) => t.left.b2b, { asc: true }),
  rec('b2b1', '1st', 'B2B legs', 'Record on the 1st night of back-to-backs', (t) => t.b2bFirst),
  rec('b2b2', '2nd', 'B2B legs', 'Record on the 2nd night of back-to-backs', (t) => t.b2bSecond),
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));


type Sort = { key: string; asc: boolean };
const SEED_SORT: Sort = { key: 'seed', asc: true };

function Logo({ teamId }: { teamId: number }) {
  const src = teamLogo(teamId);
  return (
    <TeamLink teamId={teamId} className="ck-logo-backing ck-st-logo" aria-label={TEAM_BY_ID.get(teamId)?.tricode}>
      {src && <img src={src} alt="" width={20} height={20} />}
    </TeamLink>
  );
}

function Seed({ t }: { t: SeededTeam }) {
  const tip = tieText(t);
  return tip ? (
    <span className="ck-st-tied" data-tip={tip} tabIndex={0} data-testid="tied-seed">
      {t.seed}
    </span>
  ) : (
    <>{t.seed}</>
  );
}

function TeamCell({ t }: { t: SeededTeam }) {
  return (
    <span className="ck-st-teamcell">
      <Logo teamId={t.teamId} />
      <TeamLink teamId={t.teamId} className="ck-st-name">
        {name(t.teamId)}
      </TeamLink>
      {t.clinch && (
        <span className={`ck-st-clinch${t.clinch === 'o' ? ' ck-st-out' : ''}`} data-tip={CLINCH_TEXT[t.clinch]} data-testid="clinch">
          {t.clinch}
        </span>
      )}
    </span>
  );
}

/** Line classes under a row: playoffs after seed 6, play-in after 10 (conference tables in seed order only). */
const lineClass = (i: number, lines: boolean) => (!lines ? '' : i + 1 === PLAYOFF_SEEDS ? ' ck-st-line-playoffs' : i + 1 === PLAY_IN_SEEDS ? ' ck-st-line-playin' : '');

export interface StandingsViewProps {
  data: CalendarData;
  /** The column set both tables show. */
  set: StandingsSet;
}

/** West and East side by side, one column set for both, one sort for both (each within its own conference). */
export default function StandingsView({ data, set }: StandingsViewProps) {
  const s = leagueStandings(data);
  const cols = useMemo(() => COLUMN_SETS[set].keys.map((k) => COLUMN_BY_KEY.get(k)!), [set]);
  const [sort, setSort] = useState<Sort>(SEED_SORT);
  // a sort by a column the new set doesn't show goes back to seeds
  useEffect(() => setSort((cur) => (cur.key === 'seed' || COLUMN_SETS[set].keys.includes(cur.key) ? cur : SEED_SORT)), [set]);
  const lines = sort.key === 'seed' && sort.asc;
  const groups: { group: string; span: number; start: number }[] = [];
  cols.forEach((c, i) => {
    const last = groups[groups.length - 1];
    if (last && last.group === c.group) last.span++;
    else groups.push({ group: c.group, span: 1, start: i });
  });
  const gstart = (i: number) => i > 0 && cols[i - 1]!.group !== cols[i]!.group;
  const click = (key: string, asc: boolean) => setSort((cur) => (cur.key === key ? { key, asc: !cur.asc } : { key, asc }));
  const aria = (key: string) => (sort.key === key ? (sort.asc ? 'ascending' : 'descending') : undefined);
  const arrow = (key: string) => (sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : '');
  const sorted = (teams: SeededTeam[]) => {
    if (sort.key === 'seed') return sort.asc ? teams : [...teams].reverse();
    const col = COLUMN_BY_KEY.get(sort.key)!;
    return [...teams].sort((a, b) => (sort.asc ? col.sort(a) - col.sort(b) : col.sort(b) - col.sort(a)) || a.seed - b.seed);
  };
  return (
    <section className="ck-standings" aria-label="Standings" data-testid="standings">
      <div className="ck-st-capture" data-testid="standings-capture" data-set={set}>
        <header className="ck-st-head">
          <h2 className="ck-st-title">Standings</h2>
          <span className="ck-st-through" data-testid="standings-through">
            {s.through ? `Through ${fmtThrough(s.through)} · ${s.games} games` : 'No games played yet'}
          </span>
        </header>
        <div className="ck-st-pair">
          {(['West', 'East'] as const).map((conf) => (
            <table key={conf} className="ck-st-table" data-conference={conf} data-testid="standings-table">
              <thead>
                <tr className="ck-st-groups">
                  <th colSpan={2} className="ck-st-conf">
                    {conf}ern Conference
                  </th>
                  {groups.map((g) => (
                    <th key={g.start} colSpan={g.span} className={`${g.group ? 'ck-st-group' : ''}${gstart(g.start) ? ' ck-st-gstart' : ''}`}>
                      {g.group}
                    </th>
                  ))}
                </tr>
                <tr className="ck-st-cols">
                  <th aria-sort={aria('seed')} className="ck-st-seed">
                    <button type="button" onClick={() => click('seed', true)} data-tip="Seed">
                      Seed
                      {arrow('seed')}
                    </button>
                  </th>
                  <th className="ck-st-team">Team</th>
                  {cols.map((c, i) => (
                    <th key={c.key} aria-sort={aria(c.key)} className={gstart(i) ? 'ck-st-gstart' : undefined}>
                      <button type="button" onClick={() => click(c.key, !!c.asc)} data-tip={c.tip} data-col={c.key}>
                        {c.label}
                        {arrow(c.key)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted(s[conf]).map((t, i) => (
                  <tr key={t.teamId} data-team={t.tricode} data-seed={t.seed} className={`ck-st-row${lineClass(i, lines)}`}>
                    <td className="ck-st-seed">
                      <Seed t={t} />
                    </td>
                    <td className="ck-st-team">
                      <TeamCell t={t} />
                    </td>
                    {cols.map((c, j) => (
                      <td key={c.key} data-col={c.key} className={gstart(j) ? 'ck-st-gstart' : undefined}>
                        {c.cell(t)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
        <Legend />
      </div>
    </section>
  );
}

function Legend() {
  return (
    <p className="ck-st-legend" data-testid="standings-legend">
      <span className="ck-st-key ck-st-key-playoffs" /> Playoffs (1–6) <span className="ck-st-key ck-st-key-playin" /> Play-in (7–10) ·{' '}
      x playoffs · pi play-in · o eliminated · w / e conference · a c se nw p sw division · Underlined seed: tied, hover for the tiebreakers (NBA
      rules, L.2) · Cup games count, the Cup Championship doesn’t
    </p>
  );
}

/** The condensed popup: both conferences side by side — seed, team, W-L, GB, last 10, streak, and the lines. */
export function StandingsPopup({ data, onClose }: { data: CalendarData; onClose: () => void }) {
  const s = leagueStandings(data);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const outside = (e: PointerEvent) => {
      const t = e.target as Element;
      if (ref.current?.contains(t) || t.closest?.('[data-testid="standings-button"]')) return;
      onClose();
    };
    window.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', outside, true);
    return () => (window.removeEventListener('keydown', esc), document.removeEventListener('pointerdown', outside, true));
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="ck-st-pop"
      role="dialog"
      aria-label="Standings"
      data-testid="standings-popup"
    >
      <div className="ck-st-pop-body" data-testid="standings-popup-body">
        <header className="ck-st-pop-head">
          <h2 className="ck-st-title">Standings</h2>
          <span className="ck-st-through">{s.through ? `Through ${fmtThrough(s.through)}` : 'No games played yet'}</span>
          <span className="ck-st-pop-tools" data-capture-exclude="true">
            <CopyButton label="Copy standings as image" of=".ck-st-pop-body" testId="standings-popup-copy" />
            <button type="button" className="ck-st-pop-close" aria-label="Close" onClick={onClose} data-testid="standings-popup-close">
              ×
            </button>
          </span>
        </header>
        <div className="ck-st-pop-grid">
          {(['West', 'East'] as const).map((conf) => (
            <table key={conf} className="ck-st-mini" data-conference={conf} data-testid="standings-mini">
              <thead>
                <tr>
                  <th className="ck-st-seed">{conf}</th>
                  <th className="ck-st-team" />
                  <th>W-L</th>
                  <th>GB</th>
                  <th>L10</th>
                  <th>Strk</th>
                </tr>
              </thead>
              <tbody>
                {s[conf].map((t, i) => (
                  <tr key={t.teamId} data-team={t.tricode} className={`ck-st-row${lineClass(i, true)}`}>
                    <td className="ck-st-seed">
                      <Seed t={t} />
                    </td>
                    <td className="ck-st-team">
                      <TeamCell t={t} />
                    </td>
                    <td>{fmtRec(t)}</td>
                    <td>{fmtGb(t.gb)}</td>
                    <td>{fmtRec(t.last10)}</td>
                    <td>
                      <span className={t.streak.startsWith('W') ? 'ck-st-good' : t.streak ? 'ck-st-bad' : ''} data-streak={t.streak ? streakAttr(t.teamId) : undefined} tabIndex={t.streak ? 0 : undefined}>{t.streak || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
    </div>
  );
}
