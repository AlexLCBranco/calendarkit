// The maps' shared travel view (League map and Team map). A focused game — hovered or pinned — shows, for both of
// its teams, the leg from the team's previous game to this one (solid) and from this one to its next game (dashed,
// faded), each in the team's colour with its straight-line miles printed on it, and the view zooms to fit those places.
// Under the map, one block per team: last / this / next game with date, time, place, miles, rest and clock change.
// Zoom: a CSS transform on the stage (one composited move; `--k`, the zoom, transitions with it so dots, labels and line
// widths keep their screen size). Labels are placed once per focused game and width (view.ts), never overlapping.

import { memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { rowDate } from '../components/TeamListView';
import { parseHover } from '../components/MapHover';
import { useValue, type ValueStore } from '../components/valueStore';
import { teamLabel, tipoff, type CalendarData } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { TeamLink } from '../slate/teamLink';
import { MAP_H, MAP_W } from './basemap';
import { arc, arcPoint, Basemap, pct } from './draw';
import { placeName, type GameLocation } from './location';
import { gameTravel, tzLabel, type GameTravel, type Leg, type TeamTravel } from './travel';
import { around, fitView, placeLabels, stageTransform, textWidth, toPx, WHOLE, type LabelAsk, type Rect, type View } from './view';
import './map.css';

export type Placed = Exclude<GameLocation, { kind: 'unknown' }>;
export const placed = (l: GameLocation): l is Placed => l.kind !== 'unknown';
/** A team's colour: 'a' the first team (League map: away; Team map: the selected team), 'b' the other. */
export type TeamColor = 'a' | 'b';

/** Under the map: the panel (always this tall: nothing moves when it fills) and the one-line legend. */
export const PANEL_H = 150;
export const LEGEND_H = 26;

/** How long the map keeps a game after the pointer leaves its row (no zoom-out flicker in the gaps between rows). */
const LINGER_MS = 140;

// ---------------------------------------------------------------- fonts (as map.css draws them)

let family: string | undefined;
const font = (weight: number, size: number) => `${weight} ${size}px ${(family ??= typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily || 'sans-serif' : 'sans-serif')}`;
/** A label line: its text, look and height. */
export interface LabelLine {
  text: string;
  color?: TeamColor;
  strong?: boolean;
}
const lineFont = (l: LabelLine) => (l.strong ? font(700, 14) : font(600, 12));
const lineH = (l: LabelLine) => (l.strong ? 17 : 15);
/** Size (px) of a label of these lines (map.css .ck-map-label: 2 px padding each side). */
export const labelSize = (lines: readonly LabelLine[]) => ({ w: Math.ceil(Math.max(...lines.map((l) => textWidth(l.text, lineFont(l))))) + 4, h: lines.reduce((s, l) => s + lineH(l), 0) + 2 });
const distFont = () => font(800, 14);
const DIST_H = 22;

export const cityLabel = (l: Placed) => (l.kind === 'edge' ? `${l.arena.city} ${l.arrow}` : l.arena.city);
const placeKey = (l: Placed) => `${l.arena.arena}|${l.arena.city}`;

// ---------------------------------------------------------------- the focused game's points, lines and labels

interface FocusPoint {
  key: string;
  loc: Placed;
  isThis: boolean;
  /** The dot's colour: the team's, or none (white) when both teams' places meet here. */
  color?: TeamColor;
  lines: LabelLine[];
  /** The label drawn at this point: its lines and those of places merged into it (none: merged into another). */
  label?: LabelLine[];
}
interface FocusLine {
  key: string;
  color: TeamColor;
  kind: 'prev' | 'next';
  from: Placed;
  to: Placed;
  miles?: number;
}
export interface FocusLayout {
  view: View;
  points: FocusPoint[];
  lines: FocusLine[];
  labels: Map<string, Rect>;
}

function focusParts(tv: GameTravel, colorOf: (teamId: number) => TeamColor): { points: FocusPoint[]; lines: FocusLine[] } {
  const here = tv.loc;
  if (!placed(here)) return { points: [], lines: [] };
  const g = tv.game;
  const self: FocusPoint = { key: placeKey(here), loc: here, isThis: true, lines: [{ text: cityLabel(here), strong: true }, { text: `${teamLabel(g.awayTeam)} @ ${teamLabel(g.homeTeam)}` }] };
  const pts = new Map([[self.key, self]]);
  const lines: FocusLine[] = [];
  for (const t of tv.teams) {
    const c = colorOf(t.teamId);
    for (const kind of ['prev', 'next'] as const) {
      const leg = t[kind];
      if (!leg) continue;
      if (leg.stays) {
        self.lines.push({ text: `${t.team} ${kind === 'prev' ? 'stayed' : 'stays'} · 0 mi`, color: c });
        continue;
      }
      if (!placed(leg.loc)) continue;
      const k = placeKey(leg.loc);
      let p = pts.get(k);
      if (!p) pts.set(k, (p = { key: k, loc: leg.loc, isThis: false, color: c, lines: [{ text: cityLabel(leg.loc), strong: true }] }));
      else if (p.color !== c) p.color = undefined;
      p.lines.push({ text: `${t.team} ${kind === 'prev' ? 'last' : 'next'}`, color: c });
      lines.push({ key: `${t.team}:${kind}`, color: c, kind, from: kind === 'prev' ? leg.loc : here, to: kind === 'prev' ? here : leg.loc, miles: leg.miles });
    }
  }
  return { points: [...pts.values()], lines };
}

export const milesText = (m: number | undefined) => (m === undefined ? '? mi' : `${m.toLocaleString('en-US')} mi`);
const side = (c: TeamColor) => (c === 'a' ? 'away' : 'home');
/** Where along a line its distance label may sit (share of the way), best first. */
const ALONG = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];
/** …and how far beside it (px, either side), when nowhere on it is free. */
const SIDEWAYS = [0, 20, -20, 40, -40, 62, -62];
/** Places closer than this on screen share a label. */
const MERGE_PX = 30;

export function focusLayout(tv: GameTravel, colorOf: (teamId: number) => TeamColor, w: number, zoom = true): FocusLayout {
  const { points, lines } = focusParts(tv, colorOf); // fresh objects: label is set below
  const view = points.length && zoom ? fitView(points.map((p) => p.loc), w) : WHOLE;
  const px = (p: { x: number; y: number }) => toPx(view, w, p);
  const blocked = points.map((p) => {
    const q = px(p.loc);
    const r = p.isThis ? 13 : 9; // the focused game's dot is bigger, with a ring
    return { x: q.x - r, y: q.y - r, w: 2 * r, h: 2 * r };
  });
  // the miles first (on their line, else just beside it), then the places (next to the dot, else a little further)
  const asks: LabelAsk[] = lines.map((l) => {
    const tw = Math.ceil(textWidth(milesText(l.miles), distFont())) + 14;
    const on = ALONG.map((t) => px(arcPoint(l.from, l.to, side(l.color), t)));
    const a = px(l.from);
    const b = px(l.to);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const [nx, ny] = [-(b.y - a.y) / len, (b.x - a.x) / len];
    const options = SIDEWAYS.flatMap((o) => on.map((q) => ({ x: q.x + nx * o - tw / 2, y: q.y + ny * o - DIST_H / 2, w: tw, h: DIST_H, variant: 0 })));
    return { key: `d:${l.key}`, force: true, options };
  });
  // places a few px apart on screen (Los Angeles / Inglewood) share one label, on the first of them (the game's own first)
  const done = new Set<FocusPoint>();
  for (const p of points) {
    if (done.has(p)) continue;
    const q = px(p.loc);
    const group = points.filter((o) => !done.has(o) && Math.hypot(px(o.loc).x - q.x, px(o.loc).y - q.y) < MERGE_PX);
    group.forEach((o) => done.add(o));
    p.label = group.flatMap((o) => o.lines);
    const s = labelSize(p.label);
    asks.push({ key: `pt:${p.key}`, options: (p.isThis ? [16, 32, 52] : [12, 30, 52]).flatMap((r) => around(q, s.w, s.h, r)).map((r) => ({ ...r, variant: 0 })), force: true });
  }
  const h = (w * MAP_H) / MAP_W;
  return { view, points, lines, labels: placeLabels(asks, blocked, { x: 2, y: 2, w: w - 4, h: h - 4 }) };
}

// ---------------------------------------------------------------- the day's dots (League map, nothing focused)

export interface DayDot {
  game: ScheduleGame;
  loc: GameLocation;
  b2b: boolean;
  /** Spread (px) for dots of one place. */
  dx: number;
  dy: number;
}

/** A day dot's label in its variants, longest first: "BOS @ HOU" + city, "BOS @ HOU", "HOU". */
export function dayLabelLines(d: DayDot & { loc: Placed }): LabelLine[][] {
  const m = `${teamLabel(d.game.awayTeam)} @ ${teamLabel(d.game.homeTeam)}`;
  return [[{ text: m, strong: true }, { text: cityLabel(d.loc) }], [{ text: m, strong: true }], [{ text: teamLabel(d.game.homeTeam), strong: true }]];
}

/** The day's labels with nothing focused: the longest variant that fits beside each dot; none where nothing fits. */
export function dayLayout(dots: readonly DayDot[], w: number): Map<string, Rect & { variant: number }> {
  const on = dots.filter((d) => placed(d.loc)) as (DayDot & { loc: Placed })[];
  const at = new Map(
    on.map((d) => {
      const q = toPx(WHOLE, w, d.loc);
      return [d.game.gameId, { x: q.x + d.dx, y: q.y + d.dy }];
    }),
  );
  const blocked = on.map((d) => {
    const q = at.get(d.game.gameId)!;
    return { x: q.x - 6, y: q.y - 6, w: 12, h: 12 };
  });
  // crowded places first: they have the fewest free spots
  const near = (d: DayDot) => on.filter((o) => Math.hypot(at.get(o.game.gameId)!.x - at.get(d.game.gameId)!.x, at.get(o.game.gameId)!.y - at.get(d.game.gameId)!.y) < 90).length;
  const order = [...on].sort((a, b) => near(b) - near(a) || a.loc.x - b.loc.x || a.game.gameId.localeCompare(b.game.gameId));
  const asks = order.map((d) => ({
    key: d.game.gameId,
    options: dayLabelLines(d).flatMap((lines, variant) => {
      const s = labelSize(lines);
      return around(at.get(d.game.gameId)!, s.w, s.h, 9).map((r) => ({ ...r, variant }));
    }),
  }));
  const h = (w * MAP_H) / MAP_W;
  return placeLabels(asks, blocked, { x: 2, y: 2, w: w - 4, h: h - 4 });
}

// ---------------------------------------------------------------- focus: hover (lingering), pin, default

/** The hover store's value ("list:<id>" / "map:<id>"), kept LINGER_MS after the pointer leaves (the next row's hover comes first). */
function useLingeringHover(hover: ValueStore<string>): string {
  const [id, setId] = useState(() => hover.get());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      const h = hover.get();
      clearTimeout(timer);
      if (h) setId(h);
      else timer = setTimeout(() => setId(''), LINGER_MS);
    };
    on();
    const off = hover.subscribe(on);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [hover]);
  return id;
}

/**
 * The focused game id: hovered, else pinned, else `fallback`; whether it is the pinned one; and whether the view zooms
 * to it — not for a dot hovered on the map (the zoom would move the dot from under the pointer before a click lands
 * on it): the lines and panel show at the view as it is, and a click (pin) zooms.
 */
export function useFocus(hover: ValueStore<string>, pin: ValueStore<string>, known: (id: string) => boolean, fallback?: string): { id?: string; pinned: boolean; zoom: boolean } {
  const hv = parseHover(useLingeringHover(hover));
  const h = hv && known(hv.id) ? hv.id : '';
  const p = useValue(pin);
  const id = h || (p && known(p) ? p : '') || fallback;
  const pinned = !!p && id === p;
  return { id, pinned, zoom: !h || hv!.from === 'list' || pinned };
}

// ---------------------------------------------------------------- drawing

const anchor = (l: { x: number; y: number }, dx = 0, dy = 0): CSSProperties => ({ left: pct(l.x, MAP_W), top: pct(l.y, MAP_H), transform: dx || dy ? `scale(calc(1 / var(--k))) translate(${dx}px, ${dy}px)` : undefined });

const Lines = ({ lines }: { lines: readonly LabelLine[] }) => (
  <>
    {lines.map((l, i) => (
      <div key={i} className={`${l.strong ? 'ck-ml-strong' : 'ck-ml'}${l.color ? ` ck-tc-${l.color}` : ''}`}>
        {l.text}
      </div>
    ))}
  </>
);

/** The travel lines (SVG in map units; widths follow the zoom in map.css). */
const LegLines = memo(function LegLines({ lines }: { lines: readonly FocusLine[] }) {
  return (
    <svg className="ck-map-travel" viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet" data-testid="map-travel">
      <defs>
        {(['a', 'b'] as const).map((c) => (
          <marker key={c} id={`ck-tv-head-${c}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" className={`ck-tv-head ck-tc-${c}`} />
          </marker>
        ))}
      </defs>
      {lines.map((l) => (
        <path key={l.key} className={`ck-tv-line ck-tv-${l.kind} ck-tc-${l.color}`} d={arc(l.from, l.to, side(l.color))} markerEnd={`url(#ck-tv-head-${l.color})`} data-leg={l.key} data-from={l.from.arena.arena} data-to={l.to.arena.arena} data-miles={l.miles} />
      ))}
    </svg>
  );
});

export interface TravelMapProps {
  data: CalendarData;
  /** The map's width (px). */
  width: number;
  /** The focused game, if any. */
  focus?: ScheduleGame;
  pinned: boolean;
  /** Zoom to fit the focused game (else the whole map). */
  zoom?: boolean;
  /** The teams in colour order (a, b). Default: away, home. */
  first?: number;
  /** League map: the day's dots. */
  dots?: readonly DayDot[];
  timeZone?: string;
  testId: string;
  label: string;
  legend: ReactNode;
  /** Shown in the panel with nothing focused. */
  idle: ReactNode;
}

export function TravelMap({ data, width, focus, pinned, zoom = true, first, dots, timeZone, testId, label, legend, idle }: TravelMapProps) {
  const tv = useMemo(() => (focus ? gameTravel(data, focus) : undefined), [data, focus]);
  const colorOf = useMemo(() => {
    const a = first ?? focus?.awayTeam.teamId;
    return (id: number): TeamColor => (id === a ? 'a' : 'b');
  }, [first, focus]);
  const layout = useMemo(() => (tv && width > 0 ? focusLayout(tv, colorOf, width, zoom) : undefined), [tv, colorOf, width, zoom]);
  const day = useMemo(() => (dots && width > 0 ? dayLayout(dots, width) : undefined), [dots, width]);
  const view = layout?.view ?? WHOLE;
  const h = (width * MAP_H) / MAP_W;
  const focusId = focus?.gameId;
  // Team map: no day dots, so the focused game's own dot is drawn here (and is hoverable: it lights its row)
  const selfDot = !dots && layout?.points.find((p) => p.isThis);
  const px = (l: { x: number; y: number }) => toPx(view, width, l);
  return (
    <aside className="ck-map" data-testid={testId} data-capture-exclude="true" aria-label={label} style={{ width }} data-focus={focusId} data-pinned={pinned ? '' : undefined}>
      <div className={`ck-map-box${focus ? ' ck-map-focused' : ''}`} style={{ height: h, '--u': (MAP_W / Math.max(1, width)).toFixed(4) } as CSSProperties}>
        <div className="ck-map-stage" data-testid="map-stage" data-view={`${view.cx.toFixed(1)},${view.cy.toFixed(1)},${view.k}`} style={{ transform: stageTransform(view), '--k': view.k } as CSSProperties}>
          <Basemap />
          {layout && <LegLines lines={layout.lines} />}
          {dots?.map((d) => {
            if (!placed(d.loc)) return null;
            const hot = d.game.gameId === focusId;
            const r = !focus ? day?.get(d.game.gameId) : undefined;
            const q = px(d.loc);
            return (
              <div
                key={d.game.gameId}
                className={`ck-map-dot${d.b2b ? ' ck-map-b2b' : ''}${d.loc.kind === 'edge' ? ' ck-map-edge' : ''}${hot ? ' ck-map-hot' : ''}${hot && pinned ? ' ck-map-pinned' : ''}`}
                style={anchor(d.loc, d.dx, d.dy)}
                data-map-game={d.game.gameId}
                data-kind={d.loc.kind}
                title={`${teamLabel(d.game.awayTeam)} @ ${teamLabel(d.game.homeTeam)} · ${d.loc.label}${d.loc.kind === 'edge' ? ' (off this map)' : ''}`}
              >
                <span className="ck-map-pin" aria-hidden="true" />
                {r && (
                  <span className="ck-map-label" data-variant={r.variant} style={{ left: r.x - q.x - d.dx, top: r.y - q.y - d.dy, width: r.w }}>
                    <Lines lines={dayLabelLines(d as DayDot & { loc: Placed })[r.variant]!} />
                  </span>
                )}
              </div>
            );
          })}
          {layout?.points.map((p) => {
            const r = layout.labels.get(`pt:${p.key}`);
            const q = px(p.loc);
            const self = p === selfDot;
            return (
              <div key={p.key} className={`ck-map-dot ck-tv-point${p.isThis ? ' ck-tv-this' : ''}${p.color ? ` ck-tc-${p.color}` : ''}${self && pinned ? ' ck-map-pinned' : ''}${self ? ' ck-map-hot' : ''}`} style={anchor(p.loc)} data-point={p.loc.arena.arena} data-map-game={self ? focusId : undefined}>
                {(!p.isThis || self) && <span className="ck-map-pin" aria-hidden="true" />}
                {r && (
                  <span className="ck-map-label" style={{ left: r.x - q.x, top: r.y - q.y, width: r.w }}>
                    <Lines lines={p.label ?? p.lines} />
                  </span>
                )}
              </div>
            );
          })}
          {layout?.lines.map((l) => {
            const r = layout.labels.get(`d:${l.key}`);
            if (!r) return null;
            const at = l.from; // the label's anchor: the line's start, offset to its place on the line
            const q = px(at);
            return (
              <div key={l.key} className="ck-map-dot ck-tv-dist-at" style={anchor(at)}>
                <span className={`ck-map-label ck-tv-dist ck-tv-dist-${l.kind} ck-tc-${l.color}`} style={{ left: r.x - q.x, top: r.y - q.y, width: r.w }} data-dist={l.key}>
                  {milesText(l.miles)}
                </span>
              </div>
            );
          })}
        </div>
        {dots?.some((d) => !placed(d.loc)) && (
          <div className="ck-map-unknown" data-testid="map-unknown">
            {dots.filter((d) => !placed(d.loc)).map((d) => (
              <div key={d.game.gameId} className={d.game.gameId === focusId ? 'ck-map-hot' : undefined} data-map-game={d.game.gameId} data-kind="unknown">
                <TeamLink teamId={d.game.awayTeam.teamId}>{teamLabel(d.game.awayTeam)}</TeamLink> @ <TeamLink teamId={d.game.homeTeam.teamId}>{teamLabel(d.game.homeTeam)}</TeamLink>: location unknown ({d.loc.label})
              </div>
            ))}
          </div>
        )}
      </div>
      <TravelPanel tv={tv} colorOf={colorOf} first={first} pinned={pinned} timeZone={timeZone} idle={idle} />
      <div className="ck-map-legend" data-testid="map-legend" style={{ height: LEGEND_H }}>
        {legend}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- the panel

const when = (g: ScheduleGame, timeZone?: string) => `${rowDate(g.dateEt)} ${tipoff(g, timeZone).label}`;

/** "@ ORL" / "vs ORL" from the team's side, the opponent a team link. */
function Opp({ g, teamId }: { g: ScheduleGame; teamId: number }) {
  const away = g.awayTeam.teamId === teamId;
  const o = away ? g.homeTeam : g.awayTeam;
  return (
    <>
      {away ? '@' : 'vs'} <TeamLink teamId={o.teamId}>{teamLabel(o)}</TeamLink>
    </>
  );
}

const restText = (n: number) => (n === 1 ? <span className="ck-tv-b2b">B2B</span> : n === 0 ? 'same day' : `${n} days rest`);
const placeText = (l: GameLocation) => (placed(l) ? cityLabel(l) : 'location unknown');

function LegRow({ kind, t, timeZone }: { kind: 'prev' | 'next'; t: TeamTravel; timeZone?: string }) {
  const leg: Leg | undefined = t[kind];
  const k = <span className="ck-tv-k">{kind === 'prev' ? 'last' : 'next'}</span>;
  if (!leg)
    return (
      <div className="ck-tv-row" data-leg={kind}>
        {k} none{kind === 'prev' ? ' (season opener)' : ''}
      </div>
    );
  return (
    <div className="ck-tv-row" data-leg={kind} data-rest={leg.rest} data-miles={leg.miles} data-tz={tzLabel(leg.tz)}>
      {k} <Opp g={leg.game} teamId={t.teamId} /> · {when(leg.game, timeZone)} · {placeText(leg.loc)} → <b className="ck-tv-mi">{milesText(leg.miles)}</b>
      {leg.stays ? ' (stayed)' : ''} · {restText(leg.rest)} · TZ {tzLabel(leg.tz)}
    </div>
  );
}

function TravelPanel({ tv, colorOf, first, pinned, timeZone, idle }: { tv?: GameTravel; colorOf: (id: number) => TeamColor; first?: number; pinned: boolean; timeZone?: string; idle: ReactNode }) {
  if (!tv)
    return (
      <div className="ck-tv-panel ck-tv-idle" data-testid="map-panel" style={{ height: PANEL_H }}>
        {idle}
      </div>
    );
  const g = tv.game;
  const teams = first ? [...tv.teams].sort((a, b) => (a.teamId === first ? -1 : b.teamId === first ? 1 : 0)) : tv.teams;
  return (
    <div className="ck-tv-panel" data-testid="map-panel" style={{ height: PANEL_H }}>
      <div className="ck-tv-head">
        <b>
          <TeamLink teamId={g.awayTeam.teamId}>{teamLabel(g.awayTeam)}</TeamLink> @ <TeamLink teamId={g.homeTeam.teamId}>{teamLabel(g.homeTeam)}</TeamLink>
        </b>{' '}
        · {when(g, timeZone)} · {placed(tv.loc) ? `${tv.loc.arena.arena}, ${placeName(tv.loc.arena)}${tv.loc.kind === 'edge' ? ' (off this map)' : ''}` : `location unknown (${tv.loc.label})`}
        {pinned && (
          <span className="ck-tv-pin" data-testid="map-pinned">
            pinned · Esc to unpin
          </span>
        )}
      </div>
      {teams.map((t) => (
        <div key={t.teamId} className={`ck-tv-team ck-tc-${colorOf(t.teamId)}`} data-team={t.team}>
          <div className="ck-tv-tri">
            <TeamLink teamId={t.teamId}>{t.team}</TeamLink>
          </div>
          <div className="ck-tv-rows">
            <LegRow kind="prev" t={t} timeZone={timeZone} />
            <div className="ck-tv-row" data-leg="this">
              <span className="ck-tv-k">this</span> <Opp g={g} teamId={t.teamId} /> · {when(g, timeZone)} · {placeText(tv.loc)}
              {t.tif && <span className={`ck-fx-chip ck-tif-pos-${Math.min(3, t.tif.position)} ck-tv-chip`}>{t.tif.label}</span>}
            </div>
            <LegRow kind="next" t={t} timeZone={timeZone} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The legend's line samples and colour keys. */
export function LegendKeys({ a, b }: { a: string; b: string }) {
  return (
    <>
      <span className="ck-map-key ck-tc-a">
        <i className="ck-key-line" /> {a}
      </span>
      <span className="ck-map-key ck-tc-b">
        <i className="ck-key-line" /> {b}
      </span>
      <span className="ck-map-key">
        <i className="ck-key-line ck-key-solid" /> since last game
      </span>
      <span className="ck-map-key">
        <i className="ck-key-line ck-key-dashed" /> to next game
      </span>
      <span className="ck-map-note">straight-line miles</span>
    </>
  );
}
