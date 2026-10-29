// League views (week view, League List): schedule fatigue drawn on a team's tricode, taking no width — a yellow fill on
// the 2nd night of a back-to-back, a yellow outline on the 1st, a small plane when the team changes metro between the
// nights, a purple underline in a 3-in-4 set — and a tooltip with the details for that team (leagueFatigue).

import type { ReactNode } from 'react';
import type { TeamFatigue } from '../data/fatigue';
import { PlaneIcon } from './GameCard';

/** Height (px) the legend line takes under the week grid (week view: kept out of the day cells' height). */
export const FATIGUE_LEGEND_H = 22;

/** The tricode with its fatigue marks; `className` joins the mark's own (e.g. the week view's ck-mtri-text). */
export function FatigueMark({ f, className = '', children }: { f?: TeamFatigue; className?: string; children: ReactNode }) {
  if (!f) return <span className={className || undefined}>{children}</span>;
  const n2 = f.nights.includes(2);
  const n1 = !n2 && f.nights.includes(1);
  return (
    <span
      className={`ck-fm${n2 ? ' ck-fm-n2' : ''}${n1 ? ' ck-fm-n1' : ''}${f.tif ? ` ck-fm-tif ck-fm-tif-${f.tif.position}` : ''}${className ? ` ${className}` : ''}`}
      data-tif={f.tif?.position}
      data-tip={f.tip}
      aria-label={f.tip}
      role="img"
      tabIndex={0}
    >
      {children}
      {f.travels && (
        <span className="ck-fm-plane" aria-hidden="true">
          <PlaneIcon />
        </span>
      )}
    </span>
  );
}

/** "■ 2nd night · ▢ 1st night · ✈ changed cities · 3-in-4", each key drawn like its mark. */
export const FatigueLegend = () => (
  <div className="ck-fm-legend" data-testid="fatigue-legend">
    <span className="ck-fm-key ck-fm-key-n2">■</span> 2nd night · <span className="ck-fm-key ck-fm-key-n1">▢</span> 1st night · <span className="ck-fm-key ck-fm-key-plane">✈</span> changed cities · <span className="ck-fm-key-tif">3-in-4</span>
  </div>
);
