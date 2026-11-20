// CK-23: "Pop out live scores" — a small always-on-top window (Document Picture-in-Picture, like halftime-timer's
// pop-out; Chrome / Edge desktop, the button is hidden elsewhere) with the Slate's day: one line per game, its tip-off,
// "LIVE Q3 4:12" in red or the final, and the score. Before the first game it is a countdown to that game's tip-off and
// turns into the list by itself then: one click, one window for the whole night. Its live data is CK-21's (the odds
// store through LiveScores), with the same polling rules: nothing is asked while nothing is live or about to be.
//
// The window outlives the Slate (it belongs to the page, not the view): the button opens it through `livePopout` (a
// small store) and the shell's <LivePopoutHost> renders into it, so going to another day, view or place keeps it.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { overtimeOf, tipoff, type CalendarData } from '../data/model';
import type { GameLive } from '../data/odds';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { LiveLabel, useLive } from '../slate/live';
import { slateGames } from '../slate/SlateCard';

interface PipApi {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
}
const pip = () => (typeof window === 'undefined' ? undefined : (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture);
/** Document Picture-in-Picture exists here (Chrome / Edge 116+ on desktop). */
export const popoutSupported = () => !!pip();

/** The window's size: 320 px wide, as tall as a normal night (up to 15 games) needs without a scrollbar. */
export const POP_WIDTH = 320;
export const popHeight = (games: number) => Math.min(15, Math.max(games, 4)) * POP_LINE + POP_CHROME;
/** One game line, and the window's title line and padding (popout.css). */
export const POP_LINE = 26;
export const POP_CHROME = 52;

// ---------- what a line shows (pure, unit-tested) ----------
export interface PopRow {
  id: string;
  away: string;
  home: string;
  awayScore?: number;
  homeScore?: number;
  /** upcoming: its tip-off; live: "Q3 4:12"; final: "Final", "Final/OT". */
  state: 'upcoming' | 'live' | 'final';
  status: string;
}

/** A game's line now: `game` as useLive gives it (final once ESPN has it), `live` while it is being played. */
export function popRow(game: ScheduleGame, live: GameLive | undefined, timeZone?: string): PopRow {
  const base = { id: game.gameId, away: game.awayTeam.teamTricode, home: game.homeTeam.teamTricode };
  if (live) return { ...base, awayScore: live.away, homeScore: live.home, state: 'live', status: '' };
  if (game.status === 'final') {
    const ot = overtimeOf(game.statusText);
    return { ...base, awayScore: game.awayTeam.score, homeScore: game.homeTeam.score, state: 'final', status: ot ? `Final/${ot}` : 'Final' };
  }
  return { ...base, state: 'upcoming', status: tipoff(game, timeZone).label };
}

/** The first game with a set tip-off and when it is; undefined when none has one. */
export function firstGame(games: readonly ScheduleGame[]): { game: ScheduleGame; at: number } | undefined {
  let best: { game: ScheduleGame; at: number } | undefined;
  for (const g of games) {
    if (!g.startTimeUtc) continue;
    const at = Date.parse(g.startTimeUtc);
    if (!best || at < best.at) best = { game: g, at };
  }
  return best;
}

/** "1:23:45", "23:45", "0:05": the time left to `at`. */
export function countdownText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// ---------- the store the button and the host share ----------
interface Opened {
  win: Window;
  date: string;
  tvOnly: boolean;
}
function createPopoutStore() {
  let cur: Opened | undefined;
  const fns = new Set<() => void>();
  const set = (o: Opened | undefined) => {
    cur = o;
    fns.forEach((f) => f());
  };
  return {
    get: () => cur,
    subscribe: (f: () => void) => (fns.add(f), () => void fns.delete(f)),
    /** Opens the window (or closes it when open). Called from the click, as the browser asks. */
    async toggle(data: CalendarData, date: string, tvOnly: boolean) {
      if (cur) return cur.win.close();
      const api = pip();
      if (!api) return;
      const win = await api.requestWindow({ width: POP_WIDTH, height: popHeight(slateGames(data, date, tvOnly).length) });
      copyStyles(document, win.document);
      win.document.title = 'Live scores — calendarkit';
      // the window's own page (the widget's stylesheet has no body rules: it is shared with the gauntlet)
      Object.assign(win.document.body.style, { margin: '0', background: '#0f1115' });
      win.addEventListener('pagehide', () => cur?.win === win && set(undefined));
      set({ win, date, tvOnly });
    },
    close: () => cur?.win.close(),
  };
}
export const livePopout = createPopoutStore();
const useOpened = () => useSyncExternalStore(livePopout.subscribe, livePopout.get);

/** The page's styles into the window (the cards' colours, the LIVE label, the font). */
function copyStyles(from: Document, to: Document) {
  for (const sheet of [...from.styleSheets]) {
    try {
      const style = to.createElement('style');
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      to.head.append(style);
    } catch {
      if (!sheet.href) continue;
      const link = to.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      to.head.append(link);
    }
  }
}

// ---------- the button (the Slate's tools row) and the window's content ----------
export function LivePopoutButton({ data, date, tvOnly }: { data: CalendarData; date: string; tvOnly: boolean }) {
  const opened = useOpened();
  if (!popoutSupported()) return null;
  return (
    <button type="button" className="ck-tool ck-popout-btn" data-testid="live-popout" aria-pressed={!!opened} title={opened ? 'Close the floating live scores window' : 'A small window that stays on top of other apps: the day’s games and live scores'} onClick={() => void livePopout.toggle(data, date, tvOnly)}>
      {opened ? 'Close live scores window' : '⧉ Pop out live scores'}
    </button>
  );
}

/** In the shell: renders the window's content while it is open; closes it with the page. */
export function LivePopoutHost({ data, timeZone }: { data: CalendarData; timeZone?: string }) {
  const opened = useOpened();
  useEffect(() => () => livePopout.close(), []);
  if (!opened) return null;
  return createPortal(<PopWindow data={data} date={opened.date} tvOnly={opened.tvOnly} timeZone={timeZone} />, opened.win.document.body);
}

function PopWindow({ data, date, tvOnly, timeZone }: { data: CalendarData; date: string; tvOnly: boolean; timeZone?: string }) {
  const games = slateGames(data, date, tvOnly);
  const first = firstGame(games);
  const [now, setNow] = useState(Date.now);
  const waiting = !!first && now < first.at;
  // a second's tick only while counting down; at tip-off the list takes over and the tick stops
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waiting]);
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <div className="ck-root ck-popwin" data-testid="popout">
      <div className="ck-popwin-head">
        <span>NBA · {day}</span>
        <span className="ck-popwin-count">{games.length ? `${games.length} game${games.length === 1 ? '' : 's'}` : ''}</span>
      </div>
      {!games.length ? (
        <p className="ck-popwin-none">No games.</p>
      ) : waiting ? (
        <div className="ck-popwin-countdown" data-testid="popout-countdown">
          <span className="ck-popwin-first">
            First game · {first!.game.awayTeam.teamTricode} @ {first!.game.homeTeam.teamTricode} {tipoff(first!.game, timeZone).label}
          </span>
          <span className="ck-popwin-clock" data-testid="popout-clock">
            {countdownText(first!.at - now)}
          </span>
        </div>
      ) : (
        <ol className="ck-popwin-list" data-testid="popout-list">
          {games.map((g) => (
            <PopLine key={g.gameId} g={g} timeZone={timeZone} />
          ))}
        </ol>
      )}
    </div>
  );
}

function PopLine({ g, timeZone }: { g: ScheduleGame; timeZone?: string }) {
  const { game, live } = useLive(g);
  const r = popRow(game, live, timeZone);
  const scored = r.awayScore !== undefined && r.homeScore !== undefined;
  const winner = r.state === 'final' && scored ? (r.awayScore! > r.homeScore! ? 'away' : 'home') : undefined;
  return (
    <li className={`ck-popwin-row ck-popwin-${r.state}`} data-game-id={r.id} data-state={r.state}>
      <span className="ck-popwin-status">{live ? <LiveLabel live={live} /> : r.status}</span>
      <span className="ck-popwin-match">
        <span className={winner === 'away' ? 'ck-popwin-win' : undefined}>{r.away}</span>
        {scored && <span className="ck-popwin-score">{r.awayScore}</span>}
        <span className="ck-popwin-at">@</span>
        {scored && <span className="ck-popwin-score">{r.homeScore}</span>}
        <span className={winner === 'home' ? 'ck-popwin-win' : undefined}>{r.home}</span>
      </span>
    </li>
  );
}
