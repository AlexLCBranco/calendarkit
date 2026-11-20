// CK-24: one past NBA season (Standings, a past season picked in the What row): its final standings (West | East side
// by side, the Main columns where ESPN has them), the play-in (2020-21 on), the playoff bracket (West → Finals ← East;
// hover a series for its games, each a link to that day on NBA.com) and, like the Cup history, the champions and
// conference winners of every season (a click opens that season). Its own chunk; the data loads only when opened.

import { useEffect, useRef, useState } from 'react';
import { bracketOf, loadIndex, loadSeason, pastGameUrl, playInLabel, ROUND_NAMES, seasonLabel, type HistGame, type HistIndexRow, type HistRow, type HistSeason, type HistSeries } from '../data/nbaHistory';
import { TEAMS, type Team } from '../data/teams';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { useHoverPopup } from '../slate/hoverPopup';
import { TeamLogo } from './GameCard';

const SERIES_ATTR = 'data-hist-series';
const CONFS = ['West', 'East'] as const;

/** The current team a past one still is (same tricode and nickname: "Seattle SuperSonics" and the Bobcats get none). */
const today = (tri: string, name: string): Team | undefined => {
  const t = TEAMS.find((x) => x.tricode === tri);
  return t && name.toLowerCase().endsWith(t.name.toLowerCase()) ? t : undefined;
};
function Team({ s, tri, short = false }: { s: HistSeason; tri: string; short?: boolean }) {
  const name = s.names[tri] ?? tri;
  const t = today(tri, name);
  return (
    <span className="ck-nh-team" title={name}>
      {t ? <TeamLogo team={{ teamId: t.id, teamTricode: tri } as ScheduleGame['homeTeam']} link={false} /> : <span className="ck-logo-empty" aria-hidden="true" />}
      <span>{short ? tri : name}</span>
    </span>
  );
}

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const signed = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n < 0 ? `−${(-n).toFixed(1)}` : '0.0');

function GameLine({ g, label }: { g: HistGame; label?: string }) {
  const awayWon = g.as > g.hs;
  return (
    <a className="ck-nh-game" href={pastGameUrl(g)} target="_blank" rel="noopener" data-testid="hist-game" title={`${g.away} ${g.as} @ ${g.hs} ${g.home}${g.ot ? ` (${g.ot})` : ''} — that day's games on NBA.com`}>
      <span className="ck-nh-gdate">{label ?? fmtDay(g.date)}</span>
      <span className={awayWon ? 'ck-nh-win' : undefined}>{g.away}</span>
      <span className="ck-nh-score">{g.as}</span>
      <span className="ck-nh-at">@</span>
      <span className="ck-nh-score">{g.hs}</span>
      <span className={awayWon ? undefined : 'ck-nh-win'}>{g.home}</span>
      {g.ot && <span className="ck-nh-ot">{g.ot}</span>}
    </a>
  );
}

function SeriesBox({ s, x, focus = false }: { s: HistSeason; x: HistSeries; focus?: boolean }) {
  const side = (tri: string, seed: number, wins: number) => (
    <span className={`ck-nh-side${x.winner === tri ? ' ck-nh-won' : ''}`}>
      <span className="ck-nh-seed">{seed || ''}</span>
      <Team s={s} tri={tri} short />
      <span className="ck-nh-wins">{wins}</span>
    </span>
  );
  return (
    <div className={`ck-nh-series${focus ? ' ck-nh-series-focus' : ''}`} data-focus={focus || undefined} tabIndex={0} role="button" aria-label={`${ROUND_NAMES[x.round]}: ${x.a} ${x.wins[0]}, ${x.b} ${x.wins[1]}. Show the games`} {...{ [SERIES_ATTR]: `${x.round}|${x.a}|${x.b}` }} data-testid="hist-series" data-round={x.round}>
      {side(x.a, x.aSeed, x.wins[0])}
      {side(x.b, x.bSeed, x.wins[1])}
    </div>
  );
}

function Table({ s, conf }: { s: HistSeason; conf: 'East' | 'West' }) {
  const rows = s.standings[conf];
  const rec = (r: HistRow) => [r.w, r.l, r.pct.toFixed(3).replace(/^0/, ''), r.gb ? String(r.gb) : '—', r.home, r.road, r.conf, r.l10 ?? '', r.streak ?? ''];
  return (
    <table className="ck-st-table ck-nh-table" data-conference={conf} data-testid="hist-table">
      <thead>
        <tr className="ck-st-groups">
          <th colSpan={12} className="ck-st-conf">
            {conf}ern Conference
          </th>
        </tr>
        <tr className="ck-st-cols">
          {[['Seed', 'Playoff seed (play-in years: the place in the standings)'], ['Team', ''], ['W', 'Wins'], ['L', 'Losses'], ['Pct', 'Win %'], ['GB', 'Games behind the 1st seed'], ['Home', 'Home record'], ['Road', 'Road record'], ['Conf', 'Conference record'], ['L10', 'Last 10 games'], ['Strk', 'Streak at the end of the season'], ['Diff', 'Point differential, per game']].map(([h, tip]) => (
            <th key={h} className={h === 'Team' ? 'ck-st-team' : h === 'Seed' ? 'ck-st-seed' : undefined} data-tip={tip || undefined}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.t} className="ck-st-row" data-team={r.t} data-seed={r.seed}>
            <td className="ck-st-seed">{r.seed || ''}</td>
            <td className="ck-st-team">
              <Team s={s} tri={r.t} />
            </td>
            {rec(r).map((v, i) => (
              <td key={i}>{v}</td>
            ))}
            <td className={r.diff > 0 ? 'ck-st-good' : r.diff < 0 ? 'ck-st-bad' : undefined}>{signed(r.diff)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function NbaHistory({ year, onSeason, focus }: { year: number; onSeason: (year: number) => void; /** A playoff series to outline and bring into view (seriesKey) */ focus?: string }) {
  const box = useRef<HTMLElement>(null);
  const [season, setSeason] = useState<HistSeason>();
  const [index, setIndex] = useState<HistIndexRow[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    setError(undefined);
    loadSeason(year).then((s) => live && setSeason(s), (e: Error) => live && setError(e.message));
    return () => void (live = false);
  }, [year]);
  useEffect(() => void loadIndex().then(setIndex, () => {}), []);
  const s = season?.year === year ? season : undefined;
  const pop = useHoverPopup(
    SERIES_ATTR,
    (v) => {
      const x = s?.series.find((q) => `${q.round}|${q.a}|${q.b}` === v);
      if (!x || !s) return null;
      return (
        <div className="ck-nh-pop">
          <div className="ck-nh-pop-head">
            {ROUND_NAMES[x.round]}
            {x.conf ? ` · ${x.conf}` : ''}: {s.names[x.winner]} {Math.max(...x.wins)}–{Math.min(...x.wins)}
          </div>
          {x.games.map((g, i) => (
            <GameLine key={g.id} g={g} label={`G${i + 1} · ${fmtDay(g.date)}`} />
          ))}
        </div>
      );
    },
    { className: 'ck-series-pop ck-nh-popup', label: 'Series games', testId: 'hist-series-popup', pin: true },
  );
  const loaded = !!s;
  useEffect(() => {
    if (focus && loaded) box.current?.querySelector('[data-focus]')?.scrollIntoView?.({ block: 'center' });
  }, [focus, loaded]);
  if (error) return <p className="ck-empty">Couldn’t load {seasonLabel(year)}: {error}</p>;
  if (!s) return <p className="ck-empty">Loading {seasonLabel(year)}…</p>;
  const finals = s.series.find((x) => x.round === 4)!;
  const champ = index?.find((r) => r.year === year);
  return (
    <section ref={box} className="ck-nh" aria-label={`NBA ${s.label}`} data-testid="nba-history" data-year={year} {...pop.handlers}>
      <header className="ck-st-head">
        <h2 className="ck-st-title">{s.label}</h2>
        <span className="ck-st-through" data-testid="hist-champion">
          Champions: {s.names[finals.winner]} ({Math.max(...finals.wins)}–{Math.min(...finals.wins)} over {s.names[finals.winner === finals.a ? finals.b : finals.a]})
        </span>
      </header>
      <div className="ck-st-pair">
        {CONFS.map((c) => (
          <Table key={c} s={s} conf={c} />
        ))}
      </div>

      {s.playIn.length > 0 && (
        <section className="ck-nh-block" data-testid="hist-playin">
          <h3>Play-in</h3>
          <div className="ck-nh-playin">
            {CONFS.map((c) => {
              const teams = new Set(s.standings[c].map((r) => r.t));
              const gs = s.playIn.filter((g) => teams.has(g.away));
              return (
                <div key={c} className="ck-nh-playin-conf">
                  <span className="ck-nh-sub">{c}</span>
                  {gs.map((g) => (
                    <GameLine key={g.id} g={g} label={playInLabel(s.playIn, g)} />
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="ck-nh-block" data-testid="hist-bracket">
        <h3>Playoffs</h3>
        <div className="ck-nh-bracket">
          {(() => {
            const west = bracketOf(s.series, 'West');
            const east = bracketOf(s.series, 'East');
            const col = (list: HistSeries[], key: string, round: number) => (
              <div key={key} className="ck-nh-col" data-round={round}>
                <span className="ck-nh-sub">{ROUND_NAMES[round]}</span>
                <div className="ck-nh-col-body">
                  {list.map((x) => (
                    <SeriesBox key={`${x.a}|${x.b}`} s={s} x={x} focus={`${x.round}|${x.a}|${x.b}` === focus} />
                  ))}
                </div>
              </div>
            );
            return [col(west[0]!, 'w1', 1), col(west[1]!, 'w2', 2), col(west[2]!, 'w3', 3), col([finals], 'f', 4), col(east[2]!, 'e3', 3), col(east[1]!, 'e2', 2), col(east[0]!, 'e1', 1)];
          })()}
        </div>
        <div className="ck-nh-confs" aria-hidden="true">
          <span>West</span>
          <span>East</span>
        </div>
      </section>

      {index && (
        <section className="ck-nh-block" data-testid="hist-summary">
          <h3>Champions and conference winners</h3>
          <table className="ck-hist-table ck-nh-summary">
            <thead>
              <tr>
                <th>Season</th>
                <th>Champion</th>
                <th>Finals</th>
                <th>Runner-up</th>
                <th>West</th>
                <th>East</th>
              </tr>
            </thead>
            <tbody>
              {index.map((r) => (
                <tr key={r.year} className={r.year === year ? 'ck-nh-on' : undefined}>
                  <td>
                    <button type="button" className="ck-nh-link" onClick={() => onSeason(r.year)} title={`Open ${r.label}`}>
                      {r.label}
                    </button>
                  </td>
                  <td className="ck-nh-win">{r.champion}</td>
                  <td>{r.finals.join('–')}</td>
                  <td>{r.runnerUp}</td>
                  <td>{r.west}</td>
                  <td>{r.east}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {champ && <p className="ck-nh-note">From ESPN’s public data, 2001-02 on; game links open that day’s scores on NBA.com.</p>}
        </section>
      )}
      {pop.node}
    </section>
  );
}
