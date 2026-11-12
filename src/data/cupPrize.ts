// The NBA Cup prize money per player (a full share; two-way players get half), by season, each with
// its source. Never typed from memory: a season whose amounts can't be found from a source is left out (and the bracket
// shows nothing for it).

export interface CupPrize {
  /** Per player, US dollars. */
  qfLoss: number;
  sfLoss: number;
  runnerUp: number;
  champion: number;
  source: string;
  note?: string;
}

/** Keyed by the Cup's year (the season it starts: 2026 = the 2026-27 Cup). */
export const CUP_PRIZES: Readonly<Record<number, CupPrize>> = {
  2023: { champion: 500_000, runnerUp: 200_000, sfLoss: 100_000, qfLoss: 50_000, source: 'Hoops Rumors, "Details on NBA Cup prize money for 2024" (2023 amounts listed beside 2024\'s), https://hoopsrumors.com/2024/11/details-on-nba-cup-prize-money-for-2024.html' },
  2024: { champion: 514_970, runnerUp: 205_988, sfLoss: 102_994, qfLoss: 51_497, source: 'Hoops Rumors, https://hoopsrumors.com/2024/11/details-on-nba-cup-prize-money-for-2024.html', note: 'some outlets give the champion share as $514,971 (rounding)' },
  2025: { champion: 530_933, runnerUp: 212_373, sfLoss: 106_187, qfLoss: 53_093, source: 'CBS Sports, "NBA Cup championship prize money: Knicks, Spurs to battle for $530K per player", https://www.cbssports.com/nba/news/nba-cup-championship-prize-money-knicks-spurs/' },
  2026: { champion: 604_985, runnerUp: 241_994, sfLoss: 120_997, qfLoss: 60_499, source: 'BVM Sports, "NBA Cup 2026 Tips Off Friday With Bold Courts and $605K Prize" (2026-10-30), https://bvmsports.com/2026/10/30/nba-cup-2026-tips-off-friday-with-bold-courts-and-605k-prize/', note: 'matches the amounts Alex gave; not yet on an NBA.com page (2026-11-06)' },
};

export const fmtUsd = (n: number) => `$${n.toLocaleString('en-US')}`;

/** The line under each round: what the round is worth per player. */
export function prizeLines(year: number): { qf: string; sf: string; final: string; source: string } | undefined {
  const p = CUP_PRIZES[year];
  if (!p) return undefined;
  return { qf: `QF loss ${fmtUsd(p.qfLoss)} / player`, sf: `SF loss ${fmtUsd(p.sfLoss)} / player`, final: `Runner-up ${fmtUsd(p.runnerUp)} · Champion ${fmtUsd(p.champion)} / player`, source: p.source };
}
