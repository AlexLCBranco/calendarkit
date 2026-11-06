// Round 21 (item 4): the NBA Cup simulator ("what if") — the Cup's Simulator tab. Real results stay as they are; the
// group games still to play can be picked (Quick: click the winner; Detailed: the winner and the margin) and everything
// is worked out again by the shared rules engine (cupEngine.ts) on every pick: the group tables (West | East), each
// conference's wild-card race, the seeds and the knockout bracket with its hosts. A pick without a margin is never turned
// into a guess: a spot that depends on one says "depends on margin" and points at the games. Nothing is fetched; picks
// live in the page (they survive leaving the Cup and coming back, not a reload) and never touch real data.

import { useMemo, type CSSProperties } from 'react';
import { CUP_GROUP_END, cupGroupsOf, isCountedCupGame, LAST_SEASON_WINS, realResults } from '../data/cup';
import { computeCup, semifinal, type GroupResult, type RankedLine, type Seed, type Tiebreak } from '../data/cupEngine';
import { dateFormat, type CalendarData } from '../data/model';
import { TEAM_BY_ID, teamLogo, type Conference } from '../data/teams';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { GameLink } from '../slate/links';
import { TeamLink } from '../slate/teamLink';
import { HostTag, VenueBadge, type Venue } from '../slate/VenueMarker';
import { TEAM_COLOR } from './CupView';

export interface SimPick {
  winner: number;
  /** Detailed mode: the winner's margin (≥ 1); none: a quick pick. */
  margin?: number;
}
export type SimPicks = ReadonlyMap<string, SimPick>;
export type SimMode = 'quick' | 'detailed';

export const TIEBREAK_WON: Record<Tiebreak, string> = {
  h2h: 'won on head-to-head',
  diff: 'won on point differential',
  points: 'won on points scored',
  'last-season': 'won on 2025-26 record',
};
const TB_SHORT: Record<Tiebreak, string> = { h2h: 'H2H', diff: 'PD', points: 'PTS', 'last-season': '25-26' };
const tri = (id: number) => TEAM_BY_ID.get(id)?.tricode ?? '?';
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const fmtDay = (d: string) => dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${d}T12:00:00Z`));

/** The engine's input: the real results, then the picks of games not played yet (points unknown: picks have no score). */
export function simResults(data: CalendarData, picks: SimPicks): GroupResult[] {
  const counted = data.games.filter(isCountedCupGame);
  const real = realResults(counted, data.regulation);
  const played = new Set(counted.map((g) => g.gameId));
  const out = [...real];
  for (const g of data.games) {
    const p = picks.get(g.gameId);
    if (!p || played.has(g.gameId) || !g.isCupGroupGame) continue;
    out.push({ gameId: g.gameId, home: g.homeTeam.teamId, away: g.awayTeam.teamId, winner: p.winner, margin: p.margin, picked: true });
  }
  return out;
}

/** The whole simulated Cup (the engine) for these picks. */
export const simulate = (data: CalendarData, picks: SimPicks) => computeCup(cupGroupsOf(data.games), simResults(data, picks), LAST_SEASON_WINS);

export interface CupSimulatorProps {
  data: CalendarData;
  gameLink?: GameLink;
  picks: SimPicks;
  onPicks: (picks: SimPicks) => void;
  mode: SimMode;
  onMode: (mode: SimMode) => void;
}

export default function CupSimulator({ data, gameLink, picks, onPicks, mode, onMode }: CupSimulatorProps) {
  const res = useMemo(() => simulate(data, picks), [data, picks]);
  // every group game, by date: played ones (real) and the rest (to pick)
  const nights = useMemo(() => {
    const m = new Map<string, ScheduleGame[]>();
    for (const g of data.games) if (g.isCupGroupGame && g.dateEt <= CUP_GROUP_END) (m.get(g.dateEt) ?? m.set(g.dateEt, []).get(g.dateEt)!).push(g);
    return [...m];
  }, [data]);
  const played = useMemo(() => new Set(data.games.filter(isCountedCupGame).map((g) => g.gameId)), [data]);
  // the games a "depends on margin" spot needs a margin for
  const needMargin = useMemo(() => {
    const s = new Set<string>();
    const add = (u?: { games: string[] }) => u?.games.forEach((id) => s.add(id));
    res.groups.forEach((g) => g.teams.forEach((t) => add(t.undecided)));
    res.wildCards.forEach((w) => w.teams.forEach((t) => (add(t.wcUndecided), add(t.undecided))));
    Object.values(res.seeds).forEach((ss) => ss.forEach((x) => add(x.undecided)));
    return s;
  }, [res]);
  const set = (gameId: string, p?: SimPick) => {
    const next = new Map(picks);
    if (p) next.set(gameId, p);
    else next.delete(gameId);
    onPicks(next);
  };
  const final = data.games.find((g) => g.gameType === 'cup-final');
  const finalVenue: Venue = final?.arenaName ? { kind: 'neutral', arena: final.arenaName, city: final.arenaCity || undefined } : { kind: 'tbd' };
  return (
    <section className="ck-sim" aria-label="NBA Cup simulator" data-testid="cup-sim" data-mode={mode}>
      <header className="ck-sim-head">
        <span className="ck-sim-banner" data-testid="sim-banner">
          SIMULATION
        </span>
        <span className="ck-sim-note">What if: picks change nothing real. Real results stay; pick the games to come.</span>
        <span className="ck-tabs ck-sim-mode" role="tablist" aria-label="Pick mode">
          {(['quick', 'detailed'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={`ck-tab${mode === m ? ' ck-tab-selected' : ''}`} data-text={m === 'quick' ? 'Quick' : 'Detailed'} onClick={() => onMode(m)}>
              {m === 'quick' ? 'Quick' : 'Detailed'}
            </button>
          ))}
        </span>
        <button type="button" className="ck-button" data-testid="sim-reset" disabled={!picks.size} onClick={() => onPicks(new Map())}>
          Reset to real results
        </button>
      </header>
      <div className="ck-sim-games" data-testid="sim-games" style={{ '--ck-sim-nights': nights.length } as CSSProperties}>
        {nights.map(([date, games]) => (
          <div key={date} className="ck-sim-night" data-night={date}>
            <h3 className="ck-sim-night-head">{fmtDay(date)}</h3>
            {games.map((g) => (
              <SimGame key={g.gameId} g={g} real={played.has(g.gameId)} pick={picks.get(g.gameId)} mode={mode} needsMargin={needMargin.has(g.gameId)} url={gameLink?.(g)} onPick={(p) => set(g.gameId, p)} />
            ))}
          </div>
        ))}
      </div>
      <div className="ck-sim-groups">
        {(['West', 'East'] as const).map((c) => (
          <div key={c} className="ck-sim-conf" data-conference={c}>
            {res.groups
              .filter((g) => g.conference === c)
              .map((g) => (
                <SimTable key={g.group} name={g.group.replace(' Group ', ' ')} teams={g.teams} wc={res.wildCards.find((w) => w.conference === c)!.teams[0]?.teamId} />
              ))}
          </div>
        ))}
      </div>
      <div className="ck-sim-bottom">
        <div className="ck-sim-panel" data-testid="sim-wildcards">
          <h3>Wild card race</h3>
          <div className="ck-sim-races">
            {res.wildCards.map((w) => (
              <div key={w.conference} className="ck-sim-race" data-conference={w.conference}>
                <h4>{w.conference}</h4>
                {w.teams.map((t, i) => {
                  const und = t.wcUndecided ?? t.undecided;
                  return (
                    <div key={t.teamId} className={`ck-sim-race-row${i === 0 ? ' ck-sim-holder' : ''}`} data-team={t.tricode}>
                      <span className="ck-cup-mark">{i === 0 ? <span className="ck-cup-wc">WC</span> : ''}</span>
                      <Logo id={t.teamId} />
                      <TeamLink teamId={t.teamId} className="ck-sim-tri">
                        {t.tricode}
                      </TeamLink>
                      <span className="ck-sim-sub">2nd, {t.group.replace(' Group ', ' ')}</span>
                      <span className="ck-sim-rec">
                        {t.w}-{t.l}
                      </span>
                      <Diff t={t} />
                      {und ? <Depends u={und} /> : t.wcTiebreak && i <= 1 ? <span className="ck-sim-tb" title={TIEBREAK_WON[t.wcTiebreak]}>{TIEBREAK_WON[t.wcTiebreak]}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <Bracket seeds={res.seeds} quarterfinals={res.quarterfinals} finalVenue={finalVenue} />
      </div>
    </section>
  );
}

function Logo({ id }: { id: number }) {
  const src = teamLogo(id);
  return (
    <TeamLink teamId={id} className="ck-logo-backing" aria-label={tri(id)}>
      {src && <img src={src} alt="" width={16} height={16} />}
    </TeamLink>
  );
}

function Diff({ t }: { t: { diff: number; unknownDiff: string[] } }) {
  if (t.unknownDiff.length)
    return (
      <span className="ck-cup-chip ck-cup-zero ck-sim-diff" title={`Point differential without the margins of ${t.unknownDiff.length} quick pick${t.unknownDiff.length === 1 ? '' : 's'}`}>
        {signed(t.diff)}?
      </span>
    );
  return <span className={`ck-cup-chip ck-sim-diff ${t.diff > 0 ? 'ck-cup-pos' : t.diff < 0 ? 'ck-cup-neg' : 'ck-cup-zero'}`}>{signed(t.diff)}</span>;
}

/** "depends on margin": the spot isn't decided until the named games get a margin. */
function Depends({ u }: { u: { rule: Tiebreak; games: string[] } }) {
  const what = u.rule === 'points' ? 'points scored' : 'margin';
  return (
    <span className="ck-sim-depends" data-testid="sim-depends" data-games={u.games.join(' ')} title={`Decided by ${u.rule === 'points' ? 'points scored' : 'point differential'}: needs the ${what} of ${u.games.length} picked game${u.games.length === 1 ? '' : 's'} (outlined in the list)`}>
      depends on {what}
    </span>
  );
}

function SimTable({ name, teams, wc }: { name: string; teams: RankedLine[]; wc?: number }) {
  return (
    <div className="ck-sim-table" data-testid="sim-group" data-group={name}>
      <div className="ck-sim-trow ck-sim-thead">
        <span className="ck-sim-gname">{name.toUpperCase()}</span>
        <span>W-L</span>
        <span>DIFF</span>
      </div>
      {teams.map((t, i) => (
        <div
          key={t.teamId}
          className="ck-sim-trow ck-sim-team"
          data-team={t.tricode}
          data-status={i === 0 ? 'leader' : t.teamId === wc ? 'wild-card' : ''}
          style={{ '--ck-team': TEAM_COLOR[t.tricode] ?? '#3a3f4a' } as CSSProperties}
          title={t.undecided ? undefined : t.tiebreak ? TIEBREAK_WON[t.tiebreak] : t.tied ? 'Tied: no tiebreaker separates them' : undefined}
        >
          <span className="ck-sim-rank">
            {i === 0 ? <span className="ck-cup-star">★</span> : t.teamId === wc ? <span className="ck-cup-wc">WC</span> : t.rank}
          </span>
          <Logo id={t.teamId} />
          <TeamLink teamId={t.teamId} className="ck-sim-tri">
            {t.tricode}
          </TeamLink>
          <span className="ck-sim-extra">{t.undecided ? <Depends u={t.undecided} /> : t.tiebreak && i <= 1 ? <span className="ck-sim-tbtag">{TB_SHORT[t.tiebreak]}</span> : t.tied ? <span className="ck-sim-tbtag">tied</span> : null}</span>
          <span className="ck-sim-rec">
            {t.w}-{t.l}
          </span>
          <Diff t={t} />
        </div>
      ))}
    </div>
  );
}

/** One unplayed (or played: its result, a game link) group game. Quick: click a team to give it the win; Detailed: also the margin. */
function SimGame({ g, real, pick, mode, needsMargin, url, onPick }: { g: ScheduleGame; real: boolean; pick?: SimPick; mode: SimMode; needsMargin: boolean; url?: string; onPick: (p?: SimPick) => void }) {
  const a = g.awayTeam;
  const h = g.homeTeam;
  if (real) {
    const winner = h.score > a.score ? h.teamId : a.teamId;
    return (
      <a className="ck-sim-game ck-sim-real" href={url} target="_blank" rel="noopener noreferrer" data-game-id={g.gameId} data-testid="sim-game" title={`${a.teamTricode} ${a.score} @ ${h.teamTricode} ${h.score} · ${g.statusText} — open on hoopsjunkie`}>
        <span className={winner === a.teamId ? 'ck-sim-won' : 'ck-sim-lost'}>
          {a.teamTricode} {a.score}
        </span>
        <span className="ck-sim-at">@</span>
        <span className={winner === h.teamId ? 'ck-sim-won' : 'ck-sim-lost'}>
          {h.teamTricode} {h.score}
        </span>
      </a>
    );
  }
  const side = (t: typeof a) => (
    <button
      type="button"
      className={`ck-sim-pick${pick?.winner === t.teamId ? ' ck-sim-picked' : pick ? ' ck-sim-notpicked' : ''}`}
      aria-pressed={pick?.winner === t.teamId}
      data-team={t.teamTricode}
      onClick={() => onPick(pick?.winner === t.teamId ? undefined : { winner: t.teamId, margin: pick?.margin })}
      title={`${t.teamTricode} wins`}
    >
      {t.teamTricode}
    </button>
  );
  return (
    <div className={`ck-sim-game${needsMargin ? ' ck-sim-needs' : ''}`} data-game-id={g.gameId} data-testid="sim-game" data-picked={pick ? tri(pick.winner) : undefined}>
      {side(a)}
      <span className="ck-sim-at">@</span>
      {side(h)}
      {mode === 'detailed' && (
        <input
          className="ck-sim-margin"
          type="number"
          min={1}
          max={99}
          placeholder="±"
          aria-label={`Winning margin, ${a.teamTricode} at ${h.teamTricode}`}
          disabled={!pick}
          value={pick?.margin ?? ''}
          onChange={(e) => {
            if (!pick) return;
            const n = Math.round(Number(e.target.value));
            onPick({ winner: pick.winner, margin: e.target.value === '' || !(n >= 1) ? undefined : Math.min(99, n) });
          }}
        />
      )}
      {needsMargin && <span className="ck-sim-needtag" title="A spot depends on this game's margin">margin?</span>}
      {pick && (
        <button type="button" className="ck-sim-undo" title="Undo this pick" aria-label="Undo this pick" onClick={() => onPick(undefined)}>
          ↺
        </button>
      )}
      {url && (
        <a className="ck-slate-link" href={url} target="_blank" rel="noopener noreferrer" title="Open on hoopsjunkie" aria-label="Open on hoopsjunkie">
          ↗
        </a>
      )}
    </div>
  );
}

function SeedTeam({ s, host }: { s?: Seed; host?: boolean }) {
  if (!s) return <span className="ck-sim-bteam">TBD</span>;
  return (
    <span className="ck-sim-bteam" data-team={tri(s.teamId)}>
      <span className="ck-sim-seed">{s.seed}</span>
      <Logo id={s.teamId} />
      <TeamLink teamId={s.teamId} className="ck-sim-tri">
        {tri(s.teamId)}
      </TeamLink>
      {s.wildCard && <span className="ck-cup-wc">WC</span>}
      {host && <HostTag />}
      {s.undecided && <Depends u={s.undecided} />}
    </span>
  );
}

/** The bracket from the seeds: per conference 1 v 4 and 2 v 3 (the better record hosts), the semifinal at the higher seed, the final neutral. */
function Bracket({ seeds, quarterfinals, finalVenue }: { seeds: Record<Conference, Seed[]>; quarterfinals: { conference: Conference; high: Seed; low: Seed; host: number }[]; finalVenue: Venue }) {
  void semifinal;
  return (
    <div className="ck-sim-panel ck-sim-bracket" data-testid="sim-bracket">
      <h3>Knockout bracket</h3>
      <div className="ck-sim-bgrid">
        {(['West', 'East'] as const).map((c) => {
          const qf = quarterfinals.filter((q) => q.conference === c);
          return (
            <div key={c} className="ck-sim-bconf" data-conference={c}>
              <h4>{c}</h4>
              {qf.map((q, k) => (
                <div key={k} className="ck-sim-bgame" data-testid="sim-qf" data-host={tri(q.host)}>
                  <span className="ck-sim-bround">QF</span>
                  <SeedTeam s={q.high} host />
                  <span className="ck-sim-vs">vs</span>
                  <SeedTeam s={q.low} />
                </div>
              ))}
              <div className="ck-sim-bgame ck-sim-bsf" data-testid="sim-sf">
                <span className="ck-sim-bround">SF</span>
                <span className="ck-sim-bteam">QF winners · the higher seed hosts</span>
              </div>
              {!seeds[c].length && <span className="ck-sim-bteam">TBD</span>}
            </div>
          );
        })}
        <div className="ck-sim-bgame ck-sim-bfinal" data-testid="sim-final">
          <span className="ck-sim-bround">Final</span>
          <span className="ck-sim-bteam">West winner vs East winner</span>
          <VenueBadge venue={finalVenue} />
        </div>
      </div>
    </div>
  );
}
