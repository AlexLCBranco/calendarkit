// Schedule fatigue for one team in one game, readable without hovering: a yellow "B2B" badge, the two
// nights of the back-to-back as a house (home) or a plane (away) — always in time order, tonight solid, the other night
// faded — and a 3-in-4 chip. One component for the League List, Team List and week view, in two sizes. A team with none
// of it gets an empty slot of the same width, so rows stay aligned. The tooltip (shared floating one, [data-tip]) adds
// details: which leg, the other night's opponent, the 3-in-4 stretch and its days (data-tip-days, a strip).
// A dot in the badge says which leg tonight is — beside the first B on the 1st night (they play again
// tomorrow), beside the second B on the 2nd night (they played yesterday); it never flips with the column. The chip is
// the merged 3-in-4 stretch: "4in6 · 2nd" (compact size: "4in6", see fatigue.css).
// Few elements on purpose (every list row has two): a grid of at most 5 children, the icons drawn by CSS (fatigue.css).
// An abnormal break (3+ days between game dates, rest.ts) — a teal badge with the days ("4d"): filled
// when this game comes off the break, outlined when the break follows it; its own tooltip gives the exact count and the
// game on the other side ("4 days off, last played Mon, Nov 4 @ PHI"). It takes no width: it sits in the B2B badge's
// track when tonight isn't a back-to-back night, else in the 3-in-4 chip's; with both taken, a teal corner tick.

import type { TeamFatigue } from '../data/fatigue';
import { mergedChip, mergedLabel, ordinal } from '../data/scheduleTags';
import { restLines, type RestFlag } from '../data/rest';

/** House (home) or plane (away) for one night; solid on tonight's game, faded on the other. Drawn in CSS. */
export const NightIcon = ({ home, tonight }: { home: boolean; tonight: boolean }) => (
  <i className={`ck-fx-icon ck-fx-${home ? 'home' : 'away'}${tonight ? ' ck-fx-tonight' : ''}`} data-kind={home ? 'home' : 'away'} />
);

/** The "B2B" badge with the leg dot: `leg` 1 → dot before the first B, 2 → after the second B. */
export const B2BBadge = ({ leg }: { leg: 1 | 2 }) => (
  <span className="ck-fx-b2b" data-leg={leg}>
    {leg === 1 && <i className="ck-fx-leg" />}
    B2B
    {leg === 2 && <i className="ck-fx-leg" />}
  </span>
);

const ORD = ['', '1st', '2nd', '3rd'];

/** Plain-language summary for screen readers (the visible marks say the same). */
function label(team: string, f: TeamFatigue): string {
  const parts: string[] = [];
  const pair = f.pairs[0];
  const night = f.nights[0];
  if (pair && night) {
    const where = (c: string) => (c === 'H' ? 'home' : 'away');
    parts.push(`back-to-back, ${ORD[night]} night: ${where(pair.code[0]!)} then ${where(pair.code[1]!)}`);
  }
  if (f.tif) parts.push(`${f.tif.merged.ids.length} games in ${f.tif.merged.days} days, tonight the ${ordinal(f.tif.merged.position)}`);
  if (f.rest?.after) parts.push(`${f.rest.after.days} days since the last game`);
  if (f.rest?.before) parts.push(`${f.rest.before.days} days until the next game`);
  return `${team}: ${parts.join(', ')}`;
}

/**
 * `badge`: the side the "B2B" badge sits on — the one nearest the team's logo (League List away column and the team's
 * own column: right; home / opponent column: left). Only the badge and the chip swap places: the night icons stay in
 * time order, and the leg dot stays on its B. `focusable`: a tab stop for the tooltip (Team List; in the league views
 * the tricode's mark already is one).
 */
export function Fatigue({ f, team, size = 'full', badge = 'left', focusable = false, shortChip = false }: { f?: TeamFatigue; team: string; size?: 'full' | 'compact'; badge?: 'left' | 'right'; focusable?: boolean; shortChip?: boolean }) {
  // `shortChip` — full size, but the chip shows the stretch only ("7in11", as compact does) and its
  // track is narrower (the Slate's tight cards); tonight's place stays in the tooltip
  const pair = f?.pairs[0];
  const night = f?.nights[0];
  const tick = !!f?.rest && !!pair && !!f.tif;
  const cls = `ck-fx ck-fx-${size}${badge === 'right' ? ' ck-fx-mirror' : ''}${shortChip && size === 'full' ? ' ck-fx-short' : ''}${tick ? ' ck-fx-has-tick' : ''}`;
  if (!f || (!pair && !f.tif && !f.rest)) return <span className={`${cls} ck-fx-empty`} data-testid="fatigue" aria-hidden="true" />;
  const m = f.tif?.merged;
  return (
    <span
      className={cls}
      data-testid="fatigue"
      data-code={pair?.code}
      data-night={night}
      data-tif={f.tif?.position}
      data-stretch={m && `${mergedLabel(m)}/${m.position}`}
      data-tip={f.tip}
      data-tip-days={f.days}
      aria-label={label(team, f)}
      role="img"
      tabIndex={focusable ? 0 : undefined}
    >
      {pair && night && (
        <>
          <B2BBadge leg={night} />
          <NightIcon home={pair.code[0] === 'H'} tonight={night === 1} />
          <NightIcon home={pair.code[1] === 'H'} tonight={night === 2} />
        </>
      )}
      {m && <span className={`ck-fx-chip ck-tif-pos-${Math.min(3, m.position)}`}>{size === 'compact' || shortChip ? mergedLabel(m) : mergedChip(m)}</span>}
      {f.rest && <RestChip rest={f.rest} slot={!pair ? 'b' : !m ? 'c' : 'tick'} />}
    </span>
  );
}

/**
 * The break badge — "4d", the days between the game dates, in a free track (`slot`). Filled: this game comes off the break;
 * outlined: the break follows it; a game with a break on both sides shows the one it comes off (filled) and has both
 * lines in its tooltip. Its own data-tip (the floating tooltip takes the nearest one).
 */
export function RestChip({ rest, slot }: { rest: RestFlag; slot: 'b' | 'c' | 'tick' }) {
  const side = rest.after ? 'after' : 'before';
  const days = (rest.after ?? rest.before)!.days;
  return (
    <span className={`ck-fx-rest ck-fx-rest-${side} ck-fx-rest-${slot}`} data-break={side} data-break-both={rest.after && rest.before ? '' : undefined} data-days={days} data-tip={restLines(rest).join('\n')}>
      {days}d
    </span>
  );
}
