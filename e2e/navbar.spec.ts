// The top bar is in flux (PROJECT.md, Test tiers): no layout or position assertions here, only behaviour. Slate opened from
// a team on a day it doesn't play says so (needs the Team List's row at the top, which only a real layout gives).

import { expect, test, type Page } from './fixtures';
import { APP } from './app';
import { titleFor } from './nav';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const NOW = new Date('2026-11-15T15:00:00Z');
const tab = (page: Page, list: string, name: string) => page.getByRole('tablist', { name: list }).getByRole('tab', { name, exact: true });

test('Slate from a team on a day it doesn’t play: the day’s Slate with "XXX doesn’t play today"', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto(APP);
  // a team without a game today (Nov 15), from the served snapshot
  const idle = await page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    type G = { gameDateEst: string; homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } };
    const games = (raw.leagueSchedule.gameDates as { games: G[] }[]).flatMap((d) => d.games).filter((g) => g.gameDateEst.startsWith('2026-11-15'));
    const busy = new Set(games.flatMap((g: { homeTeam: { teamTricode: string }; awayTeam: { teamTricode: string } }) => [g.homeTeam.teamTricode, g.awayTeam.teamTricode]));
    return ['BOS', 'MIA', 'DEN', 'LAL', 'NYK', 'ATL', 'CHI', 'DAL', 'PHX', 'UTA'].find((t) => !busy.has(t))!;
  });
  // the team's list opened on today (a team link's `on=`): with rest rows, its top row is today
  await page.goto(`${APP}?view=team&layout=list&team=${idle}&on=2026-11-15`);
  await expect(page.getByTestId('team-day-title')).toHaveText(titleFor(page, 'Sunday, November 15, 2026'));
  await tab(page, 'Layout', 'Slate').click();
  await expect(page.getByTestId('day-title')).toHaveText(titleFor(page, 'Sunday, November 15, 2026'));
  await expect(page.getByTestId('slate-no-team')).toHaveText(`${idle} doesn’t play today`);
  await expect(page.getByTestId('bar-local').getByTestId('team-picker')).toContainText('All teams');
});
