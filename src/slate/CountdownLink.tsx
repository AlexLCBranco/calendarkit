// The "⏱ Countdown" button of the Slate's header line (countdown.ts has the rules). A real link, so it opens
// halftime-timer in a new tab; a control, so never in a copy. The Slate's part starts no timer: the time is read when
// the button is drawn and again whenever the pointer or the keyboard reaches it, so the link is right when it is used.

import { useState } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { countdownName, countdownTarget, countdownUrl } from './countdown';

export const NO_MORE_GAMES = 'No more games today';

export function CountdownLink({ games, timeZone }: { /** The night's games */ games: readonly ScheduleGame[]; timeZone?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const read = () => setNow(Date.now());
  const target = countdownTarget(games, now);
  if (!target)
    return (
      <span className="ck-slate-countdown-link ck-disabled" role="link" aria-disabled="true" aria-label={`Countdown: ${NO_MORE_GAMES}`} title={NO_MORE_GAMES} data-tip={NO_MORE_GAMES} data-testid="slate-countdown" data-capture-exclude="true" onPointerEnter={read}>
        ⏱ Countdown
      </span>
    );
  const name = countdownName(target, timeZone);
  const tip = `Open a countdown to it in halftime-timer\n${name}`;
  return (
    <a className="ck-slate-countdown-link" href={countdownUrl(target, timeZone)} target="_blank" rel="noopener noreferrer" draggable={false} title={tip} data-tip={tip} aria-label={`Countdown to ${name}`} data-testid="slate-countdown" data-capture-exclude="true" onPointerEnter={read} onFocus={read} onPointerDown={read} onClick={(e) => e.stopPropagation()}>
      ⏱ Countdown
    </a>
  );
}
