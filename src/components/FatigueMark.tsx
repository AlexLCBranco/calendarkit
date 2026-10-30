// League views (week view, League List): schedule fatigue drawn on a team's tricode, taking no width — a yellow fill on
// the 2nd night of a back-to-back, a yellow outline on the 1st, a small plane when the team changes metro between the
// nights, a purple underline in a 3-in-4 set — and a tooltip with the details for that team (leagueFatigue).

import type { ReactNode } from 'react';
import type { TeamFatigue } from '../data/fatigue';
import { PlaneIcon } from './GameCard';
import { B2BBadge, NightIcon } from './Fatigue';

/** Height (px) the legend line takes under the week grid (week view: kept out of the day cells' height). */
export const FATIGUE_LEGEND_H = 22;

/**
 * The tricode with its fatigue marks; `className` joins the mark's own (e.g. the week view's ck-mtri-text).
 * `component`: the Fatigue component is shown for this team (League List on desktop, 1-week view) — then the tricode
 * drops its plane (the component's plane means "away", round 5) and its yellow fill / outline (round 6: the badge and
 * its leg dot say it); the 3-in-4 underline and the tooltip stay.
 */
export function FatigueMark({ f, className = '', component = false, children }: { f?: TeamFatigue; className?: string; component?: boolean; children: ReactNode }) {
  if (!f) return <span className={className || undefined}>{children}</span>;
  const n2 = !component && f.nights.includes(2);
  const n1 = !component && !n2 && f.nights.includes(1);
  const plane = !component;
  return (
    <span
      className={`ck-fm${n2 ? ' ck-fm-n2' : ''}${n1 ? ' ck-fm-n1' : ''}${f.tif ? ` ck-fm-tif ck-fm-tif-${f.tif.position}` : ''}${className ? ` ${className}` : ''}`}
      data-tif={f.tif?.position}
      data-tip={f.tip}
      data-tip-days={f.days}
      aria-label={f.tip}
      role="img"
      tabIndex={0}
    >
      {children}
      {plane && f.travels && (
        <span className="ck-fm-plane" aria-hidden="true">
          <PlaneIcon />
        </span>
      )}
    </span>
  );
}

/**
 * "■ 2nd night · ▢ 1st night · ✈ changed cities · 3-in-4", each key drawn like its mark. `component`: the views with the
 * Fatigue component explain it instead (round 6: the leg dot, the night icons and the merged chip; the tricodes there
 * have no yellow marks any more, so their keys are gone).
 */
export const FatigueLegend = ({ component = false }: { component?: boolean }) =>
  component ? (
    <div className="ck-fm-legend ck-fx-legend" data-testid="fatigue-legend">
      <B2BBadge leg={1} /> back-to-back, 1st night (again tomorrow) · <B2BBadge leg={2} /> 2nd night (played yesterday) · <NightIcon home tonight /> home <NightIcon home={false} tonight /> away, earlier night first, tonight solid · <span className="ck-fx-chip">3in4 · 2nd</span> 3 games in 4 days, tonight the 2nd
    </div>
  ) : (
    <div className="ck-fm-legend" data-testid="fatigue-legend">
      <span className="ck-fm-key ck-fm-key-n2">■</span> 2nd night · <span className="ck-fm-key ck-fm-key-n1">▢</span> 1st night · <span className="ck-fm-key ck-fm-key-plane">✈</span> changed cities · <span className="ck-fm-key-tif">3-in-4</span>
    </div>
  );
