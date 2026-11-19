// The Slate's header line, "SLATE · 18-11 · NBA": the night as day-month and the sports on it. The same pattern is
// shared with footykit's Slate (its FK-35, "SLATE · 18-11 · Football"), so a combined Slate in the gauntlet reads
// "SLATE · 18-11 · NBA + Football" — pass every sport shown, in the order shown.

/** "SLATE · 18-11 · NBA" for the night `date` (YYYY-MM-DD, the NBA / ET game date); several sports joined by " + ". */
export function slateHeaderLabel(date: string, sports: readonly string[] = ['NBA']): string {
  const [, m, d] = date.split('-');
  return `SLATE · ${d}-${m} · ${sports.join(' + ')}`;
}
