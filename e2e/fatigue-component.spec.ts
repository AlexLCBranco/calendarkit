// The Fatigue component (round 5) in a real browser at 1920 × 911 (Alex's window) and 1280 × 900: League List (both
// teams, mirrored around the matchup), Team List (team + opponent columns), week view (1 week, compact, under the line).
// Every component — empty or not — has the same width, so badges, icons and chips sit at one x down a list and nothing
// moves the logos; the night icons are in time order (left = earlier) in every column; a known HA 2nd night shows a
// faded house left of a solid plane. Runs once (desktop-xl), sizing the window itself.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');
const SIZES = [
  { width: 1920, height: 911 },
  { width: 1280, height: 900 },
];

/** Round 8: the desktop League List's zoom (LEAGUE_FONT_* ÷ 14) and its row height (LEAGUE_ROW_HEIGHT 40 × zoom): a one-line row. */
const listZoom = (size: { width: number }) => (size.width >= 1920 ? 1.3 : 1);
const listLine = (size: { width: number }) => 40 * listZoom(size) + 0.5;

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
          // grid areas b, n1, n2, c: their left x — for the chip its inner edge (round 6: it hugs the icons; its width varies)
          for (const s of f.children) {
            const area = getComputedStyle(s).gridArea.split(' ')[0];
            const sb = s.getBoundingClientRect();
            add(`fx${i}.${area}`, r2(area === 'c' && f.classList.contains('ck-fx-mirror') ? sb.right : sb.left));
          }
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
      // one line per row (round 8: LEAGUE_ROW_HEIGHT × zoom; before, 35 px — a few rows 36.5 px)
      expect(out.height!.every((h) => +h <= listLine(size)), `${date} heights ${out.height}`).toBe(true);
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
      for (const k of ['fx0.left', 'fx0.width', 'fx1.left', 'fx1.width', 'fx0.b', 'fx1.b', 'fx0.n1', 'fx1.n2', 'fx0.c', 'fx1.c', '.ck-logo-backing#0']) expect(out[k], `${team} ${k}: one value`).toHaveLength(1);
      // the opponent's logo: one x on played rows and one on unplayed rows (round 7, 2.4: no score slots without a score)
      for (const kind of [':has(.ck-score)', ':not(:has(.ck-score))']) {
        const r = await columns(page, `[data-testid="team-list"] .ck-card${kind}`, ['.ck-logo-backing']);
        expect(r.out['.ck-logo-backing#1'], `${team} ${kind} opponent logo: one value`).toHaveLength(1);
      }
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

// ---------------------------------------------------------------- round 6

/** Every B2B badge in the rows: its column (0 = away / the team's own, 1 = home / the opponent), the leg, the dot's side. */
const legs = (page: Page, rowSel: string) =>
  page.evaluate((rowSel) => {
    const out: { id: string; col: number; leg: string; side: string; inside: boolean; dotW: number; textOk: boolean }[] = [];
    for (const row of document.querySelectorAll<HTMLElement>(rowSel)) {
      [...row.querySelectorAll<HTMLElement>('[data-testid="fatigue"]')].forEach((fx, col) => {
        const b = fx.querySelector<HTMLElement>('.ck-fx-b2b');
        if (!b) return;
        const dot = b.querySelector('.ck-fx-leg')!.getBoundingClientRect();
        const text = [...b.childNodes].find((n) => n.nodeType === 3)!;
        const tr = document.createRange();
        tr.selectNodeContents(text);
        const t = tr.getBoundingClientRect();
        const box = b.getBoundingClientRect();
        out.push({
          id: row.dataset.gameId ?? '',
          col,
          leg: b.dataset.leg!,
          side: dot.right <= t.left + 0.5 ? 'left' : dot.left >= t.right - 0.5 ? 'right' : 'overlap',
          inside: dot.left >= box.left - 0.5 && dot.right <= box.right + 0.5 && t.left >= box.left - 0.5 && t.right <= box.right + 0.5,
          dotW: dot.width,
          textOk: text.textContent === 'B2B',
        });
      });
    }
    return out;
  }, rowSel);

for (const size of SIZES) {
  test(`leg dot ${size.width}×${size.height}: left of "B2B" on a 1st night, right of it on a 2nd, in both columns of every view; never flips`, async ({ page }) => {
    const seen = new Set<string>();
    const views: [string, string][] = [
      ['?view=league&layout=list&date=2026-10-24', '[data-testid="league-list"] .ck-card'],
      ['?view=league&layout=list&date=2026-11-02', '[data-testid="league-list"] .ck-card'],
      ['?view=league&layout=calendar&date=2026-11-01&weeks=1', '.ck-month-game'],
      ['?view=team&layout=list&team=LAL', '[data-testid="team-list"] .ck-card'],
    ];
    for (const [search, rowSel] of views) {
      await open(page, size, search);
      const all = await legs(page, rowSel);
      expect(all.length, search).toBeGreaterThan(5);
      for (const l of all) {
        expect(l.side, `${search} ${l.id} column ${l.col} leg ${l.leg}`).toBe(l.leg === '1' ? 'left' : 'right');
        expect(l.inside, `${search} ${l.id}: dot and text inside the badge`).toBe(true);
        expect(l.textOk).toBe(true);
        expect(l.dotW, 'a visible dot').toBeGreaterThanOrEqual(2);
        seen.add(`${search.includes('team=') ? 'team' : search.includes('calendar') ? 'week' : 'list'} col${l.col} leg${l.leg}`);
      }
    }
    // every combination occurred: both legs in both columns, in the League List, the week view and the Team List
    for (const v of ['list', 'week', 'team']) for (const c of [0, 1]) for (const g of [1, 2]) expect([...seen], `${v} col${c} leg${g}`).toContain(`${v} col${c} leg${g}`);
  });

  test(`yellow tricode boxes ${size.width}×${size.height}: none where the component is shown, kept where it is not; legend per view`, async ({ page }) => {
    const yellow = (sel: string) =>
      page.locator(sel).evaluateAll((els) => els.filter((e) => getComputedStyle(e).backgroundColor === 'rgb(245, 224, 66)' || (getComputedStyle(e).outlineStyle !== 'none' && getComputedStyle(e).outlineColor === 'rgb(245, 224, 66)')).length);
    const legend = page.getByTestId('fatigue-legend');
    const FX = /^B2B back-to-back, 1st night \(again tomorrow\) · B2B 2nd night \(played yesterday\) · +home +away, earlier night first, tonight solid · 3in4 · 2nd 3 games in 4 days, tonight the 2nd$/;
    const MARKS = '■ 2nd night · ▢ 1st night · ✈ changed cities · 3-in-4';
    // League List (a component for each team) and the 1-week view (the component row)
    for (const search of ['?view=league&layout=list&date=2026-10-24', '?view=league&layout=calendar&date=2026-11-01&weeks=1']) {
      await open(page, size, search);
      expect(await page.locator('.ck-fx-b2b').count(), search).toBeGreaterThan(3);
      expect(await page.locator('.ck-fm-n1, .ck-fm-n2').count(), search).toBe(0);
      expect(await yellow('.ck-fm'), `${search}: yellow on a tricode`).toBe(0);
      await expect(legend).toHaveText(FX);
      expect(await legend.evaluate((l) => l.scrollWidth <= l.clientWidth), 'legend not cut off').toBe(true);
      // round 8: in the narrower one-day list it takes two lines, none of it hidden (sub-pixel height: +1)
      if (search.includes('layout=list')) expect(await legend.evaluate((l) => l.scrollHeight <= l.clientHeight + 1), 'legend lines all shown').toBe(true);
    }
    // the 2-week view has no component: the boxes stay, with their legend
    await open(page, size, '?view=league&layout=calendar&date=2026-11-01&weeks=2');
    expect(await page.locator('.ck-fx').count()).toBe(0);
    expect(await page.locator('.ck-fm-n2').count()).toBeGreaterThan(3);
    expect(await page.locator('.ck-fm-n1').count()).toBeGreaterThan(3);
    expect(await yellow('.ck-fm-n2')).toBe(await page.locator('.ck-fm-n2').count());
    await expect(legend).toHaveText(MARKS);
    // the League List narrower than the component needs (tablets): boxes and their legend
    await page.setViewportSize({ width: 900, height: size.height });
    await page.goto('/?view=league&layout=list&date=2026-10-24');
    await page.waitForSelector('[data-game-id]');
    expect(await page.locator('.ck-fx').count()).toBe(0);
    expect(await page.locator('.ck-fm-n2, .ck-fm-n1').count()).toBeGreaterThan(3);
    await expect(legend).toHaveText(MARKS);
  });

  test(`merged 3-in-4 chip ${size.width}×${size.height}: the season's widest ("7in11 · 2nd", BOS Feb 4, 2027) fits its slot; rows one line; compact "7in11" fits two under a line`, async ({ page }) => {
    const fit = (rowSel: string) =>
      page.evaluate((rowSel) => {
        const out: { chip: string; inside: boolean; fxW: number }[] = [];
        for (const fx of document.querySelectorAll<HTMLElement>(`${rowSel} [data-testid="fatigue"]`)) {
          const c = fx.querySelector<HTMLElement>('.ck-fx-chip');
          if (!c) continue;
          const b = fx.getBoundingClientRect();
          const r = c.getBoundingClientRect();
          // inside the component (its last track), and the text not wider than the chip
          out.push({ chip: c.textContent!, inside: r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && c.scrollWidth <= Math.ceil(r.width) + 0.5, fxW: +b.width.toFixed(2) });
        }
        return out;
      }, rowSel);
    await open(page, size, '?view=league&layout=list&date=2027-02-04');
    let chips = await fit('[data-testid="league-list"] .ck-lday[data-day="2027-02-04"] .ck-card');
    expect(chips.map((c) => c.chip)).toContain('7in11 · 2nd');
    for (const c of chips) expect(c.inside, c.chip).toBe(true);
    const widths = await page.locator('.ck-lday[data-day="2027-02-04"] [data-testid="fatigue"]').evaluateAll((els) => [...new Set(els.map((e) => e.getBoundingClientRect().width.toFixed(2)))]);
    expect(widths, 'empty and full components: one width').toHaveLength(1);
    const heights = await page.locator('.ck-lday[data-day="2027-02-04"] .ck-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(Math.max(...heights), 'one line per row').toBeLessThanOrEqual(listLine(size));
    // the Team List: BOS's own column holds it
    await open(page, size, '?view=team&layout=list&team=BOS');
    chips = await fit('[data-testid="team-list"] .ck-card');
    expect(chips.map((c) => c.chip)).toContain('7in11 · 2nd');
    for (const c of chips) expect(c.inside, c.chip).toBe(true);
    expect(new Set(chips.map((c) => c.fxW)).size).toBe(1);
    // the week view: compact "7in11", both components under the line, apart; game text unchanged
    await open(page, size, '?view=league&layout=calendar&date=2027-02-04&weeks=1');
    chips = await fit('.ck-month-game');
    expect(chips.map((c) => c.chip)).toContain('7in11');
    for (const c of chips) expect(c.inside, c.chip).toBe(true);
    const row = await page.evaluate(() => {
      const bad: string[] = [];
      for (const l of document.querySelectorAll<HTMLElement>('.ck-month-game')) {
        const fx = [...l.querySelectorAll('.ck-mfx .ck-fx')].map((e) => e.getBoundingClientRect());
        if (fx.length !== 2) continue;
        const line = l.querySelector('.ck-mline')!.getBoundingClientRect();
        if (fx[0]!.right > fx[1]!.left - 4) bad.push(`${l.dataset.gameId} too close`);
        if (fx[0]!.left < line.left - 0.5 || fx[1]!.right > line.right + 0.5) bad.push(`${l.dataset.gameId} outside the line`);
      }
      return { bad, tri: getComputedStyle(document.querySelector('.ck-mtri-text')!).fontSize, scale: document.querySelector<HTMLElement>('.ck-week-view')!.dataset.scale };
    });
    expect(row.bad).toEqual([]);
    // game text at the size round 5 left it: 1-week scale 1.1 at 1920 × 911, 1 at 1280 × 900
    expect(row.scale).toBe(size.width === 1920 ? '1.1' : '1');
    expect(row.tri).toBe(size.width === 1920 ? '12.1px' : '11px');
  });
}
