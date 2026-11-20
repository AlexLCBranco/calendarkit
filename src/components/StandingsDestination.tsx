// The Standings destination: West | East side by side in one of the column sets (desktop); or a past season (CK-24):
// its final standings, play-in and playoff bracket, picked in the What row's season strip.

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { HISTORY_YEARS, seasonLabel } from '../data/nbaHistory';
import { seasonDay } from './calendarState';
import { capturePixelRatio, copyElement, COPY_PIXEL_RATIO } from './copyAsImage';
import { DestinationFrame, type DestinationApi, type DestinationProps } from './destination';
import { Crumbs, PageRow } from './Header';
import { Segmented } from './Segmented';
import { COLUMN_SETS, SET_OPTIONS, type StandingsSet } from './standingsSets';

/** The standings view, its own chunk (shared with the shell's Quick standings popup), loaded on first use. */
const StandingsView = lazy(() => import('./Standings'));
/** A past season, its own chunk (and its data) loaded only when one is opened. */
const NbaHistory = lazy(() => import('./NbaHistory'));

export interface StandingsApi extends DestinationApi {
  /** The column set on show (the address's `set=`, the page's snapshot). */
  set: StandingsSet;
  setSet(set: StandingsSet): void;
  /** The past season on show (its end year), or undefined for this season. */
  season?: number;
  setSeason(year: number | undefined): void;
}

export const isHistoryYear = (y: unknown): y is number => typeof y === 'number' && HISTORY_YEARS.includes(y);

/** What: the seasons as one strip — this season, then every past one, newest first; the one on show scrolled into view. */
function SeasonStrip({ value, onChange }: { value?: number; onChange: (y: number | undefined) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const on = el?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (el && on) el.scrollLeft = on.offsetLeft - el.clientWidth / 2 + on.offsetWidth / 2;
  }, [value]);
  const opts: [number | undefined, string, string][] = [[undefined, 'This season', 'This season: standings so far'], ...HISTORY_YEARS.map((y): [number, string, string] => [y, seasonLabel(y), `${seasonLabel(y)}: final standings, play-in and playoffs`])];
  return (
    <div ref={box} className="ck-season-strip" role="radiogroup" aria-label="Season" data-testid="season-strip">
      {opts.map(([y, text, tip]) => (
        <button key={text} type="button" role="radio" aria-checked={value === y} className={`ck-chip-btn${value === y ? ' ck-chip-on' : ''}`} data-text={text} title={tip} data-year={y ?? 'now'} onClick={() => value !== y && onChange(y)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export const isStandingsSet = (x: unknown): x is StandingsSet => typeof x === 'string' && Object.hasOwn(COLUMN_SETS, x);

export function StandingsDestination(p: DestinationProps & { initial?: StandingsSet; initialSeason?: number; api: RefObject<StandingsApi | undefined> }) {
  const { active, data, today, root, slots, gameLink, timeZone } = p;
  // The column set both conference tables show — in the address and the page history, never stored
  const [stSet, setStSet] = useState<StandingsSet>(p.initial ?? 'main');
  const [season, setSeason] = useState<number | undefined>(isHistoryYear(p.initialSeason) ? p.initialSeason : undefined);
  // a new column set is a new page (its address, back / forward)
  useEffect(() => p.rendered());

  p.api.current = {
    set: stSet,
    setSet: setStSet,
    season,
    setSeason,
    lookingAt: () => seasonDay(data, today),
    label: () => (season ? `NBA ${seasonLabel(season)}` : stSet === 'main' ? 'Standings' : `Standings · ${COLUMN_SETS[stSet].label}`),
    // the heading, both conference tables in the current column set and the legend, as on screen
    copy: (button) => {
      const node = root.current?.querySelector<HTMLElement>(season ? '[data-testid="nba-history"]' : '[data-testid="standings-capture"]');
      if (!node) return Promise.reject(new Error('the standings are not on screen yet'));
      button.dataset.captured = `${node.scrollWidth}x${node.scrollHeight}@${capturePixelRatio(node.scrollWidth, node.scrollHeight, COPY_PIXEL_RATIO)}`;
      return copyElement(node, 1);
    },
    selKind: undefined,
  };

  if (!active) return null;
  return (
    <DestinationFrame
      slots={slots}
      crumbs={
        <Crumbs
          parts={[
            { id: 'standings-season', label: season ? seasonLabel(season) : 'This season', items: [{ label: 'This season', on: !season, go: () => setSeason(undefined) }, ...HISTORY_YEARS.map((y) => ({ label: seasonLabel(y), on: y === season, go: () => setSeason(y) }))] },
            ...(season ? [] : [{ id: 'standings-set', label: COLUMN_SETS[stSet].label, items: SET_OPTIONS.map(([s, label]) => ({ label, on: s === stSet, go: () => setStSet(s) })) }]),
          ]}
        />
      }
      what={
        <PageRow label="What" className=" ck-prow-what ck-prow-strip">
          <SeasonStrip value={season} onChange={setSeason} />
        </PageRow>
      }
      sub={
        season ? null : (
          <PageRow label="How">
            <Segmented label="Standings columns" value={stSet} options={SET_OPTIONS} onChange={setStSet} />
          </PageRow>
        )
      }
    >
      {season ? (
        <Suspense fallback={<p className="ck-empty">Loading {seasonLabel(season)}…</p>}>
          <NbaHistory year={season} onSeason={setSeason} />
        </Suspense>
      ) : (
        <Suspense fallback={<p className="ck-empty">Loading the standings…</p>}>
          <StandingsView data={data} set={stSet} gameLink={gameLink} timeZone={timeZone} />
        </Suspense>
      )}
    </DestinationFrame>
  );
}
