// Back-to-back in yellow across the whole app (round 4, item 3): league tricode marks (item 6), Team List
// labels (1/2 outline, 2/2 fill) + bracket, Team Calendar bars + arrows, opponent dot and "2/2" label. The stale data
// stamp has its own variable and stays orange. Computed colours in a real browser (desktop-xl).

import { expect, test } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
const YELLOW = 'rgb(245, 224, 66)'; // --ck-b2b
const ORANGE = 'rgb(224, 138, 60)'; // --ck-stale

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'colours: one width is enough'));

test('B2B yellow everywhere; stale stamp still orange', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const css = (sel: string, prop: string, pseudo?: string) => page.locator(sel).first().evaluate((e, [p, ps]) => getComputedStyle(e, ps || null).getPropertyValue(p!), [prop, pseudo]);
  // League List: the Fatigue components' badges (round 6: the tricodes beside them lost their yellow marks)
  await page.goto('/?view=league&layout=list&date=2026-10-24');
  await expect(page.locator('.ck-card .ck-fx-b2b').first()).toBeVisible();
  expect(await css('.ck-card .ck-fx-b2b', 'background-color')).toBe(YELLOW);
  expect(await page.locator('.ck-card .ck-fm-n1, .ck-card .ck-fm-n2').count()).toBe(0);
  // the data stamp is stale at this clock (snapshot of Oct 28 vs Nov 15): orange, its own variable
  expect(await css('[data-testid="data-updated"]', 'color')).toBe(ORANGE);
  expect(await page.locator('.ck-root').evaluate((e) => getComputedStyle(e).getPropertyValue('--ck-stale').trim())).toBe('#e08a3c');
  // week view, 2 weeks (no component): the 2nd night's tricode filled, the 1st ringed (round 4, item 6)
  await page.goto('/?view=league&layout=calendar&date=2026-11-15&weeks=2');
  expect(await css('.ck-month-game .ck-fm-n2', 'background-color')).toBe(YELLOW);
  expect(await css('.ck-month-game .ck-fm-n1', 'outline-color')).toBe(YELLOW);
  // Team List: labels, bracket, opponent dot and "2/2"
  await page.goto('/?view=team&layout=list&team=ORL');
  // (round 5: the Fatigue component's badge and night icons in the columns, both teams)
  await expect(page.locator('.ck-fx-b2b:not(:empty)').first()).toBeAttached();
  expect(await css('.ck-fat-team .ck-fx-b2b:not(:empty)', 'background-color')).toBe(YELLOW);
  expect(await css('.ck-fat-opp .ck-fx-b2b:not(:empty)', 'background-color')).toBe(YELLOW);
  expect(await css('.ck-card[data-b2b]', 'border-left-color', '::before')).toBe(YELLOW);
  expect(await css('.ck-matchup .ck-b2b-mark', 'background-color')).toBe(YELLOW);
  // Team Calendar: bars and the arrows of week-break halves
  await page.goto('/?view=team&layout=calendar&team=ORL');
  expect(await css('.ck-b2b-bar', 'background-color')).toBe(YELLOW);
  for (const month of ['November 2026', 'December 2026', 'January 2027', 'February 2027', 'March 2027']) {
    if ((await page.locator('.ck-b2b-bar-start').count()) || (await page.locator('.ck-b2b-bar-end').count())) break;
    await page.getByLabel('Next month').click();
    void month;
  }
  const half = (await page.locator('.ck-b2b-bar-start').count()) ? ['.ck-b2b-bar-start', 'border-left-color', '::after'] : ['.ck-b2b-bar-end', 'border-right-color', '::before'];
  expect(await css(half[0]!, half[1]!, half[2])).toBe(YELLOW);
});
