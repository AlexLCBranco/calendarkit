// Round 21 (item 9): Cup → History — every finished NBA Cup as it happened (src/data/cupHistory.json, built from the
// NBA's own data by scripts/build-cup-history.ts; never recomputed with today's rules). First the summary ("who usually
// makes the cut": knockout appearances, how far each year, group-play totals; sortable; West | East), then one season's
// final group tables (the shared CupSquare per game, the WC badge) and its bracket with results, venues (the shared
// VenueMarker: a game away from both teams' home arenas is neutral) and that season's prize money. A small muted line
// says what differed from the current format, worked out from the stored data only.

import { useMemo, useState } from 'react';
import history from '../data/cupHistory.json';
import { CUP_PRIZES } from '../data/cupPrize';
import { homeArena } from '../data/geo';
import type { CalendarData } from '../data/model';
import { TEAMS } from '../data/teams';
import { CupSquare } from '../slate/CupSquare';
import { gameLinkUrl } from '../slate/links';
import { TeamLink } from '../slate/teamLink';
import { HostTag, VenueBadge, type Venue } from '../slate/VenueMarker';
import { PrizeLine } from './CupSimulator';
import { prizeLines } from '../data/cupPrize';

type Season = (typeof history.seasons)[number];
type HTeam = Season['teams'][number];
type Ko = Season['knockout'][number];
export type Stage = 'Group' | 'QF' | 'SF' | 'Final' | 'Champion';

export const SEASONS: readonly Season[] = history.seasons;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const name = (s: Season) => (s.year === 2023 ? 'In-Season Tournament' : 'NBA Cup');
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdays = (dates: readonly string[]) => [...new Set(dates.map((d) => new Date(`${d}T12:00:00Z`).getUTCDay()))].sort().map((d) => WEEKDAY[d]!);

/** How far a team got in a season. */
export function stageOf(s: Season, teamId: number): Stage {
  const final = s.knockout.find((k) => k.round === 'final');
  const won = (k: Ko) => (k.home.score > k.away.score ? k.home.teamId : k.away.teamId);
  if (final && won(final) === teamId) return 'Champion';
  for (const [round, stage] of [['final', 'Final'], ['sf', 'SF'], ['qf', 'QF']] as const) if (s.knockout.some((k) => k.round === round && (k.home.teamId === teamId || k.away.teamId === teamId))) return stage;
  return 'Group';
}

export interface SummaryRow {
  teamId: number;
  tricode: string;
  conference: string;
  apps: number;
  stages: { year: number; stage: Stage }[];
  w: number;
  l: number;
  diff: number;
}

/** The summary: one row per team over every stored edition. */
export function summary(seasons: readonly Season[] = SEASONS): SummaryRow[] {
  return TEAMS.map((t) => {
    const lines = seasons.map((s) => ({ s, t: s.teams.find((x) => x.teamId === t.id) }));
    const stages = lines.map(({ s }) => ({ year: s.year, stage: stageOf(s, t.id) }));
    return {
      teamId: t.id,
      tricode: t.tricode,
      conference: t.conference,
      apps: stages.filter((x) => x.stage !== 'Group').length,
      stages,
      w: lines.reduce((n, x) => n + (x.t?.w ?? 0), 0),
      l: lines.reduce((n, x) => n + (x.t?.l ?? 0), 0),
      diff: lines.reduce((n, x) => n + (x.t?.diff ?? 0), 0),
    };
  });
}

/** A stored knockout game's venue: at a team market (the home team's own arena) → host; else neutral. */
export function historyVenue(data: CalendarData, k: Ko): Venue {
  const home = homeArena(data, k.home.teamId);
  if (!k.arena) return { kind: 'tbd' };
  return home && home.arena === k.arena ? { kind: 'host', teamId: k.home.teamId } : { kind: 'neutral', arena: k.arena, city: k.city || undefined };
}

/** What differed from the current format, from the stored data only (nothing when nothing did). */
export function formatNotes(data: CalendarData, s: Season, current: { groupDates: readonly string[] }): string[] {
  const notes: string[] = [];
  const sfFinal = s.knockout.filter((k) => k.round !== 'qf');
  const neutral = sfFinal.map((k) => historyVenue(data, k)).filter((v): v is Extract<Venue, { kind: 'neutral' }> => v.kind === 'neutral');
  if (neutral.length === sfFinal.length && neutral.length && new Set(neutral.map((v) => v.arena)).size === 1) notes.push(`Semifinals and final at ${neutral[0]!.arena}, ${neutral[0]!.city}`);
  const was = weekdays(s.groupDates).join(', ');
  if (current.groupDates.length && was !== weekdays(current.groupDates).join(', ')) notes.push(`Group games on ${was}`);
  return notes;
}

const STAGE_SHORT: Record<Stage, string> = { Group: '–', QF: 'QF', SF: 'SF', Final: 'F', Champion: '🏆' };
type SortKey = 'apps' | 'team' | 'wl' | 'diff';

export default function CupHistory({ data, season, onSeason }: { data: CalendarData; season?: number; onSeason: (year: number) => void }) {
  const [sort, setSort] = useState<SortKey>('apps');
  const rows = useMemo(() => summary(), []);
  const sorted = useMemo(() => {
    const by: Record<SortKey, (a: SummaryRow, b: SummaryRow) => number> = {
      apps: (a, b) => b.apps - a.apps || b.w - b.l - (a.w - a.l) || b.diff - a.diff,
      team: (a, b) => a.tricode.localeCompare(b.tricode),
      wl: (a, b) => b.w - b.l - (a.w - a.l) || b.diff - a.diff,
      diff: (a, b) => b.diff - a.diff,
    };
    return [...rows].sort(by[sort]);
  }, [rows, sort]);
  const s = SEASONS.find((x) => x.year === season) ?? SEASONS.at(-1)!;
  const groupDates = useMemo(() => [...new Set(data.games.filter((g) => g.isCupGroupGame).map((g) => g.dateEt))].sort(), [data]);
  const notes = formatNotes(data, s, { groupDates });
  const prize = prizeLines(s.year);
  const head = (k: SortKey, label: string) => (
    <button type="button" className={`ck-hist-sort${sort === k ? ' ck-hist-sorted' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)}>
      {label}
    </button>
  );
  return (
    <section className="ck-history" aria-label="NBA Cup history" data-testid="cup-history">
      <div className="ck-hist-summary" data-testid="hist-summary">
        <h3>
          Who usually makes the cut · {SEASONS.length} editions ({SEASONS.map((x) => x.year).join(', ')})
        </h3>
        <div className="ck-hist-confs">
          {(['West', 'East'] as const).map((c) => (
            <table key={c} className="ck-hist-table" data-conference={c}>
              <thead>
                <tr>
                  <th>{head('team', c)}</th>
                  <th>{head('apps', 'KO')}</th>
                  {SEASONS.map((x) => (
                    <th key={x.year}>{x.year}</th>
                  ))}
                  <th>{head('wl', 'W-L')}</th>
                  <th>{head('diff', 'DIFF')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted
                  .filter((r) => r.conference === c)
                  .map((r) => (
                    <tr key={r.teamId} data-team={r.tricode}>
                      <td>
                        <TeamLink teamId={r.teamId} className="ck-sim-tri">
                          {r.tricode}
                        </TeamLink>
                      </td>
                      <td data-testid="hist-apps">
                        {r.apps} of {SEASONS.length}
                      </td>
                      {r.stages.map((x) => (
                        <td key={x.year} className={`ck-hist-stage ck-hist-${x.stage.toLowerCase()}`} title={`${x.year}: ${x.stage === 'Group' ? 'out in group play' : x.stage === 'Champion' ? 'champion' : `lost in the ${x.stage === 'QF' ? 'quarterfinals' : x.stage === 'SF' ? 'semifinals' : 'final'}`}`}>
                          {STAGE_SHORT[x.stage]}
                        </td>
                      ))}
                      <td>
                        {r.w}-{r.l}
                      </td>
                      <td className={r.diff > 0 ? 'ck-cup-pos-text' : r.diff < 0 ? 'ck-cup-neg-text' : ''}>{signed(r.diff)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
      <div className="ck-hist-season" data-testid="hist-season" data-year={s.year}>
        <header className="ck-hist-shead">
          <span className="ck-tabs" role="tablist" aria-label="History season">
            {SEASONS.map((x) => (
              <button key={x.year} type="button" role="tab" aria-selected={x.year === s.year} className={`ck-tab${x.year === s.year ? ' ck-tab-selected' : ''}`} data-text={String(x.year)} onClick={() => onSeason(x.year)}>
                {x.year}
              </button>
            ))}
          </span>
          <h3>
            {s.season} {name(s)}
          </h3>
          {notes.length > 0 && (
            <span className="ck-hist-notes" data-testid="hist-notes" title={`From the stored data (sources: ${s.sources.join(', ')})`}>
              {notes.join(' · ')}
            </span>
          )}
        </header>
        <div className="ck-hist-groups">
          {(['West', 'East'] as const).map((c) => (
            <div key={c} className="ck-sim-conf">
              {[...new Set(s.teams.filter((t) => t.conference === c).map((t) => t.group))].sort().map((g) => (
                <HistTable key={g} group={g} teams={s.teams.filter((t) => t.group === g).sort((a, b) => a.groupRank - b.groupRank)} />
              ))}
            </div>
          ))}
        </div>
        <HistBracket data={data} s={s} prize={prize} />
      </div>
    </section>
  );
}

function HistTable({ group, teams }: { group: string; teams: HTeam[] }) {
  return (
    <div className="ck-sim-table" data-testid="hist-group" data-group={group}>
      <div className="ck-sim-trow ck-sim-thead">
        <span className="ck-sim-gname">{group.replace(' Group ', ' ').toUpperCase()}</span>
        <span>W-L</span>
        <span>DIFF</span>
      </div>
      {teams.map((t) => (
        <div key={t.teamId} className="ck-hist-trow" data-team={t.tricode} data-status={t.groupWinner ? 'leader' : t.wildCard ? 'wild-card' : ''}>
          <span className="ck-sim-rank">{t.groupWinner ? <span className="ck-cup-star">★</span> : t.wildCard ? <span className="ck-cup-wc">WC</span> : t.groupRank}</span>
          <TeamLink teamId={t.teamId} className="ck-sim-tri">
            {t.tricode}
          </TeamLink>
          <span className="ck-hist-squares">
            {t.games.map((g) => {
              const opp = TEAMS.find((x) => x.tricode === g.opponent);
              const url = g.date && opp ? gameLinkUrl({ dateEt: g.date, homeTeam: g.home ? { teamId: t.teamId, teamTricode: t.tricode } : { teamId: opp.id, teamTricode: opp.tricode }, awayTeam: g.home ? { teamId: opp.id, teamTricode: opp.tricode } : { teamId: t.teamId, teamTricode: t.tricode } }) : undefined;
              const final = g.score != null && g.oppScore != null ? (g.home ? `${g.opponent} ${g.oppScore} @ ${t.tricode} ${g.score}` : `${t.tricode} ${g.score} @ ${g.opponent} ${g.oppScore}`) + ` · ${g.status ?? 'Final'}` : undefined;
              return <CupSquare key={g.gameId} g={{ gameId: g.gameId, opponent: g.opponent, home: g.home, played: true, win: g.win, margin: g.score != null && g.oppScore != null ? g.score - g.oppScore : undefined, final }} url={url} />;
            })}
          </span>
          <span className="ck-sim-rec">
            {t.w}-{t.l}
          </span>
          <span className={`ck-cup-chip ck-sim-diff ${t.diff > 0 ? 'ck-cup-pos' : t.diff < 0 ? 'ck-cup-neg' : 'ck-cup-zero'}`}>{signed(t.diff)}</span>
        </div>
      ))}
    </div>
  );
}

function HistBracket({ data, s, prize }: { data: CalendarData; s: Season; prize?: ReturnType<typeof prizeLines> }) {
  const game = (k: Ko) => {
    const v = historyVenue(data, k);
    const won = k.home.score > k.away.score ? k.home.teamId : k.away.teamId;
    const side = (t: Ko['home']) => (
      <span className={`ck-sim-bteam${won === t.teamId ? ' ck-sim-won' : ' ck-sim-lost'}`} data-team={t.tricode}>
        <TeamLink teamId={t.teamId} className="ck-sim-tri">
          {t.tricode}
        </TeamLink>
        {t.score}
        {v.kind === 'host' && v.teamId === t.teamId && <HostTag />}
      </span>
    );
    const url = gameLinkUrl({ dateEt: k.date, homeTeam: { teamId: k.home.teamId, teamTricode: k.home.tricode }, awayTeam: { teamId: k.away.teamId, teamTricode: k.away.tricode } });
    return (
      <a key={k.gameId} className="ck-sim-bgame ck-hist-bgame" data-testid={`hist-${k.round}`} href={url} target="_blank" rel="noopener noreferrer" title={`${k.away.tricode} ${k.away.score} @ ${k.home.tricode} ${k.home.score} · ${k.status} · ${k.arena}, ${k.city} — open on hoopsjunkie`}>
        <span className="ck-sim-bround">{k.round === 'final' ? 'Final' : k.round.toUpperCase()}</span>
        {side(k.away)}
        <span className="ck-sim-vs">@</span>
        {side(k.home)}
        {v.kind !== 'host' && <VenueBadge venue={v} />}
      </a>
    );
  };
  return (
    <div className="ck-sim-panel ck-sim-bracket" data-testid="hist-bracket">
      <h3>Knockout rounds</h3>
      <div className="ck-sim-bgrid">
        {(['West', 'East'] as const).map((c) => (
          <div key={c} className="ck-sim-bconf">
            <h4>{c}</h4>
            {s.knockout.filter((k) => k.round === 'qf' && k.conference === c).map(game)}
            {prize && <PrizeLine text={prize.qf} source={CUP_PRIZES[s.year]!.source} />}
            {s.knockout.filter((k) => k.round === 'sf' && k.conference === c).map(game)}
            {prize && <PrizeLine text={prize.sf} source={CUP_PRIZES[s.year]!.source} />}
          </div>
        ))}
        <div>
          {s.knockout.filter((k) => k.round === 'final').map(game)}
          {prize && <PrizeLine text={prize.final} source={CUP_PRIZES[s.year]!.source} />}
        </div>
      </div>
    </div>
  );
}
