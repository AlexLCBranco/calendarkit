// Smoke test: the app loads, league and team views render, no console errors. Screenshots for review go to
// e2e/screenshots/ (git-ignored).

import { expect, test, type Page } from '@playwright/test';
import { isRotationkitConfigured } from '../src/config';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `e2e/screenshots/${project}-${name}.png`, fullPage: true });

test('league view and team view render without console errors', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');

  // League view (default): a day with games, week strip, TV filter.
  await expect(page.getByTestId('day-title')).toBeVisible();
  await expect(page.locator('[data-game-id]').first()).toBeVisible();
  const all = await page.locator('[data-game-id]').count();
  await shot(page, 'league-day', info.project.name);

  await page.getByLabel('TV games only').check();
  const tv = await page.locator('[data-game-id]').count();
  expect(tv).toBeLessThanOrEqual(all);
  await expect(page.locator('[data-game-id]:not(:has([data-testid="tv-badge"]))')).toHaveCount(0);
  await page.getByLabel('TV games only').uncheck();

  // League → Month (full month on desktop/tablet, count navigator on phone) → click a day → day view.
  await page.getByRole('button', { name: 'Month' }).click();
  const full = info.project.name !== 'phone';
  await expect(page.getByRole('region', { name: full ? 'League month' : 'Month navigator' })).toBeVisible();
  await shot(page, 'league-month', info.project.name);
  const day = page.locator(full ? '.ck-month-cell.ck-cell-game' : '.ck-count-cell:not([disabled])').last();
  const date = await day.getAttribute('data-date');
  await day.click();
  await expect(page).toHaveURL(new RegExp(`date=${date}`));
  await expect(page.locator('[data-game-id]').first()).toBeVisible();

  // Team view.
  await page.getByRole('tab', { name: 'Team' }).click();
  await page.getByLabel('Team').selectOption({ label: 'Los Angeles Lakers' });
  await expect(page).toHaveURL(/team=LAL/);
  await expect(page.locator('.ck-cell-game').first()).toBeVisible();
  await shot(page, 'team-month', info.project.name);

  expect(errors).toEqual([]);
});

test('league month: every game listed with local logos, no broken images, no sideways scroll', async ({ page }, info) => {
  const errors = collectErrors(page);
  const cdn: string[] = [];
  page.on('request', (r) => r.url().includes('cdn.nba.com') && cdn.push(r.url()));
  await page.goto('/?view=league&date=2026-11-02'); // Nov 2: 15 games
  await page.getByRole('button', { name: 'Month' }).click();
  const project = info.project.name;

  if (project === 'phone') {
    await expect(page.getByRole('region', { name: 'Month navigator' })).toBeVisible();
    await expect(page.getByLabel('November 2: 15 games')).toBeVisible();
    await expect(page.locator('.ck-month-game')).toHaveCount(0);
  } else {
    await expect(page.getByRole('region', { name: 'League month' })).toBeVisible();
    await expect(page.locator('[data-date="2026-11-02"] .ck-month-game')).toHaveCount(15);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    expect(await page.evaluate(async () => (await document.fonts.ready, document.fonts.check('600 11px "Inter ck"')))).toBe(true);
    const r = await page.evaluate(() => {
      const box = (e: Element) => e.getBoundingClientRect();
      const inner = (cell: Element) => {
        const cs = getComputedStyle(cell);
        const b = box(cell);
        return { left: b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), right: b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight) };
      };
      const lines = [...document.querySelectorAll('.ck-month-game')];
      const cell = document.querySelector('[data-date="2026-11-02"]')!;
      const ci = inner(cell);
      const ul = cell.querySelector('.ck-tgames')!;
      const colGap = parseFloat(getComputedStyle(ul).columnGap);
      const lineW = box(lines[0]!).width;
      const groups = [...cell.querySelectorAll('.ck-tgroup')].map((g) => [...g.querySelectorAll('li')].map((li) => Math.round(box(li).left)));
      const imgs = [...document.querySelectorAll('.ck-month-full img')];
      return {
        content: box(document.querySelector('.ck-root')!).width,
        cols: Number(cell.querySelector('.ck-month-day')!.getAttribute('data-cols')),
        cellInner: ci.right - ci.left,
        lineW,
        colGap,
        spare: ci.right - ci.left - (2 * lineW + colGap),
        groups,
        lineWidths: [...new Set(lines.map((l) => Math.round(box(l).width * 100) / 100))],
        font: getComputedStyle(document.querySelector('.ck-mtri')!).fontSize,
        logo: box(document.querySelector('.ck-logo-backing')!).width,
        images: document.images.length,
        broken: [...document.images].filter((i) => i.naturalWidth === 0).map((i) => i.src),
        unbacked: imgs.filter((i) => !i.parentElement!.classList.contains('ck-logo-backing')).length,
        // nothing clipped: each line inside its cell's content box; each tricode inside its column
        clipped: lines.filter((l) => { const c = inner(l.closest('.ck-cell')!); const b = box(l); return b.left < c.left - 0.5 || b.right > c.right + 0.5; }).length,
        triOverflow: [...document.querySelectorAll('.ck-mtri')].filter((t) => box(t.firstElementChild!).width > box(t).width + 0.01).length,
        visibleText: document.querySelector('.ck-month-full')!.textContent ?? '',
      };
    });
    console.log(`[${project}] content ${r.content}px, cols ${r.cols}, cell inner ${r.cellInner.toFixed(2)}px, line ${r.lineW.toFixed(2)}px, col gap ${r.colGap}px, 2-col spare ${r.spare.toFixed(2)}px, font ${r.font}, logo ${r.logo}px`);
    expect(r.images).toBeGreaterThan(300);
    expect(r.broken).toEqual([]);
    expect(r.unbacked).toBe(0);
    expect(r.clipped).toBe(0);
    expect(r.triOverflow).toBe(0);
    expect(r.lineWidths).toHaveLength(1); // every line the same width → columns line up across cells
    expect(r.visibleText).not.toMatch(/ESPN|NBC|Peacock|Prime Video|NBA TV|ABC|Telemundo|@/);
    if (project === 'desktop' || project === 'desktop-xl') {
      expect(r.font).toBe('11px'); // same game-line size at 1280 and 1920
      expect(r.logo).toBe(16);
    }
    if (project === 'desktop') expect(r.cols).toBe(1);
    if (project === 'desktop-xl') {
      expect(r.content).toBeGreaterThanOrEqual(1700);
      expect(r.cols).toBe(2);
      expect(r.spare).toBeGreaterThanOrEqual(8);
      // fill down: in a group of n games, the first ceil(n/2) share column 1, the rest are in column 2
      for (const g of r.groups.filter((x) => x.length >= 2)) {
        const k = Math.ceil(g.length / 2);
        expect(new Set(g.slice(0, k)).size).toBe(1);
        expect(new Set(g.slice(k)).size).toBe(1);
        expect(g[k]! > g[0]!).toBe(true);
      }
    }
    // TV pill tooltip: network names on hover
    const pill = page.locator('[data-date="2026-11-02"] .ck-tv-pill').first();
    await pill.hover();
    expect(await pill.evaluate((e) => getComputedStyle(e, '::after').content)).toBe(JSON.stringify(await pill.getAttribute('data-tip')));
    await page.mouse.move(0, 0);
    await shot(page, 'league-month-nov', project);
  }
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(cdn).toEqual([]);
  expect(errors).toEqual([]);
});

test('Rotations action on a finished day only when ROTATIONKIT_BASE_URL is set', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?view=league&date=2026-10-21'); // opening night week: long over
  await expect(page.locator('[data-game-id]').first()).toBeVisible();
  const games = await page.locator('[data-game-id]').count();
  await expect(page.getByTestId('open-game')).toHaveCount(isRotationkitConfigured() ? games : 0);
  expect(errors).toEqual([]);
});

test('deep link opens the team view for a team', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?view=team&team=BOS');
  await expect(page.getByLabel('Team')).toHaveValue('1610612738');
  await expect(page.locator('.ck-cell-game').first()).toBeVisible();
  expect(errors).toEqual([]);
});
