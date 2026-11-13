// The Slate's tight cards at 1920 × 950 and 1600 × 1000. Notes hidden: as many columns as fit, filled
// left to right then down in tip-off order, the busiest night with no scrolling; cards ≥ 30 % shorter than the old
// 117 px; every row one line with nothing overlapping, also in the worst case written into a real card ("Timberwolves"
// / "Trail Blazers" with B2B + night icons + "7in11"); the strip never taller than the two team rows on any night of
// the season. Notes shown: two columns, the note box taking the rest of the card.

import { expect, test, type Page } from './fixtures';
import { setNotes } from './nav';

const NOW = new Date('2026-11-15T15:00:00Z');
const SIZES = [
  { width: 1920, height: 950 },
  { width: 1600, height: 1000 },
];
const OLD_CARD = 117; // the old card (head line + two rows)

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'desktop sizes set here'));

/** The served snapshot's game counts per ET date (independent of the app). */
const counts = (page: Page) =>
  page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const out: Record<string, number> = {};
    for (const d of raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateEst: string }[] }[])
      for (const g of d.games) if (/^00[2456]/.test(g.gameId)) out[g.gameDateEst.slice(0, 10)] = (out[g.gameDateEst.slice(0, 10)] ?? 0) + 1;
    return out;
  });

async function openSlate(page: Page, date: string, hide: boolean) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`?view=league&layout=slate&date=${date}`);
  await expect(page.locator('[data-testid="slate"] .ck-slate-card').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await setNotes(page, !hide);
}

/** Every card's geometry and its rows' parts, read in one go. */
const cardsOf = (page: Page) =>
  page.locator('[data-testid="slate"]').evaluate((root) => {
    const r = (e: Element) => e.getBoundingClientRect();
    return [...root.querySelectorAll<HTMLElement>('.ck-slate-card')].map((c) => {
      const box = r(c);
      const strip = c.querySelector('.ck-slate-strip')!;
      const teams = c.querySelector('.ck-slate-teams')!;
      const stripBottom = Math.max(...[...strip.querySelectorAll('*')].map((e) => r(e).bottom), r(strip.firstElementChild!).bottom);
      const rows = [...c.querySelectorAll('.ck-slate-row')].map((row) => {
        const parts = [...row.children].map((e) => ({ cls: e.className.split(' ')[0]!, left: r(e).left, right: r(e).right, top: r(e).top, bottom: r(e).bottom, sw: (e as HTMLElement).scrollWidth, cw: (e as HTMLElement).clientWidth }));
        return { height: r(row).height, parts };
      });
      return { id: c.dataset.gameId!, x: box.left, y: box.top, w: box.width, h: box.height, sw: c.scrollWidth, cw: c.clientWidth, sh: c.scrollHeight, ch: c.clientHeight, stripRight: r(strip).right, teamsLeft: r(teams).left, stripOver: stripBottom - r(teams).bottom, rows };
    });
  });

/** Rows are one line (no part wraps or is cut), parts don't overlap and stay inside the card. */
function checkRows(cards: Awaited<ReturnType<typeof cardsOf>>) {
  for (const c of cards) {
    expect(c.sw, `${c.id} card overflows sideways`).toBeLessThanOrEqual(c.cw + 1);
    expect(c.sh, `${c.id} card overflows down`).toBeLessThanOrEqual(c.ch + 1);
    expect(c.stripRight, `${c.id} strip reaches the rows`).toBeLessThanOrEqual(c.teamsLeft);
    for (const row of c.rows) {
      expect(row.height, `${c.id} row taller than its logo`).toBeLessThanOrEqual(29);
      for (let i = 0; i < row.parts.length; i++) {
        const p = row.parts[i]!;
        expect(p.sw, `${c.id} ${p.cls} cut`).toBeLessThanOrEqual(p.cw + 1);
        expect(p.right, `${c.id} ${p.cls} outside the card`).toBeLessThanOrEqual(c.x + c.w);
        if (i) expect(p.left, `${c.id} ${p.cls} overlaps ${row.parts[i - 1]!.cls}`).toBeGreaterThanOrEqual(row.parts[i - 1]!.right - 0.5);
      }
    }
  }
}

for (const size of SIZES) {
  test.describe(`${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test('notes hidden: as many columns as fit, left to right then down in tip-off order; the busiest night without scrolling; cards ≥ 30 % shorter', async ({ page }) => {
      await openSlate(page, '2026-11-02', true);
      const nights = await counts(page);
      const busiest = Object.entries(nights).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
      expect(busiest[1]).toBeGreaterThanOrEqual(14);
      await openSlate(page, busiest[0], true);
      const cards = await cardsOf(page);
      expect(cards).toHaveLength(busiest[1]);
      const width = await page.locator('[data-testid="slate"]').evaluate((e) => e.getBoundingClientRect().width);
      const cols = Number(await page.locator('.ck-slate-grid').getAttribute('data-cols'));
      const w = cards[0]!.w;
      // the most columns of these cards that fit
      expect(cols * w + (cols - 1) * 12).toBeLessThanOrEqual(width + 0.5);
      expect((cols + 1) * w + cols * 12).toBeGreaterThan(width);
      expect(cols).toBeGreaterThanOrEqual(3);
      // row-major: card i at column i % cols, row ⌊i / cols⌋ (DOM order = tip-off order, checked in slate.spec)
      const xs = [...new Set(cards.map((c) => Math.round(c.x)))].sort((a, b) => a - b);
      const ys = [...new Set(cards.map((c) => Math.round(c.y)))].sort((a, b) => a - b);
      cards.forEach((c, i) => {
        expect(Math.round(c.x), `card ${i} column`).toBe(xs[i % cols]);
        expect(Math.round(c.y), `card ${i} row`).toBe(ys[Math.floor(i / cols)]);
      });
      // shorter cards, nothing to scroll
      for (const c of cards) expect(c.h).toBeLessThanOrEqual(OLD_CARD * 0.7);
      const scroll = await page.locator('.ck-slate-scroll').evaluate((e) => e.scrollHeight - e.clientHeight);
      expect(scroll, 'the Slate scrolls').toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
      checkRows(cards);
      console.log(`[slate-tight] ${size.width}×${size.height}: ${busiest[1]} games (${busiest[0]}), ${cols} columns of ${w} × ${cards[0]!.h} px, slate ${width} px`);
    });

    test('notes shown: two columns while each note box keeps 300 px (1920), else one (1600, as before this round); the note box takes the rest of the card', async ({ page }) => {
      await openSlate(page, '2026-11-02', false);
      const cards = await cardsOf(page);
      expect(await page.locator('.ck-slate-grid').getAttribute('data-cols')).toBe(size.width === 1920 ? '2' : '1');
      checkRows(cards);
      const fill = await page.locator('.ck-slate-card').first().evaluate((c) => {
        const card = c.getBoundingClientRect();
        const note = c.querySelector('.ck-gnote')!.getBoundingClientRect();
        return { right: card.right - note.right, noteW: note.width };
      });
      expect(fill.right).toBeLessThanOrEqual(16); // padding + border only
      expect(fill.noteW).toBeGreaterThanOrEqual(300);
    });

    test('worst case written into real cards: "Timberwolves" / "Trail Blazers" with B2B + night icons + "7in11", both rows; one line, no overlap', async ({ page }) => {
      await openSlate(page, '2026-11-02', true);
      // the night's fullest Fatigue component is copied into every row of the night and the longest names written in
      const done = await page.locator('[data-testid="slate"]').evaluate((root) => {
        const comps = [...root.querySelectorAll<HTMLElement>('[data-testid="fatigue"]')];
        const full = comps.find((c) => c.querySelector('.ck-fx-b2b') && c.querySelector('.ck-fx-chip'));
        if (!full) return 'no full component';
        const chip = full.querySelector('.ck-fx-chip')!;
        chip.textContent = '7in11';
        root.querySelectorAll('.ck-slate-row').forEach((row, i) => {
          row.querySelector('.ck-slate-name')!.textContent = i % 2 ? 'Trail Blazers' : 'Timberwolves';
          row.querySelector('[data-testid="fatigue"]')!.replaceWith(full.cloneNode(true));
          row.querySelector('.ck-slate-rec')!.textContent = '41-40';
          row.querySelector('.ck-slate-streak')!.textContent = 'W12';
          row.querySelector('.ck-slate-score')!.textContent = '188';
        });
        return 'ok';
      });
      expect(done).toBe('ok');
      checkRows(await cardsOf(page));
    });

    test('the strip is never taller than the two team rows, on every day of the season', async ({ page }) => {
      test.setTimeout(120_000);
      await openSlate(page, '2026-11-02', true);
      const nights = Object.keys(await counts(page)).sort();
      await openSlate(page, nights[0]!, true);
      // every day in one go in the page: → (the Slate's key), a frame, measure (a Playwright round trip per day took > 2 min)
      const r = await page.evaluate(async () => {
        const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const bad: string[] = [];
        const seen = new Set<string>();
        let worst = -Infinity;
        for (let prev = '', i = 0; i < 400; i++) {
          const title = document.querySelector('[data-testid="day-title"]')?.textContent ?? '';
          if (title === prev) break;
          prev = title;
          for (const c of document.querySelectorAll<HTMLElement>('[data-testid="slate"] .ck-slate-card')) {
            seen.add(c.dataset.gameId!);
            const strip = c.querySelector('.ck-slate-strip')!;
            const bottom = Math.max(...[...strip.querySelectorAll('*')].map((e) => e.getBoundingClientRect().bottom));
            const over = bottom - c.querySelector('.ck-slate-teams')!.getBoundingClientRect().bottom;
            worst = Math.max(worst, over);
            if (over > 0.5) bad.push(`${title} ${c.dataset.gameId}: ${over.toFixed(1)} px below the rows`);
            if (strip.scrollWidth > strip.clientWidth + 0.5) bad.push(`${title} ${c.dataset.gameId}: strip overflows sideways`);
          }
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          await frame();
        }
        return { bad, games: seen.size, worst };
      });
      expect(r.bad).toEqual([]);
      const total = Object.values(await counts(page)).reduce((a, b) => a + b, 0);
      expect(r.games).toBe(total);
      console.log(`[slate-tight] ${size.width}: ${r.games} cards, the fullest strip ends ${(-r.worst).toFixed(1)} px above the rows' bottom`);
    });
  });
}
