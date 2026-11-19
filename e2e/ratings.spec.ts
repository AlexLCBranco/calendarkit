// CK-19: Standings' Ratings set — ORtg, DRtg and Net with their league ranks for all 30 teams; DRtg sorts lowest first.
import { expect, test } from './fixtures';
import { APP } from './app';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'once'));

const num = (s: string | null) => Number(s!.replace(/(st|nd|rd|th)$/, '').replace('−', '-').replace('+', ''));

test('Ratings: ORtg, DRtg, Net and ranks for all 30 teams; the first DRtg click puts the lowest on top', async ({ page }) => {
  await page.goto(`${APP}?view=standings`);
  await page.getByRole('tablist', { name: 'Standings columns' }).getByRole('tab', { name: 'Ratings' }).click();
  const tables = page.getByTestId('standings-table');
  for (const key of ['ortg', 'drtg', 'net']) {
    const cells = tables.locator(`td[data-col="${key}"]`);
    await expect(cells).toHaveCount(30);
    await expect(cells.filter({ hasText: /^[+−]?\d+\.\d\d+(st|nd|rd|th)$/ })).toHaveCount(30);
  }
  await expect(page.getByTestId('standings-legend')).toContainText('per 100 possessions');
  // Net = ORtg − DRtg on every row
  for (const row of await tables.locator('tbody tr').all()) {
    const v = async (k: string) => num(await row.locator(`td[data-col="${k}"]`).evaluate((td) => td.firstChild?.textContent ?? ''));
    expect(Math.abs((await v('ortg')) - (await v('drtg')) - (await v('net')))).toBeLessThan(0.11);
  }
  // DRtg: lower is better, the first click sorts ascending
  await tables.first().getByRole('button', { name: 'DRtg' }).click();
  for (const table of await tables.all()) {
    const vals = await table.locator('td[data-col="drtg"]').evaluateAll((tds) => tds.map((td) => Number(td.firstChild?.textContent)));
    expect(vals).toEqual([...vals].sort((a, b) => a - b));
  }
  await expect(tables.first().locator('th[aria-sort="ascending"]')).toContainText('DRtg');
});
