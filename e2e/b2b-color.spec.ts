// Back-to-back in yellow across the whole app: league tricode marks, Team List
// labels (1/2 outline, 2/2 fill) + bracket, Team Calendar labels (no bars between cells), opponent dot and "2/2" label. The stale data
// stamp has its own variable and stays orange. Computed colours in a real browser (desktop-xl).

import { expect, test } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
const YELLOW = 'rgb(245, 224, 66)'; // --ck-b2b
const ORANGE = 'rgb(224, 138, 60)'; // --ck-stale

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'colours: one width is enough'));

test('B2B yellow everywhere; stale stamp still orange', async ({ page }) => {
  // the clock 40 h after the served snapshot, so the stamp is stale whatever day the snapshot is from (a fixed clock
  // broke when the daily update caught up)
  await page.goto('/calendar/data/schedule.json');
  const snapshot = Date.parse((JSON.parse(await page.locator('body').innerText()) as { meta: { time: string } }).meta.time);
  await page.clock.setFixedTime(Math.max(NOW.getTime(), snapshot + 40 * 3_600_000));
  const css = (sel: string, prop: string, pseudo?: string) => page.locator(sel).first().evaluate((e, [p, ps]) => getComputedStyle(e, ps || null).getPropertyValue(p!), [prop, pseudo]);
  // League List: the Fatigue components' badges (the tricodes beside them lost their yellow marks)
  await page.goto('/calendar/?view=league&layout=list&date=2026-10-24');
  await expect(page.locator('.ck-card .ck-fx-b2b').first()).toBeVisible();
  expect(await css('.ck-card .ck-fx-b2b', 'background-color')).toBe(YELLOW);
  expect(await page.locator('.ck-card .ck-fm-n1, .ck-card .ck-fm-n2').count()).toBe(0);
  // the data stamp is stale at this clock: orange, its own variable
  expect(await css('[data-testid="data-updated"]', 'color')).toBe(ORANGE);
  expect(await page.locator('.ck-root').evaluate((e) => getComputedStyle(e).getPropertyValue('--ck-stale').trim())).toBe('#e08a3c');
  // week view, 2 weeks (no component): the 2nd night's tricode filled, the 1st ringed
  await page.goto('/calendar/?view=league&layout=calendar&date=2026-11-15&weeks=2');
  expect(await css('.ck-month-game .ck-fm-n2', 'background-color')).toBe(YELLOW);
  expect(await css('.ck-month-game .ck-fm-n1', 'outline-color')).toBe(YELLOW);
  // Team List: labels, bracket, opponent dot and "2/2"
  await page.goto('/calendar/?view=team&layout=list&team=ORL');
  // (the Fatigue component's badge and night icons in the columns, both teams)
  await expect(page.locator('.ck-fx-b2b:not(:empty)').first()).toBeAttached();
  expect(await css('.ck-fat-team .ck-fx-b2b:not(:empty)', 'background-color')).toBe(YELLOW);
  expect(await css('.ck-fat-opp .ck-fx-b2b:not(:empty)', 'background-color')).toBe(YELLOW);
  expect(await css('.ck-card[data-b2b]', 'border-left-color', '::before')).toBe(YELLOW);
  // No opponent dot beside its component on desktop; the Team Calendar cells keep it
  expect(await page.locator('.ck-team-rows .ck-matchup .ck-b2b-mark').count()).toBe(0);
  // Team Calendar: the opponent's 2nd-night mark on its own line (CK-29; it was a dot on its tricode); the nights are labelled on their cells, with no bar between the cells
  await page.goto('/calendar/?view=team&layout=calendar&team=ORL');
  expect(await css('.ck-day-cell [data-testid="opp-b2b"][data-night="2"]', 'background-color')).toBe(YELLOW);
  await expect(page.locator('.ck-day-cell[data-b2b] .ck-b2b-label').first()).toBeVisible();
  expect(await page.locator('.ck-b2b-bar, [data-b2b-bar]').count()).toBe(0);
});
