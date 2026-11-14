// The Schedule's team / league selector is the top bar's most prominent control: taller, larger text and logo, an
// accent outline, wider than any other control; the full team name from 1440 px (the tricode below), and the bar
// stays one 44 px row. Asked for explicitly, so this pins sizes even though the bar is otherwise "in flux".

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/${search}`);
  await expect(page.getByTestId('team-picker')).toBeVisible();
}

/** The picker against the bar's other controls. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[data-testid="top-bar"]') ?? document.querySelector<HTMLElement>('.ck-bar1')!;
    const pick = document.querySelector<HTMLElement>('[data-testid="team-picker"]')!;
    const name = pick.querySelector<HTMLElement>('.ck-picker-name')!;
    const others = [...bar.querySelectorAll<HTMLElement>('button, [role="tab"]')].filter((b) => !pick.contains(b) && !b.closest('.ck-picker') && b.offsetParent);
    // text controls (tabs, Today): the arrows' and icons' glyphs are drawn larger than text on purpose
    const texts = others.filter((b) => b.matches('[role="tab"], [data-testid="today"]'));
    const cs = getComputedStyle(pick);
    const shown = [...name.children].filter((c) => (c as HTMLElement).offsetParent && !c.classList.contains('ck-sr')).map((c) => c.textContent);
    return {
      h: pick.getBoundingClientRect().height,
      w: pick.getBoundingClientRect().width,
      font: parseFloat(getComputedStyle(name).fontSize),
      border: parseFloat(cs.borderTopWidth),
      // the logo's disc (the image sits inside it at 80 %)
      logo: pick.querySelector('.ck-logo-backing')?.getBoundingClientRect().width ?? 0,
      maxOtherH: Math.max(...others.map((b) => b.getBoundingClientRect().height)),
      maxOtherW: Math.max(...others.map((b) => b.getBoundingClientRect().width)),
      maxOtherFont: Math.max(...texts.map((b) => parseFloat(getComputedStyle(b).fontSize))),
      barH: bar.getBoundingClientRect().height,
      clipped: name.scrollWidth > name.clientWidth + 1,
      shown,
    };
  });

for (const view of ['list', 'calendar'] as const)
  test(`Team ${view}: the selector is bigger than every other bar control, the bar stays 44 px`, async ({ page }) => {
    await open(page, `?view=team&layout=${view}&team=MIN`);
    const m = await measure(page);
    expect(m.h).toBeGreaterThanOrEqual(36);
    expect(m.h).toBeGreaterThan(m.maxOtherH);
    expect(m.w).toBeGreaterThan(m.maxOtherW);
    expect(m.font).toBeGreaterThanOrEqual(16);
    expect(m.font).toBeGreaterThan(m.maxOtherFont);
    expect(m.border).toBeGreaterThanOrEqual(2);
    expect(m.logo).toBeGreaterThanOrEqual(24);
    expect(m.barH).toBeLessThanOrEqual(44);
    expect(m.clipped).toBe(false);
    // the longest name in full where the window is wide enough, the tricode below 1440 px
    expect(m.shown).toEqual([page.viewportSize()!.width >= 1440 ? 'Minnesota Timberwolves' : 'MIN']);
  });

test('League: "All teams", same prominence, bar 44 px', async ({ page }) => {
  await open(page, '?view=league&layout=calendar');
  const m = await measure(page);
  await expect(page.getByTestId('team-picker')).toContainText('All teams');
  expect(m.h).toBeGreaterThan(m.maxOtherH);
  expect(m.font).toBeGreaterThan(m.maxOtherFont);
  expect(m.barH).toBeLessThanOrEqual(44);
});
