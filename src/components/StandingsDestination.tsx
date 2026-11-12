// The Standings destination: West | East side by side in one of four column sets (desktop).

import { lazy, Suspense, useState, type RefObject } from 'react';
import { seasonDay } from './calendarState';
import { capturePixelRatio, copyElement, COPY_PIXEL_RATIO } from './copyAsImage';
import { DestinationFrame, type DestinationApi, type DestinationProps } from './destination';
import { Segmented } from './Segmented';
import { SET_OPTIONS, type StandingsSet } from './standingsSets';

/** The standings view, its own chunk (shared with the shell's Quick standings popup), loaded on first use. */
const StandingsView = lazy(() => import('./Standings'));

export function StandingsDestination(p: DestinationProps & { api: RefObject<DestinationApi | undefined> }) {
  const { active, data, today, root, slots } = p;
  // The column set both conference tables show — kept while the page is open, never stored
  const [stSet, setStSet] = useState<StandingsSet>('main');

  p.api.current = {
    lookingAt: () => seasonDay(data, today),
    label: () => 'Standings',
    // the heading, both conference tables in the current column set and the legend, as on screen
    copy: (button) => {
      const node = root.current?.querySelector<HTMLElement>('[data-testid="standings-capture"]');
      if (!node) return Promise.reject(new Error('the standings are not on screen yet'));
      button.dataset.captured = `${node.scrollWidth}x${node.scrollHeight}@${capturePixelRatio(node.scrollWidth, node.scrollHeight, COPY_PIXEL_RATIO)}`;
      return copyElement(node, 1);
    },
    selKind: undefined,
  };

  if (!active) return null;
  return (
    <DestinationFrame slots={slots} sub={<Segmented label="Standings columns" value={stSet} options={SET_OPTIONS} onChange={setStSet} />}>
      <Suspense fallback={<p className="ck-empty">Loading the standings…</p>}>
        <StandingsView data={data} set={stSet} />
      </Suspense>
    </DestinationFrame>
  );
}
