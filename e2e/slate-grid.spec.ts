// CK-7: the Slate as a tight grid — cards touch, one 1 px divider line between them (shared borders), all corners
// square, the outer edge too; a card and its note box are one cell; the national-TV card's teal highlight is an inset
// outline inside its cell (the dividers stay grey, its neighbours untouched). Nothing a card shows changes: every
// card's parts (class, text, size) are compared with the same cards drawn by the last build before CK-7 (BEFORE, built
// and served in the same run by refbuild.ts, so on the same machine's fonts) — same parts in the same order with the
// same text, none smaller, none outside its card. The copy: e2e/slate.spec.ts and the touch check here.
import type { Server } from 'node:http';
import { expect, test, type Page } from './fixtures';
import { APP } from './app';
import { setNotes } from './nav';
import { serveRef } from './refbuild';
import { copySlate } from './slatecopy';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'desktop sizes set here'));

const NOW = new Date('2026-11-15T15:00:00Z');
const DAYS = ['2026-11-06', '2026-11-14']; // TV games, streaks, series chips, B2Bs; a Cup group night
const BEFORE = '96146441a1f3baf0f40e0285420bbb96e4bdc67d'; // v1.73.0: the Slate with gaps

let ref: { base: string; server: Server } | undefined;
test.afterAll(() => ref?.server.close());

async function open(page: Page, date: string, notes: boolean, base?: string) {
  await page.route('**/api/odds**', (r) => r.fulfill({ status: 404, body: '' })); // no odds: the same content every run
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1920, height: 950 });
  await page.clock.setFixedTime(NOW);
  await page.goto(`${base ? new URL(APP, base).href : ''}?view=league&layout=slate&date=${date}`);
  await expect(page.locator('[data-testid="slate"] .ck-slate-card').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await setNotes(page, notes);
}

/** Every element a card shows (the note box's inside left out: its width is the room left), in order. */
const partsOf = (page: Page) =>
  page.locator('[data-testid="slate"]').evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>('.ck-slate-card')].map((c) => {
      const box = c.getBoundingClientRect();
      const out: string[] = [];
      const parts = [...c.querySelectorAll<HTMLElement>('*')]
        .filter((e) => !e.closest('.ck-gnote') || e.classList.contains('ck-gnote'))
        .map((e) => {
          const r = e.getBoundingClientRect();
          const cls = `${e.tagName.toLowerCase()}.${(e.getAttribute('class') ?? '').trim().replace(/\s+/g, '.')}`;
          if (r.width && (r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5)) out.push(cls);
          return [cls, e.children.length ? '' : (e.textContent ?? '').trim(), Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10] as [string, string, number, number];
        });
      return { id: c.dataset.gameId!, parts, out };
    }),
  );

/**
 * Parts in a fixed order, with what changed on purpose since BEFORE left out: CK-12 put the score right after the name
 * (one wrapper, the score's place in the order), CK-8 marks some series chips (a class), CK-13 shortened two names, CK-15 put the game button in the away row's empty "@" cell.
 */
type Part = [string, string, number, number];
const same = (parts: Part[]) =>
  parts
    .filter((p) => p[0] !== 'span.ck-slate-namecell' && p[0] !== 'button.ck-game-menu')
    // the record and the Cup label became links (CK-28, CK-26): the same parts, as an <a>
    .map((p): Part => [p[0] === 'a.ck-slate-rec.ck-tlink' ? 'span.ck-slate-rec' : p[0] === 'a.ck-tag.ck-cup.ck-cuplink' ? 'span.ck-tag.ck-cup' : p[0], p[1], p[2], p[3]])
    .map((p): Part => [p[0].replace('.ck-series-rematch', ''), p[1] === 'Timberwolves' ? 'Wolves' : p[1] === 'Trail Blazers' ? 'Blazers' : p[1], p[2], p[3]])
    .sort((x, y) => (x[0] + x[1]).localeCompare(y[0] + y[1]) || x[2] - y[2] || x[3] - y[3]);

test('every part of every card is still there, no smaller, inside its card (notes hidden and shown)', async ({ page }) => {
  test.setTimeout(240_000); // the first run builds BEFORE
  ref ??= await serveRef(BEFORE);
  for (const date of DAYS)
    for (const notes of [false, true]) {
      const key = `${date} notes ${notes ? 'shown' : 'hidden'}`;
      await open(page, date, notes, ref.base);
      const before = await partsOf(page);
      await open(page, date, notes);
      const cards = await partsOf(page);
      expect(before.length, key).toBeGreaterThan(0);
      expect(cards.map((c) => c.id), key).toEqual(before.map((c) => c.id));
      for (const [i, now] of cards.entries()) {
        const was = { ...before[i]!, parts: same(before[i]!.parts) };
        const c = { ...now, parts: same(now.parts) };
        const where = `${key}, ${c.id}`;
        expect(c.out, `${where}: parts outside the card`).toEqual([]);
        expect(c.parts.map((p) => [p[0], p[1]]), `${where}: parts and text`).toEqual(was.parts.map((p) => [p[0], p[1]]));
        for (const [j, p] of c.parts.entries()) {
          const [, , w, h] = was.parts[j]!;
          // the name's and the score's boxes are their text since CK-12 (the score follows the name), no longer whole tracks
          if (!/^a.ck-slate-(name|score)/.test(p[0])) expect(p[2], `${where}: ${p[0]} "${p[1]}" width`).toBeGreaterThanOrEqual(w - 0.5);
          expect(p[3], `${where}: ${p[0]} "${p[1]}" height`).toBeGreaterThanOrEqual(h - 0.5);
        }
      }
    }
});

/** The cards' boxes, borders and corners. */
const gridOf = (page: Page, sel: string) =>
  page.locator(sel).evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>('.ck-slate-card')].map((c) => {
      const r = c.getBoundingClientRect();
      const s = getComputedStyle(c);
      const note = c.querySelector<HTMLElement>('.ck-gnote');
      return {
        id: c.dataset.gameId!,
        x: r.left,
        y: r.top,
        right: r.right,
        bottom: r.bottom,
        border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth, s.borderTopColor, s.borderLeftColor],
        radius: [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius, note ? getComputedStyle(note).borderTopLeftRadius : '0px'],
        noteInside: note ? note.getBoundingClientRect().right <= r.right && note.getBoundingClientRect().bottom <= r.bottom : true,
        tv: c.classList.contains('ck-slate-tv'),
        shadow: s.boxShadow,
      };
    }),
  );

/** Cards side by side share their border (the next starts on the last pixel of the one before), rows likewise. */
function expectTouching(cards: Awaited<ReturnType<typeof gridOf>>, label: string) {
  const line = cards[0]!.border[4];
  for (const c of cards) {
    expect(c.border.slice(0, 4), `${label} ${c.id}: 1 px border all round`).toEqual(['1px', '1px', '1px', '1px']);
    expect([c.border[4], c.border[5]], `${label} ${c.id}: the divider colour (no teal border)`).toEqual([line, line]);
    expect(c.radius, `${label} ${c.id}: square corners, the note box too`).toEqual(['0px', '0px', '0px', '0px', '0px']);
    expect(c.noteInside, `${label} ${c.id}: the note box inside its cell`).toBe(true);
  }
  const rows = [...new Set(cards.map((c) => Math.round(c.y)))];
  let pairs = 0;
  for (const [i, c] of cards.entries()) {
    const right = cards.find((d) => Math.abs(d.y - c.y) < 0.5 && d.x > c.x);
    if (right && cards.indexOf(right) === i + 1) {
      expect(right.x, `${label}: ${right.id} starts on ${c.id}'s right border`).toBeCloseTo(c.right - 1, 1);
      pairs++;
    }
    const below = cards.find((d) => Math.abs(d.x - c.x) < 0.5 && d.y > c.y + 1);
    if (below && rows.indexOf(Math.round(below.y)) === rows.indexOf(Math.round(c.y)) + 1) {
      expect(below.y, `${label}: ${below.id} starts on ${c.id}'s bottom border`).toBeCloseTo(c.bottom - 1, 1);
      pairs++;
    }
  }
  expect(pairs, `${label}: neighbours checked`).toBeGreaterThan(0);
}

test('/calendar: cards touch, one 1 px line between them, square corners; the TV card keeps an inset teal outline', async ({ page }) => {
  for (const notes of [false, true]) {
    await open(page, DAYS[0]!, notes);
    const cards = await gridOf(page, '[data-testid="slate"]');
    expectTouching(cards, `notes ${notes ? 'shown' : 'hidden'}`);
    const tv = cards.filter((c) => c.tv);
    expect(tv.length).toBeGreaterThan(0);
    for (const c of tv) expect(c.shadow, `${c.id}: the TV highlight, inset`).toMatch(/rgb\(63, 182, 139\) 0px 0px 0px 2px inset|inset 0px 0px 0px 2px rgb\(63, 182, 139\)/);
    // the highlight's pixels: teal just inside the TV card, the divider line itself grey
    const c = tv[0]!;
    const px = await page.evaluate(async ({ x, y }) => ({ x, y }), { x: c.x, y: (c.y + c.bottom) / 2 });
    const shot = await page.screenshot({ clip: { x: px.x, y: px.y, width: 4, height: 1 } });
    const rgb = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const cv = document.createElement('canvas');
      [cv.width, cv.height] = [img.width, img.height];
      const g = cv.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return [0, 1, 2].map((i) => [...g.getImageData(Math.floor((i * img.width) / 4), 0, 1, 1).data.slice(0, 3)]);
    }, shot.toString('base64'));
    const teal = (p: number[]) => p[1]! > 140 && p[1]! > p[0]! + 60;
    expect(teal(rgb[0]!), `the divider at the TV card's edge is not teal: ${rgb[0]}`).toBe(false);
    expect(teal(rgb[1]!) || teal(rgb[2]!), `teal just inside the TV card: ${rgb[1]} ${rgb[2]}`).toBe(true);
  }
});

test('copy: the cards touch in the image too, one 1 px line between them', async ({ page }) => {
  await open(page, DAYS[0]!, true);
  const r = await copySlate(page, 'copy-view', 'slate-grid');
  const k = r.stage.cards;
  expect(k.length).toBeGreaterThan(2);
  let pairs = 0;
  for (const [i, c] of k.entries()) {
    const right = k[i + 1];
    if (right && Math.abs(right.y - c.y) < 0.5) {
      expect(right.x, `${right.id} on ${c.id}'s right border`).toBeCloseTo(c.x + c.w - 1, 1);
      pairs++;
    }
    const below = k.find((d) => Math.abs(d.x - c.x) < 0.5 && d.y > c.y + 1);
    if (below) {
      expect(below.y, `${below.id} on ${c.id}'s bottom border`).toBeCloseTo(c.y + c.h - 1, 0);
      pairs++;
    }
  }
  expect(pairs).toBeGreaterThan(0);
  expect(r.px.outsideOpaque, 'still transparent around the cards').toBe(0);
});
