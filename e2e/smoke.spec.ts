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

/** League → Calendar is the week view where 7 columns fit a game line (desktop widths), else the count grid. */
const weekView = (project: string) => project === 'desktop' || project === 'desktop-xl';

const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `e2e/screenshots/${project}-${name}.png`, fullPage: true });

test('league view and team view render without console errors', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');

  // League → List (default): game days with games, week strip, TV filter.
  await expect(page.getByTestId('day-title')).toBeVisible();
  await expect(page.locator('[data-game-id]').first()).toBeVisible();
  await shot(page, 'league-day', info.project.name);

  await page.getByLabel('TV games only').check();
  await expect(page.locator('[data-game-id]:not(:has([data-testid="tv-badge"]))')).toHaveCount(0);
  await page.getByLabel('TV games only').uncheck();

  // League → Calendar (week view on desktop, count grid on tablet/phone) → click a day → list at that day.
  await page.getByRole('tab', { name: 'Calendar' }).click();
  const full = weekView(info.project.name);
  await expect(page.getByRole('region', { name: full ? 'League week' : 'Month navigator' })).toBeVisible();
  await shot(page, 'league-month', info.project.name);
  const day = page.locator(full ? '[data-testid="day-header"]:not([disabled])' : '.ck-count-cell:not([disabled])').last();
  const date = full ? await day.evaluate((b) => b.closest('[data-date]')!.getAttribute('data-date')) : await day.getAttribute('data-date');
  await day.click();
  await expect(page).toHaveURL(new RegExp(`date=${date}`));
  await expect(page.locator('[data-game-id]').first()).toBeVisible();

  // Team view (month grid).
  await page.getByRole('tab', { name: 'Team' }).click();
  await page.getByRole('tab', { name: 'Calendar' }).click();
  await page.getByTestId('team-picker').click();
  await page.getByRole('option', { name: 'Los Angeles Lakers' }).click();
  await expect(page).toHaveURL(/team=LAL/);
  await expect(page.locator('.ck-cell-game').first()).toBeVisible();
  await shot(page, 'team-month', info.project.name);

  expect(errors).toEqual([]);
});

test('league week view: every game listed with local logos, no broken images, no sideways scroll', async ({ page }, info) => {
  const errors = collectErrors(page);
  const cdn: string[] = [];
  page.on('request', (r) => r.url().includes('cdn.nba.com') && cdn.push(r.url()));
  await page.goto('/?view=league&date=2026-11-02'); // Nov 2: 15 games
  await page.getByRole('tab', { name: 'Calendar' }).click();
  const project = info.project.name;

  if (!weekView(project)) {
    await expect(page.getByRole('region', { name: 'Month navigator' })).toBeVisible();
    await expect(page.getByLabel('November 2: 15 games')).toBeVisible();
    await expect(page.locator('.ck-month-game')).toHaveCount(0);
  } else {
    await expect(page.getByRole('region', { name: 'League week' })).toBeVisible();
    await expect(page.locator('[data-date="2026-11-02"] .ck-month-game')).toHaveCount(15);
    // two weeks around Nov 15 (9 games in many time groups): the day flow across columns
    await page.goto('/?view=league&layout=calendar&date=2026-11-15&weeks=2');
    await expect(page.locator('[data-date="2026-11-15"] .ck-month-game')).toHaveCount(9);
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
      const cell = document.querySelector('[data-date="2026-11-15"]')!;
      const ci = inner(cell);
      const colGap = parseFloat(getComputedStyle(cell.querySelector('.ck-month-day')!).columnGap);
      const lineW = box(lines[0]!).width;
      // Nov 15 (9 games, many time groups): the day flows as one list down column 1, then column 2.
      const nov15 = document.querySelector('[data-date="2026-11-15"]')!;
      const flow = [...nov15.querySelectorAll('.ck-mcol')].map((col) => {
        const items = [...col.querySelectorAll('.ck-tlabel, li')];
        const bottom = items.reduce((a, b) => (box(b).bottom > box(a).bottom ? b : a));
        return {
          ids: [...col.querySelectorAll('li')].map((li) => li.getAttribute('data-game-id')),
          lefts: [...new Set([...col.querySelectorAll('li')].map((li) => Math.round(box(li).left)))],
          height: box(bottom).bottom - box(items[0]!).top,
          endsWithGame: bottom.tagName === 'LI',
        };
      });
      const unit = box(nov15.querySelector('.ck-tgroup')!).height + parseFloat(getComputedStyle(nov15.querySelector('.ck-mcol')!).rowGap);
      // visual reading order: by column position, then top to bottom
      const visual = [...nov15.querySelectorAll('li')].sort((a, b) => box(a).left - box(b).left || box(a).top - box(b).top).map((li) => li.getAttribute('data-game-id'));
      const domOrder = [...nov15.querySelectorAll('li')].map((li) => li.getAttribute('data-game-id'));
      const imgs = [...document.querySelectorAll('.ck-week-view img')];
      return {
        content: box(document.querySelector('.ck-root')!).width,
        cols: Number(cell.querySelector('.ck-month-day')!.getAttribute('data-cols')),
        cellInner: ci.right - ci.left,
        lineW,
        colGap,
        spare: ci.right - ci.left - (2 * lineW + colGap),
        flow,
        unit,
        visual,
        domOrder,
        lineWidths: [...new Set(lines.map((l) => Math.round(box(l).width * 100) / 100))],
        font: getComputedStyle(document.querySelector('.ck-mtri')!).fontSize,
        logo: box(document.querySelector('.ck-logo-backing')!).width,
        images: document.images.length,
        broken: [...document.images].filter((i) => i.naturalWidth === 0).map((i) => i.src),
        unbacked: imgs.filter((i) => !i.parentElement!.classList.contains('ck-logo-backing')).length,
        // nothing clipped: each line inside its cell's content box; each tricode inside its column
        clipped: lines.filter((l) => { const c = inner(l.closest('.ck-cell')!); const b = box(l); return b.left < c.left - 0.5 || b.right > c.right + 0.5; }).length,
        triOverflow: [...document.querySelectorAll('.ck-mtri')].filter((t) => box(t.firstElementChild!).width > box(t).width + 0.01).length,
        visibleText: document.querySelector('.ck-week-view')!.textContent ?? '',
        lineTexts: lines.map((l) => l.textContent ?? ''),
        // the "@" sits between the away tricode and the home logo without touching either
        atClear: lines.filter((l) => { const at = box(l.querySelector('.ck-at')!); const t = l.querySelectorAll('.ck-mtri-text'); const logo = l.querySelectorAll('.ck-logo-backing')[1]!; return !(at.width > 0 && at.left >= box(t[0]!).right && at.right <= box(logo).left); }).length,
      };
    });
    console.log(`[${project}] content ${r.content}px, cols ${r.cols}, cell inner ${r.cellInner.toFixed(2)}px, line ${r.lineW.toFixed(2)}px, col gap ${r.colGap}px, 2-col spare ${r.spare.toFixed(2)}px, font ${r.font}, logo ${r.logo}px`);
    expect(r.images).toBeGreaterThan(150);
    expect(r.broken).toEqual([]);
    expect(r.unbacked).toBe(0);
    expect(r.clipped).toBe(0);
    expect(r.triOverflow).toBe(0);
    expect(r.atClear).toBe(0);
    expect(r.lineWidths).toHaveLength(1); // every line the same width → columns line up across cells
    expect(r.visibleText).not.toMatch(/ESPN|NBC|Peacock|Prime Video|NBA TV|ABC|Telemundo/);
    expect(r.lineTexts.every((t) => /^[A-Z]{3}@[A-Z]{3}(TV)?$/.test(t)), r.lineTexts.find((t) => !/^[A-Z]{3}@[A-Z]{3}(TV)?$/.test(t))).toBe(true); // "HOU@ATL" on every line
    if (project === 'desktop' || project === 'desktop-xl') {
      expect(r.font).toBe('11px'); // same game-line size at 1280 and 1920
      expect(r.logo).toBe(16);
    }
    if (project === 'desktop') expect(r.cols).toBe(1);
    if (project === 'desktop-xl') {
      expect(r.content).toBeGreaterThanOrEqual(1700);
      expect(r.cols).toBe(2);
      expect(r.spare).toBeGreaterThanOrEqual(3); // 2 × 119 + 8 = 246 of 249.42 px
      // newspaper flow on Nov 15: both columns used, each a single x position, balanced within one row,
      // reading column 1 then column 2 = DOM order (= tip-off order, checked in month.test.tsx), no label last
      const [c1, c2] = r.flow;
      console.log(`[${project}] Nov 15 columns: ${c1!.ids.length} + ${c2!.ids.length} games, heights ${c1!.height.toFixed(1)} / ${c2!.height.toFixed(1)}px, row ${r.unit.toFixed(1)}px`);
      expect(r.flow).toHaveLength(2);
      for (const c of r.flow) {
        expect(c.ids.length).toBeGreaterThan(0);
        expect(c.lefts).toHaveLength(1);
        expect(c.endsWithGame).toBe(true);
      }
      expect(c2!.lefts[0]! > c1!.lefts[0]!).toBe(true);
      expect(Math.abs(c1!.height - c2!.height)).toBeLessThanOrEqual(r.unit + 0.5);
      expect(r.visual).toEqual(r.domOrder);
    }
    if (project === 'desktop') expect(r.flow).toHaveLength(1);
    // TV pill tooltip: network names on hover (one floating tooltip, never clipped by the cell)
    const pill = page.locator('.ck-week-view .ck-tv-pill').first();
    await pill.hover();
    await expect(page.getByTestId('tooltip')).toHaveText((await pill.getAttribute('data-tip'))!);
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
  const day = page.locator('[data-day="2026-10-21"]');
  await expect(day.locator('[data-game-id]').first()).toBeVisible();
  const games = await day.locator('[data-game-id]').count();
  await expect(day.getByTestId('open-game')).toHaveCount(isRotationkitConfigured() ? games : 0);
  if (!isRotationkitConfigured()) await expect(page.getByTestId('open-game')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('deep link opens the team view for a team', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?view=team&team=BOS');
  await expect(page.getByTestId('team-picker')).toHaveAttribute('data-team-id', '1610612738');
  await expect(page.locator('.ck-cell-game').first()).toBeVisible();
  expect(errors).toEqual([]);
});
