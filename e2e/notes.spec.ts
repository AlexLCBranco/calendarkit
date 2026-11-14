// The Slate's wide layout and its note boxes in a real browser (desktop widths): from the left edge, 1 or
// 2 columns by the note box's width; notes saved in localStorage (`ck:notes:v1`, keyed by gameId) and back after a
// reload; three slots, the shown one saved, never switched by the clock; Switch all; Hide all (not remembered); two tabs
// in sync without losing the typing tab's caret; the box under the team rows, capped at 5 lines with its own scrollbar,
// the wheel scrolling the page until the note is focused; the space label in the card's corner; export / import; copies with the boxes; and
// typing touching no other card, keystroke → frame timed.

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { setNotes } from './nav';
import { copySlate, readPng } from './slatecopy';

const NOW = new Date('2026-11-15T15:00:00Z');
const KEY = 'ck:notes:v1';
const PAGE = { width: 1920, height: 911 };

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only: the Slate'));

async function openSlate(page: Page, date = '2026-11-15', now = NOW) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.setFixedTime(now);
  await page.goto(`/calendar/?view=league&layout=slate&date=${date}`);
  await expect(page.getByTestId('slate')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await setNotes(page, true);
}
const cards = (page: Page) => page.locator('[data-testid="slate"] .ck-slate-card');
const card = (page: Page, i: number) => cards(page).nth(i);
const stored = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), KEY);
/** Waits until the debounced save has written. */
const saved = (page: Page, id: string, want: Record<string, string>) => expect.poll(async () => (await stored(page))[id]).toMatchObject(want);

test('layout: from the left edge, two columns at 1920 and one at 1280; the info block at its round 14 width; the note box under the team rows across the whole card', async ({ page }, info) => {
  await openSlate(page);
  const r = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('.ck-slate-grid')!;
    const root = document.querySelector('.ck-root')!.getBoundingClientRect();
    const cs = [...document.querySelectorAll<HTMLElement>('.ck-slate-card')].map((c) => {
      const cr = c.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(c).paddingLeft) + parseFloat(getComputedStyle(c).borderLeftWidth);
      const n = c.querySelector('.ck-gnote')!.getBoundingClientRect();
      const teams = c.querySelector('.ck-slate-teams')!.getBoundingClientRect();
      return { x: Math.round(cr.left), w: cr.width, inner: cr.width - 2 * pad, noteW: n.width, noteLeft: n.left - cr.left - pad, noteTop: n.top, teamsBottom: teams.bottom, info: c.querySelector('.ck-slate-info')!.getBoundingClientRect().width };
    });
    return { cols: new Set(cs.map((c) => c.x)).size, left: grid.getBoundingClientRect().left - root.left, right: root.right - grid.getBoundingClientRect().right, cs, vw: innerWidth };
  });
  console.log(`[notes] ${info.project.name} (${r.vw} px): ${r.cols} column(s), card ${r.cs[0]!.w} px, info ${r.cs[0]!.info} px, note box ${r.cs[0]!.noteW} px`);
  expect(r.cols).toBe(info.project.name === 'desktop-xl' ? 2 : 1);
  expect(Math.abs(r.left)).toBeLessThan(1);
  expect(r.right).toBeLessThan(1);
  for (const c of r.cs) {
    expect(c.info).toBe(491); // SLATE_INFO_WIDTH (strip 68 + 6 + the row's fixed tracks)
    // across the card: the card's full content width (not just under the info column), from its left edge
    expect(Math.abs(c.noteW - c.inner)).toBeLessThan(1);
    expect(c.noteW).toBeGreaterThan(c.info + 100);
    expect(Math.abs(c.noteLeft)).toBeLessThan(1);
    // under the team rows
    expect(c.noteTop).toBeGreaterThanOrEqual(c.teamsBottom);
  }
});

test('the space label and ⇄: in the card\'s top-right corner beside the odds, outside the note box, small and visible', async ({ page }) => {
  await openSlate(page);
  const r = await cards(page).evaluateAll((cs) =>
    cs.map((c) => {
      const cr = c.getBoundingClientRect();
      const head = c.querySelector('.ck-gnote-head')!.getBoundingClientRect();
      const slot = c.querySelector('[data-testid="note-slot"]')!;
      const sw = c.querySelector('[data-testid="note-switch"]')!.getBoundingClientRect();
      const odds = c.querySelector('.ck-slate-row[data-side="away"] .ck-slate-odds')!.getBoundingClientRect();
      const away = c.querySelector('.ck-slate-row[data-side="away"]')!.getBoundingClientRect();
      const note = c.querySelector('.ck-gnote')!;
      const cs = getComputedStyle(slot);
      return { right: cr.right - head.right, top: head.top - cr.top, headLeft: head.left, oddsRight: odds.right, headBottom: head.bottom, awayBottom: away.bottom, noteTop: note.getBoundingClientRect().top, inNote: note.contains(slot), font: parseFloat(cs.fontSize), visible: cs.visibility === 'visible' && cs.opacity === '1', sw: [sw.width, sw.height] };
    }),
  );
  for (const c of r) {
    expect(c.inNote).toBe(false);
    expect(c.right).toBeGreaterThanOrEqual(0);
    expect(c.right).toBeLessThan(12); // the card's padding
    expect(c.top).toBeGreaterThanOrEqual(0);
    expect(c.top).toBeLessThan(12);
    expect(c.headLeft).toBeGreaterThan(c.oddsRight); // right of the odds column, never over it
    expect(c.headBottom).toBeLessThanOrEqual(c.awayBottom + 1); // in the first row's band
    expect(c.headBottom).toBeLessThan(c.noteTop);
    expect(c.font).toBeGreaterThanOrEqual(10);
    expect(c.font).toBeLessThanOrEqual(12);
    expect(c.visible).toBe(true);
    expect(c.sw[0]).toBeGreaterThanOrEqual(14);
    expect(c.sw[1]).toBeGreaterThanOrEqual(14);
  }
});

test('type → reload → back, by gameId (also on the same game reached by another day and back); new game on PRE', async ({ page }) => {
  await openSlate(page);
  const id = (await card(page, 1).getAttribute('data-game-id'))!;
  await card(page, 1).getByTestId('note-text').click();
  await page.keyboard.type('Injury report: questionable');
  await saved(page, id, { pre: 'Injury report: questionable', shown: 'pre' });
  await page.reload();
  await expect(page.getByTestId('slate')).toBeVisible();
  await setNotes(page, true);
  await expect(cards(page).first()).toBeVisible();
  await expect(page.locator(`.ck-slate-card[data-game-id="${id}"] [data-testid="note-text"]`)).toHaveValue('Injury report: questionable');
  await page.getByLabel('Next day').click();
  await expect(page.locator(`.ck-slate-card[data-game-id="${id}"]`)).toHaveCount(0);
  await page.getByLabel('Previous day').click();
  await expect(page.locator(`.ck-slate-card[data-game-id="${id}"] [data-testid="note-text"]`)).toHaveValue('Injury report: questionable');
  // keyed by gameId only
  expect(Object.keys(await stored(page))).toEqual([id]);
  await expect(card(page, 0).getByTestId('note-slot')).toHaveText('PRE');
});

test('three slots: all texts kept through switching; the slot left on show comes back; the clock never switches it; Switch all; Hide all resets', async ({ page }) => {
  await openSlate(page);
  const c = card(page, 0);
  const id = (await c.getAttribute('data-game-id'))!;
  const t = c.getByTestId('note-text');
  await t.click();
  await page.keyboard.type('pre text');
  await c.getByTestId('note-switch').click();
  await expect(c.getByTestId('note-slot')).toHaveText('LIVE');
  await t.click();
  await page.keyboard.type('live text');
  await c.getByTestId('note-switch').click();
  await t.click();
  await page.keyboard.type('post text');
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    await c.getByTestId('note-switch').click();
    seen.push(`${await c.getByTestId('note-slot').textContent()}:${await t.inputValue()}`);
  }
  expect(seen).toEqual(['PRE:pre text', 'LIVE:live text', 'POST:post text', 'PRE:pre text', 'LIVE:live text', 'POST:post text']);
  await saved(page, id, { pre: 'pre text', live: 'live text', post: 'post text', shown: 'post' });
  await page.reload();
  await expect(page.getByTestId('slate')).toBeVisible();
  await setNotes(page, true);
  await expect(card(page, 0).getByTestId('note-slot')).toHaveText('POST');
  await expect(card(page, 0).getByTestId('note-text')).toHaveValue('post text');
  // the clock past tip-off and past "over": still POST (nothing switches by itself)
  const tip = await page.evaluate(async (id) => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    return Date.parse((raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateTimeUTC: string }[] }[]).flatMap((d) => d.games).find((g) => g.gameId === id)!.gameDateTimeUTC);
  }, id);
  for (const at of [tip + 60_000, tip + 4 * 3_600_000]) {
    await openSlate(page, '2026-11-15', new Date(at));
    await expect(page.locator(`.ck-slate-card[data-game-id="${id}"] [data-testid="note-slot"]`)).toHaveText('POST');
    await expect(card(page, 1).getByTestId('note-slot')).toHaveText('PRE');
  }
  // Switch all → LIVE, kept after a reload
  await openSlate(page);
  await page.getByTestId('notes-all-live').click();
  const n = await cards(page).count();
  await expect(page.locator('[data-testid="note-slot"]', { hasText: 'LIVE' })).toHaveCount(n);
  await page.reload();
  // a reload: notes hidden again (on at every load, never stored); the slots kept
  await expect(page.getByTestId('slate')).toBeVisible();
  await expect(page.getByTestId('notes-hide')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('note')).toHaveCount(0);
  await setNotes(page, true);
  await expect(page.locator('[data-testid="note-slot"]', { hasText: 'LIVE' })).toHaveCount(n);
  // Hide all notes: info only; a reload hides them again
  await page.getByTestId('notes-hide').click();
  await expect(page.getByTestId('note')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('slate')).toBeVisible();
  await expect(page.getByTestId('note')).toHaveCount(0);
  await setNotes(page, true);
  await expect(page.getByTestId('note')).toHaveCount(n);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([KEY]);
});

test('two tabs: typing and switching in one shows up in the other; the typing tab keeps its text and caret', async ({ page, context }) => {
  await openSlate(page);
  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto('/calendar/?view=league&layout=slate&date=2026-11-15');
  await expect(other.getByTestId('slate')).toBeVisible();
  await setNotes(other, true);
  const id = (await card(page, 0).getAttribute('data-game-id'))!;
  const box = page.locator(`.ck-slate-card[data-game-id="${id}"] [data-testid="note-text"]`);
  const there = other.locator(`.ck-slate-card[data-game-id="${id}"] [data-testid="note-text"]`);
  await box.click();
  await page.keyboard.type('first line');
  await expect(there).toHaveValue('first line', { timeout: 5000 });
  // the other tab edits another game meanwhile; this tab keeps typing in the middle of its text
  const id2 = (await card(page, 1).getAttribute('data-game-id'))!;
  await other.locator(`.ck-slate-card[data-game-id="${id2}"] [data-testid="note-text"]`).click();
  await other.keyboard.type('from the other tab');
  await box.evaluate((t: HTMLTextAreaElement) => t.setSelectionRange(5, 5));
  await page.keyboard.type('_X');
  await expect(page.locator(`.ck-slate-card[data-game-id="${id2}"] [data-testid="note-text"]`)).toHaveValue('from the other tab', { timeout: 5000 });
  await page.keyboard.type('Y');
  expect(await box.inputValue()).toBe('first_XY line');
  expect(await box.evaluate((t: HTMLTextAreaElement) => [t.selectionStart, document.activeElement === t])).toEqual([8, true]);
  await expect(there).toHaveValue('first_XY line', { timeout: 5000 });
  // a switch travels too
  await page.locator(`.ck-slate-card[data-game-id="${id}"] [data-testid="note-switch"]`).click();
  await expect(other.locator(`.ck-slate-card[data-game-id="${id}"] [data-testid="note-slot"]`)).toHaveText('LIVE');
  await other.close();
});

test('the wheel over a note: scrolls the page until the note is clicked into; then the note; after leaving it, the page again', async ({ page }) => {
  // a 15-game night, so the Slate scrolls
  await openSlate(page);
  const busy = await page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const n = new Map<string, number>();
    for (const g of (raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateEst: string }[] }[]).flatMap((d) => d.games)) if (/^00[2456]/.test(g.gameId)) n.set(g.gameDateEst.slice(0, 10), (n.get(g.gameDateEst.slice(0, 10)) ?? 0) + 1);
    return [...n].find(([, c]) => c === 15)![0];
  });
  await openSlate(page, busy);
  const t = card(page, 0).getByTestId('note-text');
  await t.fill(Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join('\n'));
  await t.evaluate((e) => {
    e.blur();
    e.scrollTop = 0;
  });
  const scroll = page.locator('.ck-slate-scroll');
  const pageTop = () => scroll.evaluate((e) => e.scrollTop);
  const noteTop = () => t.evaluate((e) => e.scrollTop);
  expect(await scroll.evaluate((e) => e.scrollHeight > e.clientHeight + 200)).toBe(true);
  expect(await pageTop()).toBe(0);
  const hover = async () => {
    const b = (await t.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  };
  // hovering, not focused: the page moves, the note doesn't
  await hover();
  await page.mouse.wheel(0, 60);
  await expect.poll(pageTop).toBeGreaterThan(0);
  expect(await noteTop()).toBe(0);
  // clicked into: the note scrolls, the page stays
  await scroll.evaluate((e) => (e.scrollTop = 0));
  await t.click();
  await hover();
  await page.mouse.wheel(0, 60);
  await expect.poll(noteTop).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  expect(await pageTop()).toBe(0);
  // focus gone: the page again
  await t.evaluate((e) => e.blur());
  const n0 = await noteTop();
  await hover();
  await page.mouse.wheel(0, 60);
  await expect.poll(pageTop).toBeGreaterThan(0);
  expect(await noteTop()).toBe(n0);
});

test('notes hidden: compact cards — exactly the info block, no room left where the notes were', async ({ page }) => {
  await openSlate(page);
  await card(page, 0).getByTestId('note-text').fill('Some note');
  await setNotes(page, false);
  await expect(page.getByTestId('note')).toHaveCount(0);
  await expect(page.getByTestId('note-head')).toHaveCount(0);
  const r = await cards(page).evaluateAll((cs) =>
    cs.map((c) => {
      const s = getComputedStyle(c);
      const frame = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) + parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth);
      const side = parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth);
      const info = c.querySelector('.ck-slate-info')!.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      return { h: cr.height - frame - info.height, w: cr.width - side - info.width };
    }),
  );
  for (const c of r) {
    expect(Math.abs(c.h)).toBeLessThan(1);
    expect(Math.abs(c.w)).toBeLessThan(1);
  }
});

test('export → clear → import: the same notes and slots; merge rule; a malformed file is refused, storage untouched', async ({ page }, info) => {
  await openSlate(page);
  const ids = await cards(page).evaluateAll((cs) => cs.slice(0, 2).map((c) => c.getAttribute('data-game-id')!));
  await card(page, 0).getByTestId('note-text').fill('A pre');
  await card(page, 0).getByTestId('note-switch').click();
  await card(page, 0).getByTestId('note-text').fill('A live');
  await card(page, 1).getByTestId('note-text').fill('B pre');
  await saved(page, ids[1]!, { pre: 'B pre' });
  const all = await stored(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('notes-export').click()]);
  const path = info.outputPath('notes.json');
  await download.saveAs(path);
  const file = JSON.parse(readFileSync(path, 'utf8'));
  expect(file.format).toBe(KEY);
  expect(file.notes).toEqual(all);
  // clear, import → identical
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload();
  await expect(page.getByTestId('slate')).toBeVisible();
  await setNotes(page, true);
  await expect(card(page, 0).getByTestId('note-text')).toHaveValue('');
  await page.getByTestId('notes-file').setInputFiles(path);
  await expect(page.getByTestId('notes-message')).toHaveText('Imported notes for 2 games.');
  expect(await stored(page)).toEqual(all);
  await expect(card(page, 0).getByTestId('note-slot')).toHaveText('LIVE');
  await expect(card(page, 0).getByTestId('note-text')).toHaveValue('A live');
  // merge: the file's text wins per slot, an empty slot in the file keeps ours
  await card(page, 1).getByTestId('note-text').fill('B pre, edited here');
  await card(page, 1).getByTestId('note-switch').click();
  await card(page, 1).getByTestId('note-text').fill('B live here');
  await page.getByTestId('notes-file').setInputFiles({ name: 'merge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: KEY, notes: { [ids[1]!]: { pre: 'B pre from file', live: '', post: 'B post from file', shown: 'post' } } })) });
  await expect(page.getByTestId('notes-message')).toHaveText('Imported notes for 1 game.');
  expect((await stored(page))[ids[1]!]).toEqual({ pre: 'B pre from file', live: 'B live here', post: 'B post from file', shown: 'post' });
  // malformed: refused, nothing changed
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY);
  for (const bad of ['not json at all', JSON.stringify({ format: KEY, notes: { x: { pre: 1 } } })]) {
    await page.getByTestId('notes-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(bad) });
    await expect(page.getByTestId('notes-message')).toHaveText(/^Not imported: .+\. Nothing was changed\.$/);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
  }
});

test('copy: each card with its box — the shown slot\'s label and text, no ⇄; an empty box dark and opaque; transparent around; column rule', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-xl', 'once, at the whiteboard size');
  test.setTimeout(180_000);
  await page.setViewportSize(PAGE);
  await openSlate(page);
  await card(page, 0).getByTestId('note-text').fill('Pregame: watch the matchup inside.');
  await card(page, 1).getByTestId('note-switch').click();
  await card(page, 1).getByTestId('note-text').fill('Live: 10-0 run to open the 3rd.');
  // a note far past the screen's 5 lines: copied whole — no scrollbar, nothing cut
  const long = Array.from({ length: 12 }, (_, i) => `Copy line ${i + 1}.`).join('\n');
  await card(page, 3).getByTestId('note-text').fill(long);
  await page.mouse.click(5, 900);
  const r = await copySlate(page, 'copy-view', 'notes-copy');
  expect(r.stage.cards.every((k) => k.note)).toBe(true);
  expect(r.stage.cards.map((k) => k.note!.controls)).toEqual(r.stage.cards.map(() => 0)); // no ⇄, no field
  expect(r.stage.cards[0]!.note!.slot).toBe('PRE');
  expect(r.stage.cards[0]!.note!.text).toBe('Pregame: watch the matchup inside.');
  expect(r.stage.cards[1]!.note!.slot).toBe('LIVE');
  expect(r.stage.cards[3]!.note!.text).toBe(long);
  for (const k of r.stage.cards) {
    expect(k.note!.cut, 'copied notes: nothing cut').toBeLessThanOrEqual(0);
    expect(k.note!.scrollbar, 'copied notes: no scrollbar').toBe(0);
    // the label in the card's top-right corner, right of the (zoomed) info, above the box
    expect(k.note!.label!.x).toBeGreaterThan(k.note!.infoRight);
    expect(k.note!.label!.y + k.note!.label!.h).toBeLessThan(k.note!.y);
    expect(k.note!.y).toBeGreaterThanOrEqual(k.note!.infoBottom);
  }
  // 12 lines at 15 px × 1.35: the long note's box is far taller than the screen's 5-line cap
  expect(r.stage.cards[3]!.note!.h).toBeGreaterThan(12 * 20);
  expect(r.px.outsideOpaque, 'outside the cards: transparent').toBe(0);
  expect(r.px.insideClear, 'cards: opaque').toBe(0);
  // pixels: text in the written boxes, none in an empty one (dark, opaque); the slot label's corner holds text
  const k = r.stage.cards;
  const textArea = (i: number) => ({ x: (k[i]!.note!.x + 10) * r.ratio, y: (k[i]!.note!.y + 8) * r.ratio, w: Math.min(200, k[i]!.note!.w - 20) * r.ratio, h: 18 * r.ratio });
  const label = (i: number) => ({ x: k[i]!.note!.label!.x * r.ratio, y: k[i]!.note!.label!.y * r.ratio, w: k[i]!.note!.label!.w * r.ratio, h: k[i]!.note!.label!.h * r.ratio });
  const [w0, w1, e2, l2] = await readPng(page, r.png, [textArea(0), textArea(1), textArea(2), label(2)], true);
  expect(w0![5], 'text pixels in the written PRE box').toBeGreaterThan(80);
  expect(w1![5], 'text pixels in the written LIVE box').toBeGreaterThan(80);
  expect(e2![5], 'an empty box: no text').toBeLessThan(6);
  expect(e2![3]).toBe(255);
  expect(Math.max(e2![0]!, e2![1]!, e2![2]!), 'an empty box is dark').toBeLessThan(40);
  expect(l2![5], 'the slot label').toBeGreaterThan(40);
  // the "largest cards" rule with the new cards: no other column count shows them larger on the page
  const fit = (s: { width: number; height: number }) => Math.min(PAGE.width / s.width, PAGE.height / s.height);
  const [cw, ch] = [k[0]!.w, Math.max(...k.map((c) => c.h))];
  const gap = k.length > 1 ? k[1]!.x - k[0]!.x - cw : 120;
  for (let c = 1; c <= k.length; c++) expect(fit({ width: c * (cw + gap), height: Math.ceil(k.length / c) * (ch + gap) })).toBeLessThanOrEqual(fit(r.stage) + 1e-6);
  console.log(`[notes] copy of ${k.length} cards (${cw} × ${ch} CSS px each): ${r.stage.cols} columns, ${r.stage.width}×${r.stage.height} × ${r.ratio}, ${r.ms} ms`);
});

test('typing on a 15-game night: no other card\'s DOM changes; keystroke → next frame timed and guarded', async ({ page }, info) => {
  await openSlate(page);
  const busy = await page.evaluate(async () => {
    const raw = await (await fetch('/calendar/data/schedule.json')).json();
    const n = new Map<string, number>();
    for (const g of (raw.leagueSchedule.gameDates as { games: { gameId: string; gameDateEst: string }[] }[]).flatMap((d) => d.games)) if (/^00[2456]/.test(g.gameId)) n.set(g.gameDateEst.slice(0, 10), (n.get(g.gameDateEst.slice(0, 10)) ?? 0) + 1);
    return [...n].find(([, c]) => c === 15)![0];
  });
  await openSlate(page, busy);
  await expect(cards(page)).toHaveCount(15);
  await page.evaluate(() => {
    const w = window as unknown as { __muts: number; __times: number[] };
    w.__muts = 0;
    w.__times = [];
    const cs = [...document.querySelectorAll('.ck-slate-card')].slice(1);
    const mo = new MutationObserver((m) => (w.__muts += m.length));
    for (const c of cs) mo.observe(c, { subtree: true, childList: true, attributes: true, characterData: true });
    const t = document.querySelector<HTMLTextAreaElement>('.ck-slate-card [data-testid="note-text"]')!;
    t.addEventListener('keydown', () => {
      const t0 = performance.now();
      requestAnimationFrame(() => w.__times.push(performance.now() - t0));
    });
  });
  await card(page, 0).getByTestId('note-text').click();
  await page.keyboard.type('Fifteen games tonight: every one of these keys is timed.', { delay: 30 });
  await page.waitForTimeout(600); // the save too
  const r = await page.evaluate(() => {
    const w = window as unknown as { __muts: number; __times: number[] };
    return { __muts: w.__muts, __times: w.__times };
  });
  const t = [...r.__times].sort((a, b) => a - b);
  console.log(`[notes] ${info.project.name} keystroke → next frame on 15 games: median ${t[t.length >> 1]!.toFixed(1)} ms, p95 ${t[Math.floor(t.length * 0.95)]!.toFixed(1)} ms, max ${t.at(-1)!.toFixed(1)} ms (${t.length} keys); other cards' mutations: ${r.__muts}`);
  expect(r.__muts).toBe(0);
  expect(t[t.length >> 1]).toBeLessThan(34); // within two frames
});
