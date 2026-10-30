// The Fatigue component (round 5) in a real browser at 1920 × 911 (Alex's window) and 1280 × 900: League List (both
// teams, mirrored around the matchup), Team List (team + opponent columns), week view (1 week, compact, under the line).
// Every component — empty or not — has the same width, so badges, icons and chips sit at one x down a list and nothing
// moves the logos; the night icons are in time order (left = earlier) in every column; a known HA 2nd night shows a
// faded house left of a solid plane. Runs once (desktop-xl), sizing the window itself.

import { expect, test, type Page } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');
const SIZES = [
  { width: 1920, height: 911 },
  { width: 1280, height: 900 },
];

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'sizes the window itself'));

async function open(page: Page, size: { width: number; height: number }, search: string) {
  await page.setViewportSize(size);
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete) && !!document.querySelector('[data-game-id]'));
  await page.evaluate(() => document.fonts.ready);
}

/**
 * For every row in `rowSel`: the left x and width of each of its Fatigue components (in order), of each slot, and of
 * the given anchor parts; a row's height. Returns the distinct values per column so a test can ask for "one x".
 */
const columns = (page: Page, rowSel: string, parts: string[]) =>
  page.evaluate(
    ({ rowSel, parts }) => {
      const r2 = (n: number) => n.toFixed(1);
      const out: Record<string, string[]> = {};
      const add = (k: string, v: string) => (out[k] ??= []).includes(v) || out[k]!.push(v);
      const bad: string[] = [];
      let rows = 0;
      for (const row of document.querySelectorAll<HTMLElement>(rowSel)) {
        if (!row.querySelector('[data-testid="fatigue"]')) continue;
        rows++;
        const fx = [...row.querySelectorAll<HTMLElement>('[data-testid="fatigue"]')];
        fx.forEach((f, i) => {
          const b = f.getBoundingClientRect();
          add(`fx${i}.left`, r2(b.left));
          add(`fx${i}.width`, r2(b.width));
          for (const s of f.children) add(`fx${i}.${getComputedStyle(s).gridArea.split(' ')[0]}`, r2(s.getBoundingClientRect().left)); // grid areas b, n1, n2, c
          for (const c of f.children) if (c.getBoundingClientRect().right > b.right + 0.5 || c.getBoundingClientRect().left < b.left - 0.5) bad.push(`${row.dataset.gameId} fx${i} slot outside`);
          // the night icons in time order: DOM order = left to right
          const ic = [...f.querySelectorAll('.ck-fx-icon')].map((x) => x.getBoundingClientRect().left);
          if (ic.length === 2 && !(ic[0]! < ic[1]!)) bad.push(`${row.dataset.gameId} fx${i} icons not left to right`);
        });
        for (const p of parts) row.querySelectorAll(p).forEach((e, i) => add(`${p}#${i}`, r2(e.getBoundingClientRect().left)));
        add('height', r2(row.getBoundingClientRect().height));
      }
      return { out, bad, rows };
    },
    { rowSel, parts },
  );

for (const size of SIZES) {
  test(`League List ${size.width}×${size.height}: both teams' components, one x per column, same width empty or not, rows one line`, async ({ page }) => {
    for (const date of ['2026-10-24', '2027-01-07']) {
      await open(page, size, `?view=league&layout=list&date=${date}`);
      const { out, bad, rows } = await columns(page, `[data-testid="league-list"] .ck-lday[data-day="${date}"] .ck-card`, ['.ck-logo-backing', '.ck-vsat']);
      expect(rows, date).toBeGreaterThan(5);
      expect(bad, date).toEqual([]);
      for (const k of ['fx0.left', 'fx0.width', 'fx1.left', 'fx1.width', '.ck-logo-backing#0', '.ck-logo-backing#1', '.ck-vsat#0']) expect(out[k], `${date} ${k}: one value`).toHaveLength(1);
      // empty and full components: one width; empty ones exist on the day
      expect(await page.locator(`.ck-lday[data-day="${date}"] .ck-fx-empty`).count(), date).toBeGreaterThan(0);
      // order: [away fatigue] [logo] … [logo] [home fatigue], nothing overlapping
      const order = await page.locator(`.ck-lday[data-day="${date}"] .ck-card`).evaluateAll((cards) =>
        cards.map((c) => {
          const x = (s: string, i = 0) => c.querySelectorAll(s)[i]!.getBoundingClientRect();
          return x('.ck-rec').right <= x('.ck-fx').left + 0.5 && x('.ck-fx').right <= x('.ck-logo-backing, .ck-logo-empty').left + 0.5 && x('.ck-logo-backing, .ck-logo-empty', 1).right <= x('.ck-fx', 1).left + 0.5 && x('.ck-fx', 1).right <= x('.ck-rec', 1).left + 0.5;
        }),
      );
      expect(order.every(Boolean), date).toBe(true);
      // one line per row (as before: 35 px; a few rows were already 36.5 px before round 5, e.g. Jan 7, 2027)
      expect(out.height!.every((h) => +h <= 36.5), `${date} heights ${out.height}`).toBe(true);
    }
    // phones and tablets keep the tricode marks only (checked in unit tests); here: the list has no sideways scroll
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`Team List ${size.width}×${size.height}: team + opponent components at one x on every row`, async ({ page }) => {
    for (const team of ['LAL', 'ORL']) {
      await open(page, size, `?view=team&layout=list&team=${team}`);
      const { out, bad, rows } = await columns(page, '[data-testid="team-list"] .ck-card', ['.ck-logo-backing', '.ck-vsat']);
      expect(rows, team).toBeGreaterThan(60);
      expect(bad, team).toEqual([]);
      for (const k of ['fx0.left', 'fx0.width', 'fx1.left', 'fx1.width', 'fx0.b', 'fx1.b', 'fx0.n1', 'fx1.n2', 'fx0.c', 'fx1.c', '.ck-logo-backing#0', '.ck-logo-backing#1']) expect(out[k], `${team} ${k}: one value`).toHaveLength(1);
    }
  });

  test(`week view (1 week) ${size.width}×${size.height}: compact components under the line's sides, aligned, inside the cell, no page scroll`, async ({ page }) => {
    for (const date of ['2026-11-01', '2027-01-03']) {
      await open(page, size, `?view=league&layout=calendar&date=${date}&weeks=1`);
      const r = await page.evaluate(() => {
        const bad: string[] = [];
        const widths = new Set<string>();
        let n = 0;
        for (const l of document.querySelectorAll<HTMLElement>('.ck-month-game')) {
          const fx = [...l.querySelectorAll('.ck-mfx .ck-fx')];
          if (!fx.length) continue;
          n++;
          const logos = [...l.querySelectorAll('.ck-mline > .ck-logo-backing, .ck-mline > .ck-logo-empty')].map((e) => e.getBoundingClientRect());
          const [a, h] = fx.map((e) => e.getBoundingClientRect());
          fx.forEach((e) => widths.add(e.getBoundingClientRect().width.toFixed(2)));
          // the away component starts under the away logo, the home one ends under the home logo; they don't touch
          if (Math.abs(a!.left - logos[0]!.left) > 0.5) bad.push(`${l.dataset.gameId} away not under its logo`);
          if (Math.abs(h!.right - logos[1]!.right) > 0.5) bad.push(`${l.dataset.gameId} home not under its logo`);
          if (a!.right > h!.left - 4) bad.push(`${l.dataset.gameId} components too close`);
          const cell = l.closest('.ck-month-cell')!.getBoundingClientRect();
          if (h!.bottom > cell.bottom + 0.5 || h!.right > cell.right + 0.5) bad.push(`${l.dataset.gameId} outside its cell`);
          for (const e of fx)
            for (const i of [...e.querySelectorAll('.ck-fx-icon')].map((x) => x.getBoundingClientRect().left).reduce<number[][]>((p, x, k, all) => (k ? [...p, [all[k - 1]!, x]] : p), []))
              if (!(i[0]! < i[1]!)) bad.push(`${l.dataset.gameId} icons out of order`);
        }
        const se = document.scrollingElement!;
        return { bad, n, widths: [...widths], scroll: se.scrollHeight - se.clientHeight, scale: document.querySelector<HTMLElement>('.ck-week-view')!.dataset.scale };
      });
      console.log(`[${size.width}×${size.height}] week of ${date}: ${r.n} lines with components, width ${r.widths.join('/')}, scale ${r.scale}`);
      expect(r.n, date).toBeGreaterThan(10);
      expect(r.bad, date).toEqual([]);
      expect(r.widths, date).toHaveLength(1);
      expect(r.scroll, date).toBeLessThanOrEqual(0);
    }
  });
}

test('a known HA 2nd night (MIA @ CHA, Oct 24, 2026) at 1920 × 911: readable B2B badge, faded house left of a solid plane; home column keeps time order', async ({ page }) => {
  await open(page, SIZES[0]!, '?view=league&layout=list&date=2026-10-24');
  const icon = (sel: string) =>
    page.locator(sel).evaluateAll((els) => els.map((e) => ({ kind: e.getAttribute('data-kind'), x: e.getBoundingClientRect().left, solid: e.classList.contains('ck-fx-tonight'), w: e.getBoundingClientRect().width })));
  const away = '[data-game-id="0022600104"] .ck-matchup > .ck-fx >> nth=0';
  const badge = await page.locator(`${away} >> .ck-fx-b2b`).evaluate((b) => {
    const r = b.getBoundingClientRect();
    const tri = b.closest('.ck-card')!.querySelector('.ck-team')!.getBoundingClientRect();
    return { text: b.textContent, w: r.width, h: r.height, triH: tri.height, bg: getComputedStyle(b).backgroundColor };
  });
  expect(badge.text).toBe('B2B');
  expect(badge.bg).toBe('rgb(245, 224, 66)');
  // comparable to the tricode, not a dot
  expect(badge.h).toBeGreaterThanOrEqual(badge.triH * 0.85);
  expect(badge.w).toBeGreaterThanOrEqual(28);
  const a = await icon(`${away} >> .ck-fx-icon`);
  expect(a.map((i) => [i.kind, i.solid])).toEqual([
    ['home', false],
    ['away', true],
  ]);
  expect(a[0]!.x).toBeLessThan(a[1]!.x);
  expect(a[0]!.w).toBeGreaterThanOrEqual(13);
  // home (mirrored) column: badge on the left, icons still earlier → later: WAS @ CHI, CHI on an AH 2nd night
  const home = '[data-game-id="0022600108"] .ck-matchup > .ck-fx >> nth=1';
  const h = await icon(`${home} >> .ck-fx-icon`);
  expect(h.map((i) => [i.kind, i.solid])).toEqual([
    ['away', false],
    ['home', true],
  ]);
  expect(h[0]!.x).toBeLessThan(h[1]!.x);
  const bx = await page.locator(`${home} >> .ck-fx-b2b`).evaluate((b) => b.getBoundingClientRect().left);
  expect(bx).toBeLessThan(h[0]!.x);
  // away column mirrored: badge right of the icons, next to the logo
  const ax = await page.locator(`${away} >> .ck-fx-b2b`).evaluate((b) => b.getBoundingClientRect().left);
  expect(ax).toBeGreaterThan(a[1]!.x);
  await page.locator('[data-game-id="0022600104"]').screenshot({ path: 'test-output/round5-shots/e2e-ha-row.png' });
});
