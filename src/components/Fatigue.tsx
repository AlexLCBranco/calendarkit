// Schedule fatigue for one team in one game, readable without hovering (round 5): a yellow "B2B" badge, the two
// nights of the back-to-back as a house (home) or a plane (away) — always in time order, tonight solid, the other night
// faded — and a short "3in4" chip in a 3-games-in-4-nights stretch. One component for the League List, Team List and
// week view, in two sizes. A team with none of it gets an empty slot of the same width, so rows stay aligned. The
// tooltip (shared floating one, [data-tip]) only adds details: which leg, the other night's opponent, the 3-in-4 game.
// Few elements on purpose (every list row has two): a grid of at most 4 children, the icons drawn by CSS (fatigue.css).

import type { TeamFatigue } from '../data/fatigue';

/** House (home) or plane (away) for one night; solid on tonight's game, faded on the other. Drawn in CSS. */
export const NightIcon = ({ home, tonight }: { home: boolean; tonight: boolean }) => (
  <i className={`ck-fx-icon ck-fx-${home ? 'home' : 'away'}${tonight ? ' ck-fx-tonight' : ''}`} data-kind={home ? 'home' : 'away'} />
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
  if (f.tif) parts.push('3 games in 4 nights');
  return `${team}: ${parts.join(', ')}`;
}

/**
 * `badge`: the side the "B2B" badge sits on — the one nearest the team's logo (League List away column and the team's
 * own column: right; home / opponent column: left). Only the badge and the chip swap places: the night icons stay in
 * time order. `focusable`: a tab stop for the tooltip (Team List; in the league views the tricode's mark already is one).
 */
export function Fatigue({ f, team, size = 'full', badge = 'left', focusable = false }: { f?: TeamFatigue; team: string; size?: 'full' | 'compact'; badge?: 'left' | 'right'; focusable?: boolean }) {
  const cls = `ck-fx ck-fx-${size}${badge === 'right' ? ' ck-fx-mirror' : ''}`;
  const pair = f?.pairs[0];
  const night = f?.nights[0];
  if (!f || (!pair && !f.tif)) return <span className={`${cls} ck-fx-empty`} data-testid="fatigue" aria-hidden="true" />;
  return (
    <span
      className={cls}
      data-testid="fatigue"
      data-code={pair?.code}
      data-night={night}
      data-tif={f.tif?.position}
      data-tip={f.tip}
      aria-label={label(team, f)}
      role="img"
      tabIndex={focusable ? 0 : undefined}
    >
      {pair && night && (
        <>
          <span className="ck-fx-b2b">B2B</span>
          <NightIcon home={pair.code[0] === 'H'} tonight={night === 1} />
          <NightIcon home={pair.code[1] === 'H'} tonight={night === 2} />
        </>
      )}
      {f.tif && <span className={`ck-fx-chip ck-tif-pos-${f.tif.position}`}>3in4</span>}
    </span>
  );
}
