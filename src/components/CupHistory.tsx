// Cup → History — every finished NBA Cup as it happened (src/data/cupHistory.json, built from the NBA's own data by
// scripts/build-cup-history.ts; never recomputed with today's rules; shaped by src/data/cupPast.ts). Three pages:
// - Summary ("who usually makes the cut": knockout appearances, how far each year, group-play totals; sortable).
// - A season, Groups (CK-43 A): laid out exactly like Cup › Groups — the six final group tables with the shared pill
//   and squares, the season's small knockout bracket where Groups has "Who advances" (its title or empty area opens
//   the full bracket), and the final wild-card race.
// - A season, Bracket (CK-43 B): the knockout bracket alone, as big as the window allows — West QF → SF → Final ← SF
//   ← QF East, the champion large in the middle; every game with its teams, score, date, venue, how each team got
//   there, its seed, its record going in, rest and travel, and the round's prize money.
// Neither season page scrolls at a full-size desktop window (e2e/cuphistory.spec.ts). Where a season's rules differed
// from today's (from NBA.com only: RULE_NOTES), a short note fills the spare room.

import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { CUP_PRIZES, prizeLines } from '../data/cupPrize';
import { cupName, pastGroups, pastHost, pastOt, pastPrep, pastQualified, pastRaces, pastWinner, RULE_NOTES, SEASONS, seasonOf, type Ko, type KoSide, type Season } from '../data/cupPast';
import { dateFormat, type CalendarData } from '../data/model';
import { TEAM_BY_ID, TEAMS } from '../data/teams';
import { CupSquare } from '../slate/CupSquare';
import { gameLinkUrl } from '../slate/links';
import { TeamLink } from '../slate/teamLink';
import { HostTag, VenueBadge, type Venue } from '../slate/VenueMarker';
import { GroupCard, Logo, signed, TeamPill, WildCardPanel } from './CupGroupParts';
import { PrizeLine } from './CupSimulator';
import { Segmented } from './Segmented';

export { SEASONS };
export type Stage = 'Group' | 'QF' | 'SF' | 'Final' | 'Champion';
export type HistView = 'groups' | 'bracket';

const fmtDay = (d: string) => dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${d}T12:00:00Z`));

/** How far a team got in a season. */
export function stageOf(s: Season, teamId: number): Stage {
  const final = s.knockout.find((k) => k.round === 'final');
  if (final && pastWinner(final).teamId === teamId) return 'Champion';
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

/** A stored knockout game's venue: in the home team's own arena → host; else neutral. */
export function historyVenue(data: CalendarData, k: Ko): Venue {
  if (!k.arena) return { kind: 'tbd' };
  const host = pastHost(data, k);
  return host !== undefined ? { kind: 'host', teamId: host } : { kind: 'neutral', arena: k.arena, city: k.city || undefined };
}

const STAGE_SHORT: Record<Stage, string> = { Group: '–', QF: 'QF', SF: 'SF', Final: 'F', Champion: '🏆' };
type SortKey = 'apps' | 'team' | 'wl' | 'diff';

export interface CupHistoryProps {
  data: CalendarData;
  /** The season shown; none: the summary. */
  season?: number;
  view?: HistView;
  onSeason: (year: number | undefined) => void;
  onView?: (view: HistView) => void;
}

export default function CupHistory({ data, season, view = 'groups', onSeason, onView = () => {} }: CupHistoryProps) {
  const s = seasonOf(season);
  const fill = useFillWindow(view === 'bracket' && !!s);
  const tabs = (
    <span className="ck-tabs" role="tablist" aria-label="History season">
      {[undefined, ...SEASONS.map((x) => x.year).reverse()].map((y) => (
        <button key={y ?? 'all'} type="button" role="tab" aria-selected={y === s?.year} className={`ck-tab${y === s?.year ? ' ck-tab-selected' : ''}`} data-text={y ? String(y) : 'Summary'} onClick={() => onSeason(y)}>
          {y ?? 'Summary'}
        </button>
      ))}
    </span>
  );
  if (!s)
    return (
      <section className="ck-history" aria-label="NBA Cup history" data-testid="cup-history">
        <header className="ck-cup-head">
          {tabs}
          <h2 className="ck-cup-title">NBA Cup history</h2>
        </header>
        <Summary />
      </section>
    );
  const head = (what: string) => (
    <header className="ck-cup-head ck-hist-shead">
      {tabs}
      <h2 className="ck-cup-title">
        {s.season} {cupName(s)} · {what}
      </h2>
      <Segmented label="History view" value={view} options={[['groups', 'Groups'], ['bracket', 'Bracket']]} onChange={onView} />
    </header>
  );
  return (
    <section className="ck-cupview ck-hist-cupview" aria-label="NBA Cup history" data-testid="cup-history">
      {view === 'bracket' ? (
        <div className="ck-hb-page" ref={fill} data-testid="hist-season" data-year={s.year} data-view="bracket">
          {head('Knockout bracket')}
          <FullBracket data={data} s={s} />
        </div>
      ) : (
        <div className="ck-hist-page" data-testid="hist-season" data-year={s.year} data-view="groups">
          <div className="ck-cup-capture">
            {head('Final group tables')}
            <div className="ck-cup-grid">
              {pastGroups(s).map((g) => (
                <GroupCard key={g.group} group={g.group} short={g.short}>
                  {g.teams.map((t) => (
                    <TeamPill key={t.teamId} t={t} done slots={<PastSquares s={s} teamId={t.teamId} />} />
                  ))}
                </GroupCard>
              ))}
            </div>
          </div>
          <div className="ck-cup-panels">
            <MiniBracket data={data} s={s} onOpen={() => onView('bracket')} />
            <WildCardPanel races={pastRaces(s)} />
          </div>
        </div>
      )}
    </section>
  );
}

function Summary() {
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
  const head = (k: SortKey, label: string) => (
    <button type="button" className={`ck-hist-sort${sort === k ? ' ck-hist-sorted' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)}>
      {label}
    </button>
  );
  return (
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
  );
}

/** A team's 4 stored group games as the shared squares, each its game page. */
function PastSquares({ s, teamId }: { s: Season; teamId: number }) {
  const t = s.teams.find((x) => x.teamId === teamId)!;
  return (
    <>
      {t.games.map((g) => {
        const opp = TEAMS.find((x) => x.tricode === g.opponent);
        const me = { teamId: t.teamId, teamTricode: t.tricode };
        const them = opp && { teamId: opp.id, teamTricode: opp.tricode };
        const url = g.date && them ? gameLinkUrl({ dateEt: g.date, homeTeam: g.home ? me : them, awayTeam: g.home ? them : me }) : undefined;
        const final = g.score != null && g.oppScore != null ? (g.home ? `${g.opponent} ${g.oppScore} @ ${t.tricode} ${g.score}` : `${t.tricode} ${g.score} @ ${g.opponent} ${g.oppScore}`) + ` · ${g.status ?? 'Final'}` : undefined;
        return <CupSquare key={g.gameId} g={{ gameId: g.gameId, opponent: g.opponent, home: g.home, played: true, win: g.win, margin: g.score != null && g.oppScore != null ? g.score - g.oppScore : undefined, final }} url={url} />;
      })}
    </>
  );
}

const koUrl = (k: Ko) => gameLinkUrl({ dateEt: k.date, homeTeam: { teamId: k.home.teamId, teamTricode: k.home.tricode }, awayTeam: { teamId: k.away.teamId, teamTricode: k.away.tricode } });
const ROUND: Record<string, string> = { qf: 'QF', sf: 'SF', final: 'Final' };
const games = (s: Season, round: string, conference?: string) => s.knockout.filter((k) => k.round === round && (!conference || k.conference === conference));

/** The season's bracket in the Groups page's bottom-left panel: small; its title or empty area opens the full bracket. */
function MiniBracket({ data, s, onOpen }: { data: CalendarData; s: Season; onOpen: () => void }) {
  const prize = prizeLines(s.year);
  const note = RULE_NOTES[s.year];
  const open = (e: MouseEvent) => {
    if (!(e.target as Element).closest('a, button')) onOpen();
  };
  const game = (k: Ko) => {
    const v = historyVenue(data, k);
    const won = pastWinner(k).teamId;
    const ot = pastOt(k);
    const side = (t: KoSide) => (
      <span className={`ck-hb-mteam${won === t.teamId ? ' ck-hb-won' : ' ck-hb-lost'}`} data-team={t.tricode}>
        <Logo teamId={t.teamId} size={16} />
        <TeamLink teamId={t.teamId} className="ck-sim-tri">
          {t.tricode}
        </TeamLink>
        <span className="ck-hb-mscore">{t.score}</span>
        {v.kind === 'host' && v.teamId === t.teamId && <HostTag />}
      </span>
    );
    return (
      <div key={k.gameId} className="ck-hb-mgame" data-testid={`hist-${k.round}`} title={`${k.away.tricode} ${k.away.score} @ ${k.home.tricode} ${k.home.score} · ${k.status} · ${fmtDay(k.date)} · ${k.arena}, ${k.city}`}>
        {side(k.away)}
        {side(k.home)}
        <a className="ck-hb-mlink" href={koUrl(k)} target="_blank" rel="noopener noreferrer" data-testid="hist-game-link" title="Open the game's page">
          {ot ? `${ot} ` : ''}↗
        </a>
      </div>
    );
  };
  const col = (label: string, ks: Ko[], cls = '') => (
    <div className={`ck-hb-mcol${cls}`}>
      <span className="ck-hb-mround">{label}</span>
      {ks.map(game)}
    </div>
  );
  const final = games(s, 'final')[0];
  const lasVegas = final && historyVenue(data, final);
  return (
    <div className="ck-cup-panel ck-hb-mini" data-testid="hist-bracket" onClick={open} title="Open the full bracket">
      <h3>
        <button type="button" className="ck-hb-open" onClick={onOpen} data-testid="hist-bracket-open">
          Knockout rounds ⤢
        </button>
      </h3>
      <div className="ck-hb-mbody">
        <div className="ck-hb-mgrid">
          {col('West QF', games(s, 'qf', 'West'))}
          {col('West SF', games(s, 'sf', 'West'))}
          <div className="ck-hb-mcol ck-hb-mcenter">
            <span className="ck-hb-mround">Final</span>
            {final && game(final)}
            {final && (
              <span className="ck-hb-mchamp" data-testid="hist-champion">
                🏆 <TeamLink teamId={pastWinner(final).teamId} className="ck-sim-tri">{pastWinner(final).tricode}</TeamLink>
              </span>
            )}
          </div>
          {col('East SF', games(s, 'sf', 'East'))}
          {col('East QF', games(s, 'qf', 'East'))}
        </div>
        <div className="ck-hb-mextra" data-testid="hist-extra">
          {lasVegas?.kind === 'neutral' && <VenueBadge venue={lasVegas} />}
          {prize && (
            <p className="ck-prize" data-testid="cup-prize" title={`Per player (two-way players: half). Source: ${CUP_PRIZES[s.year]!.source}`}>
              {prize.qf} · {prize.sf} · {prize.final}
            </p>
          )}
          {note && (
            <p className="ck-hist-notes" data-testid="hist-notes" title={`Source: ${note.source}`}>
              Rules then: {note.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The full-screen bracket: every game with everything about it, the champion large in the middle. */
function FullBracket({ data, s }: { data: CalendarData; s: Season }) {
  const prize = prizeLines(s.year);
  const source = CUP_PRIZES[s.year]?.source ?? '';
  const note = RULE_NOTES[s.year];
  const final = games(s, 'final')[0];
  const champ = final && pastWinner(final);
  const champTeam = champ && TEAM_BY_ID.get(champ.teamId);
  const col = (label: string, ks: Ko[], line: string | undefined, cls = '') => (
    <div className={`ck-hb-col${cls}`}>
      <span className="ck-kb-round">{label}</span>
      <div className="ck-hb-games">
        {ks.map((k) => (
          <FullGame key={k.gameId} data={data} s={s} k={k} />
        ))}
      </div>
      {line && <PrizeLine text={line} source={source} />}
    </div>
  );
  return (
    <div className="ck-hb-full" data-testid="hist-full-bracket">
      <div className="ck-hb-grid">
        {col('West · Quarterfinals', games(s, 'qf', 'West'), prize?.qf)}
        {col('West · Semifinal', games(s, 'sf', 'West'), prize?.sf)}
        <div className="ck-hb-col ck-hb-center">
          <span className="ck-kb-round">Final</span>
          {champ && (
            <div className="ck-hb-champ" data-testid="hist-champion" data-team={champ.tricode}>
              <span className="ck-hb-trophy" aria-hidden="true">
                🏆
              </span>
              <Logo teamId={champ.teamId} size={64} />
              <TeamLink teamId={champ.teamId} className="ck-hb-champ-name">
                <span className="ck-kb-champ-city">{champTeam?.city ?? ''}</span>
                {champTeam?.name ?? champ.tricode}
              </TeamLink>
              <span className="ck-hb-champ-what">{s.season} champion</span>
            </div>
          )}
          <div className="ck-hb-games">{final && <FullGame data={data} s={s} k={final} />}</div>
          {prize && <PrizeLine text={prize.final} source={source} />}
        </div>
        {col('East · Semifinal', games(s, 'sf', 'East'), prize?.sf, ' ck-hb-east')}
        {col('East · Quarterfinals', games(s, 'qf', 'East'), prize?.qf, ' ck-hb-east')}
      </div>
      {note && (
        <p className="ck-hist-notes ck-hb-note" data-testid="hist-notes" title={`Source: ${note.source}`}>
          Rules then: {note.text}
        </p>
      )}
    </div>
  );
}

function FullGame({ data, s, k }: { data: CalendarData; s: Season; k: Ko }) {
  const v = historyVenue(data, k);
  const won = pastWinner(k).teamId;
  const ot = pastOt(k);
  const side = (t: KoSide): ReactNode => {
    const q = pastQualified(s, t.teamId);
    const p = pastPrep(data, k, t);
    const conf = TEAM_BY_ID.get(t.teamId)?.conference;
    return (
      <div className={`ck-hb-team${won === t.teamId ? ' ck-hb-won' : ' ck-hb-lost'}`} data-team={t.tricode} data-testid="hb-team">
        <div className="ck-hb-line1">
          {q?.seed && (
            <span className="ck-hb-seed" data-testid="hb-seed" title={`Seed ${q.seed} in the ${conf} (that season's seeding, from the NBA)`}>
              {q.seed}
            </span>
          )}
          <Logo teamId={t.teamId} size={26} />
          <TeamLink teamId={t.teamId} className="ck-hb-tri">
            {t.tricode}
          </TeamLink>
          {v.kind === 'host' && v.teamId === t.teamId && <HostTag />}
          <span className="ck-hb-record" data-testid="hb-record" title="Regular-season record going into the game">
            {t.record.w}-{t.record.l}
          </span>
          <span className="ck-hb-score">
            {t.score}
            {ot && won === t.teamId && <span className="ck-hb-ot" data-testid="hb-ot"> {ot}</span>}
          </span>
        </div>
        {q && (
          <div className="ck-hb-sub" data-testid="hb-qualified">
            {q.group} · {q.how} · {q.w}-{q.l} <span className="ck-hb-diff">{signed(q.diff)}</span>
          </div>
        )}
        {p && (
          <div className="ck-hb-sub ck-ko-prep" data-testid="ko-prep" title={p.tip}>
            {p.text}
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="ck-hb-game" data-testid={`hb-${k.round}`} data-game-id={k.gameId}>
      <a className="ck-hb-ghead" href={koUrl(k)} target="_blank" rel="noopener noreferrer" data-testid="hb-game-link" title="Open the game's page">
        <span className="ck-hb-gdate" data-testid="hb-date">
          {ROUND[k.round]} · {fmtDay(k.date)}
        </span>
        <span>{k.status}{' '}↗</span>
      </a>
      <div className="ck-hb-venue" data-testid="hb-venue">
        {v.kind === 'neutral' ? (
          <VenueBadge venue={v} />
        ) : (
          <span>
            {k.arena}, {k.city}
          </span>
        )}
      </div>
      {side(k.away)}
      {side(k.home)}
    </div>
  );
}

/** The full bracket's height: the window below its top (less the page's bottom padding), kept on resize — no scroll bar. */
function useFillWindow(on: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const fit = () => {
      el.style.height = '';
      el.style.height = `${Math.max(320, Math.floor(innerHeight - el.getBoundingClientRect().top - window.scrollY - 12))}px`;
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [on]);
  return ref;
}
