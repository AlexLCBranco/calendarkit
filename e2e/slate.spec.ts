// Slate view (round 7, part 3): a day of games as cards in two columns, the day changed only by ← / → (top bar and
// keyboard), opening on today. Its copy: a transparent PNG where only the cards are opaque, SLATE_COPY_GAP apart, in a
// column count that suits the page (1920 × 911 here), sharp at 2× its fitted size. Desktop widths.

import { mkdirSync } from 'node:fs';
import { test as plain } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import { copySlate } from './slatecopy';

const NOW = new Date('2026-11-15T15:00:00Z'); // 12:00 in São Paulo (the projects' zone): Nov 15 is today
const OUT = 'test-output/copy-images';
const PAGE = { width: 1920, height: 911 };

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));
plain.beforeEach(({}, info) => plain.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

type RawTeam = { teamId: number; teamTricode: string; teamName: string; score: number; wins: number; losses: number };
type RawGame = { gameId: string; gameDateEst: string; gameStatus: number; gameStatusText: string; awayTeam: RawTeam; homeTeam: RawTeam };

/** The served snapshot's regular-season / Cup games by ET date (independent of the app's code). */
const snapshot = (page: Page) =>
  page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const out: Record<string, RawGame[]> = {};
    for (const d of raw.leagueSchedule.gameDates as { games: RawGame[] }[])
      for (const g of d.games) if (/^00[2456]/.test(g.gameId)) (out[g.gameDateEst.slice(0, 10)] ??= []).push(g);
    return out;
  });

async function openSlate(page: Page, date?: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.setFixedTime(NOW);
  await page.goto(`/calendar/?view=league&layout=slate${date ? `&date=${date}` : ''}`);
  await expect(page.getByTestId('slate')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const title = (page: Page) => page.getByTestId('day-title').textContent();
const ids = (page: Page) => page.locator('[data-testid="slate"] .ck-slate-card').evaluateAll((cs) => cs.map((c) => c.getAttribute('data-game-id')));

plain('opens on today (the clock), not on a date in the URL', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/calendar/?view=league&layout=slate&date=2026-12-25');
  await expect(page.getByTestId('slate')).toBeVisible();
  expect(await page.getByTestId('day-title').textContent()).toBe('Sunday, November 15, 2026');
  await expect(page.getByRole('tab', { name: 'Slate' })).toHaveAttribute('aria-selected', 'true');
});

test('columns of cards (round 9: 2 at 1920, 1 at 1280 — notes.spec.ts); every game of the day, in order, with the League List row\'s facts', async ({ page }) => {
  await openSlate(page, '2026-11-15');
  const want = (await snapshot(page))['2026-11-15']!.map((g) => g.gameId);
  expect((await ids(page)).sort()).toEqual([...want].sort());
  // round 9: two columns at 1920, one at 1280 (the note box needs 300 px); cards of equal width, none outside the view
  const boxes = await page.locator('[data-testid="slate"] .ck-slate-card').evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect().toJSON() as DOMRect));
  expect(new Set(boxes.map((b) => Math.round(b.left))).size).toBe(page.viewportSize()!.width >= 1920 ? 2 : 1);
  expect(new Set(boxes.map((b) => Math.round(b.width))).size).toBe(1);
  expect(Math.max(...boxes.map((b) => b.right))).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
  // the same facts as the League List row of each game: time, records, Fatigue components, labels, TV
  const facts = (sel: string) =>
    page.locator(sel).evaluateAll((cards) =>
      Object.fromEntries(
        cards.map((c) => [
          c.getAttribute('data-game-id'),
          {
            time: c.querySelector('[data-testid="tipoff"]')?.textContent?.trim(),
            rec: [...c.querySelectorAll('.ck-rec, .ck-slate-rec')].map((r) => r.textContent),
            fx: [...c.querySelectorAll('[data-testid="fatigue"]')].map((f) => `${f.getAttribute('data-night')}|${f.getAttribute('data-stretch')}|${f.getAttribute('data-code')}`),
            tags: [...c.querySelectorAll('.ck-tag')].map((t) => t.className.replace(/\s+/g, ' ')).sort(),
            tv: c.querySelector('[data-testid="tv-badge"]')?.textContent?.replace(/\s+/g, ' ').trim(),
          },
        ]),
      ),
    );
  const slate = await facts('[data-testid="slate"] .ck-slate-card');
  await page.getByRole('tab', { name: 'List', exact: true }).click();
  await expect(page.getByTestId('day-title')).toHaveText('Sunday, November 15, 2026');
  const list = await facts('.ck-lday[data-day="2026-11-15"] .ck-card');
  for (const id of want) expect(slate[id], id).toEqual(list[id]);
});

test('cards: full team names, "@" before the home team, time or final score with OT', async ({ page }) => {
  const all = await (async () => {
    await openSlate(page);
    return snapshot(page);
  })();
  // a played day with an overtime game, if the snapshot has one; else any played day
  const played = Object.entries(all).filter(([, gs]) => gs.every((g) => g.gameStatus === 3));
  const [date, games] = played.find(([, gs]) => gs.some((g) => /OT/.test(g.gameStatusText))) ?? played.at(-1)!;
  await openSlate(page, date);
  for (const g of games) {
    const card = page.locator(`.ck-slate-card[data-game-id="${g.gameId}"]`);
    const rows = card.locator('.ck-slate-row');
    await expect(rows.nth(0).locator('.ck-slate-name')).toHaveText(g.awayTeam.teamName);
    await expect(rows.nth(1).locator('.ck-slate-name')).toHaveText(g.homeTeam.teamName);
    await expect(rows.nth(0).locator('.ck-slate-at')).toHaveText('');
    await expect(rows.nth(1).locator('.ck-slate-at')).toHaveText('@');
    await expect(rows.nth(0).locator('.ck-slate-score')).toHaveText(String(g.awayTeam.score));
    await expect(rows.nth(1).locator('.ck-slate-score')).toHaveText(String(g.homeTeam.score));
    const ot = g.gameStatusText.match(/(\d?OT)/)?.[1];
    await expect(card.getByTestId('slate-status')).toHaveText(ot ? `Final ${ot}` : 'Final');
    const win = g.awayTeam.score > g.homeTeam.score ? 0 : 1;
    await expect(rows.nth(win).locator('.ck-slate-score')).toHaveClass(/ck-score-win/);
  }
  // an upcoming day: the start time as in the League List, no score, no countdown anywhere
  await openSlate(page, '2026-11-20');
  const card = page.locator('.ck-slate-card').first();
  await expect(card.locator('.ck-slate-score').first()).toHaveText('');
  await expect(card.getByTestId('tipoff')).toHaveText(/^\d\d:\d\d( \(\+1\))?$|^TBD$/);
  expect(await page.locator('.ck-countdown').count()).toBe(0);
});

test('the day changes only with ← / → (keyboard and top bar), never by scrolling', async ({ page }) => {
  await openSlate(page, '2026-11-15');
  const all = await snapshot(page);
  const days = Object.keys(all).sort();
  const at = (d: string) => days.indexOf(d);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('day-title')).toHaveText('Monday, November 16, 2026');
  expect((await ids(page)).sort()).toEqual(all[days[at('2026-11-15') + 1]!]!.map((g) => g.gameId).sort());
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('day-title')).toHaveText('Saturday, November 14, 2026');
  await page.getByLabel('Next day').click();
  await expect(page.getByTestId('day-title')).toHaveText('Sunday, November 15, 2026');
  // wheel over the cards (the busiest day scrolls inside the view): the day stays
  const busiest = days.reduce((a, d) => (all[d]!.length > all[a]!.length ? d : a));
  await openSlate(page, busiest);
  const t = await title(page);
  const box = (await page.getByTestId('slate').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  expect(await title(page)).toBe(t);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -400);
  await page.waitForTimeout(300);
  expect(await title(page)).toBe(t);
  // the arrow keys don't change the day while typing in a field or using the date picker
  await page.getByTestId('date-pick').click();
  await page.keyboard.press('ArrowRight'); // moves the picker's focus, not the slate
  await page.keyboard.press('Escape');
  expect(await title(page)).toBe(t);
});

/** The fitted scale of the image on the page and what it means for the text. */
const fit = (s: { width: number; height: number }) => Math.min(PAGE.width / s.width, PAGE.height / s.height);

test('copy: 1, 5, 12 and 15 games — transparent around the cards, page-shaped, readable and sharp on a 1920 × 911 page', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-xl', 'once, at the whiteboard size');
  test.setTimeout(180_000);
  await page.setViewportSize(PAGE);
  await openSlate(page);
  const all = await snapshot(page);
  for (const n of [1, 5, 12, 15]) {
    const date = Object.keys(all).sort().find((d) => all[d]!.length === n);
    expect(date, `a day with ${n} games`).toBeTruthy();
    await openSlate(page, date);
    expect(await page.locator('[data-testid="slate"] .ck-slate-card').count()).toBe(n);
    const r = await copySlate(page, 'copy-view', `slate-${n}`);
    const s = fit(r.stage);
    console.log(`[slate] ${n} games (${date}): ${r.stage.cols} columns, ${r.stage.width}×${r.stage.height} CSS px × ${r.ratio} = ${r.px.width}×${r.px.height} px, fitted ×${s.toFixed(2)} (names ${(r.stage.nameFont * s).toFixed(1)} px), copied in ${r.ms} ms`);
    expect(r.stage.cards).toHaveLength(n);
    expect([r.px.width, r.px.height]).toEqual([Math.floor(r.stage.width * r.ratio), Math.floor(r.stage.height * r.ratio)]);
    // transparent outside the cards (alpha 0), opaque cards
    expect(r.px.outside).toBeGreaterThan(0);
    expect(r.px.outsideOpaque, 'pixels outside the cards that are not fully transparent').toBe(0);
    expect(r.px.insideClear, 'card pixels that are not opaque').toBe(0);
    // fits the page and reads there: names at least 12 px when the image is scaled to fit 1920 × 911
    expect(r.stage.nameFont * s, 'name size on the page').toBeGreaterThanOrEqual(12);
    // sharp from 1/4 up to 2× its fitted size: at 2× the image still has a pixel per screen pixel
    expect(r.ratio, 'pixels per CSS px ≥ 2 × the fitted scale').toBeGreaterThanOrEqual(2 * s);
    // page-shaped: no other column count would show the cards larger
    const [cw, ch] = [r.stage.cards[0]!.w, Math.max(...r.stage.cards.map((k) => k.h))];
    const gap = r.stage.cards.length > 1 ? r.stage.cards[1]!.x - r.stage.cards[0]!.x - cw : r.stage.cards[0]!.x * 2;
    for (let c = 1; c <= n; c++) {
      const rows = Math.ceil(n / c);
      expect(fit({ width: c * (cw + gap), height: rows * (ch + gap) }), `${c} columns would be no larger`).toBeLessThanOrEqual(s + 1e-6);
    }
  }
});

test('marquee in the Slate: 3 selected games copy by the same rule as the whole day', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-xl', 'once, at the whiteboard size');
  await page.setViewportSize(PAGE);
  await openSlate(page, '2026-11-15');
  const cards = page.locator('[data-testid="slate"] .ck-slate-card');
  const a = (await cards.nth(0).boundingBox())!;
  const b = (await cards.nth(1).boundingBox())!;
  const c = (await cards.nth(2).boundingBox())!;
  // a box over the first row (cards 1 and 2), then Shift + a box over the third card
  const drag = async (x0: number, y0: number, x1: number, y1: number) => {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + 10, y0 + 10, { steps: 3 });
    await page.mouse.move(x1, y1, { steps: 6 });
    await page.mouse.up();
  };
  await drag(a.x + 20, a.y + 20, b.x + 30, b.y + 30);
  await expect(page.getByTestId('selection-count')).toHaveText('2 games selected');
  await page.keyboard.down('Shift');
  await drag(c.x + 20, c.y + 20, c.x + 60, c.y + 50);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('selection-count')).toHaveText('3 games selected');
  const r = await copySlate(page, 'copy-selection', 'slate-selection-3');
  expect(r.stage.cards).toHaveLength(3);
  // the same rule as the whole day (largest cards on the page; Alex, 2026-10-30): no other column count shows them larger
  // (round 7's narrow cards came out 2 + 1; round 9's wide cards with their note boxes come out one column)
  const [cw, ch] = [r.stage.cards[0]!.w, Math.max(...r.stage.cards.map((k) => k.h))];
  const gap = r.stage.cards.length > 1 ? Math.max(r.stage.cards[1]!.x - r.stage.cards[0]!.x - cw, r.stage.cards[1]!.y - r.stage.cards[0]!.y - ch) : 0;
  for (let c = 1; c <= 3; c++) expect(fit({ width: c * (cw + gap), height: Math.ceil(3 / c) * (ch + gap) }), `${c} columns would be no larger`).toBeLessThanOrEqual(fit(r.stage) + 1e-6);
  console.log(`[slate] selection of 3: ${r.stage.cols} column(s)`);
  expect(r.px.outsideOpaque).toBe(0);
  console.log(`[slate] selection of 3: ${r.stage.width}×${r.stage.height} CSS px × ${r.ratio}, copied in ${r.ms} ms`);
});
