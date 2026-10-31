// Round 9, Part 3: the Slate's wide layout and its note boxes in a real browser (desktop widths): from the left edge, 1 or
// 2 columns by the note box's width; notes saved in localStorage (`ck:notes:v1`, keyed by gameId) and back after a
// reload; three slots, the shown one saved, never switched by the clock; Switch all; Hide all (not remembered); two tabs
// in sync without losing the typing tab's caret; long notes grow the card; export / import; copies with the boxes; and
// typing touching no other card, keystroke → frame timed.

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { copySlate, readPng } from './slatecopy';

const NOW = new Date('2026-11-15T15:00:00Z');
const KEY = 'ck:notes:v1';
const PAGE = { width: 1920, height: 911 };

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only: the Slate'));

async function openSlate(page: Page, date = '2026-11-15', now = NOW) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.setFixedTime(now);
  await page.goto(`/?view=league&layout=slate&date=${date}`);
  await expect(page.getByTestId('slate')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const cards = (page: Page) => page.locator('[data-testid="slate"] .ck-slate-card');
const card = (page: Page, i: number) => cards(page).nth(i);
const stored = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), KEY);
/** Waits until the debounced save has written. */
const saved = (page: Page, id: string, want: Record<string, string>) => expect.poll(async () => (await stored(page))[id]).toMatchObject(want);

test('layout: from the left edge, two columns at 1920 and one at 1280; every note box ≥ 300 px; the info at its old size', async ({ page }, info) => {
  await openSlate(page);
  const r = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('.ck-slate-grid')!;
    const root = document.querySelector('.ck-root')!.getBoundingClientRect();
    const cs = [...document.querySelectorAll<HTMLElement>('.ck-slate-card')].map((c) => ({ x: Math.round(c.getBoundingClientRect().left), w: c.getBoundingClientRect().width, note: c.querySelector('.ck-gnote')!.getBoundingClientRect().width, info: c.querySelector('.ck-slate-info')!.getBoundingClientRect().width }));
    return { cols: new Set(cs.map((c) => c.x)).size, left: grid.getBoundingClientRect().left - root.left, right: root.right - grid.getBoundingClientRect().right, cs, vw: innerWidth };
  });
  console.log(`[notes] ${info.project.name} (${r.vw} px): ${r.cols} column(s), card ${r.cs[0]!.w} px, info ${r.cs[0]!.info} px, note box ${r.cs[0]!.note} px`);
  expect(r.cols).toBe(info.project.name === 'desktop-xl' ? 2 : 1);
  expect(Math.abs(r.left)).toBeLessThan(1);
  expect(r.right).toBeLessThan(1);
  for (const c of r.cs) {
    expect(c.note).toBeGreaterThanOrEqual(300);
    expect(c.info).toBe(444); // the round 7 card's content width
  }
});

test('type → reload → back, by gameId (also on the same game reached by another day and back); new game on PRE', async ({ page }) => {
  await openSlate(page);
  const id = (await card(page, 1).getAttribute('data-game-id'))!;
  await card(page, 1).getByTestId('note-text').click();
  await page.keyboard.type('Injury report: questionable');
  await saved(page, id, { pre: 'Injury report: questionable', shown: 'pre' });
  await page.reload();
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
  await expect(card(page, 0).getByTestId('note-slot')).toHaveText('POST');
  await expect(card(page, 0).getByTestId('note-text')).toHaveValue('post text');
  // the clock past tip-off and past "over": still POST (nothing switches by itself)
  const tip = await page.evaluate(async (id) => {
    const raw = await (await fetch('/data/schedule.json')).json();
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
  await expect(page.locator('[data-testid="note-slot"]', { hasText: 'LIVE' })).toHaveCount(n);
  // Hide all notes: info only; a reload brings them back (a view toggle, not stored)
  await page.getByTestId('notes-hide').click();
  await expect(page.getByTestId('note')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('note')).toHaveCount(n);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([KEY]);
});

test('two tabs: typing and switching in one shows up in the other; the typing tab keeps its text and caret', async ({ page, context }) => {
  await openSlate(page);
  const other = await context.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto('/?view=league&layout=slate&date=2026-11-15');
  await expect(other.getByTestId('slate')).toBeVisible();
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

test('a long note grows its card (and its row): nothing cut, no inner scrollbar, the font stays', async ({ page }) => {
  await openSlate(page);
  const c = card(page, 0);
  const before = await c.evaluate((e) => ({ h: e.getBoundingClientRect().height, font: getComputedStyle(e.querySelector('.ck-gnote-text')!).fontSize }));
  await c.getByTestId('note-text').fill(Array.from({ length: 14 }, (_, i) => `Line ${i + 1}: something to say about this game.`).join('\n'));
  const after = await c.evaluate((e) => {
    const t = e.querySelector<HTMLTextAreaElement>('.ck-gnote-text')!;
    const box = e.querySelector('.ck-gnote')!.getBoundingClientRect();
    return { h: e.getBoundingClientRect().height, font: getComputedStyle(t).fontSize, inner: t.scrollHeight - t.clientHeight, overflowY: getComputedStyle(t).overflowY, tBottom: t.getBoundingClientRect().bottom, boxBottom: box.bottom, cardBottom: e.getBoundingClientRect().bottom };
  });
  expect(after.h).toBeGreaterThan(before.h + 200);
  expect(after.font).toBe(before.font);
  expect(after.inner).toBeLessThanOrEqual(0);
  expect(after.tBottom).toBeLessThanOrEqual(after.boxBottom + 0.5);
  expect(after.boxBottom).toBeLessThanOrEqual(after.cardBottom);
  // the neighbour in its row (two columns) grows with it, so the rows stay rows
  if ((await page.locator('.ck-slate-grid').getAttribute('data-cols')) === '2') expect(Math.abs((await card(page, 1).boundingBox())!.height - after.h)).toBeLessThan(1);
  // the box's least height = the card's info height
  const empty = await card(page, 2).evaluate((e) => [e.querySelector('.ck-gnote')!.getBoundingClientRect().height, e.querySelector('.ck-slate-info')!.getBoundingClientRect().height]);
  expect(Math.abs(empty[0]! - empty[1]!)).toBeLessThan(1);
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
  await page.mouse.click(5, 900);
  const r = await copySlate(page, 'copy-view', 'notes-copy');
  expect(r.stage.cards.every((k) => k.note)).toBe(true);
  expect(r.stage.cards.map((k) => k.note!.controls)).toEqual(r.stage.cards.map(() => 0)); // no ⇄, no field
  expect(r.stage.cards[0]!.note!.slot).toBe('PRE');
  expect(r.stage.cards[0]!.note!.text).toBe('Pregame: watch the matchup inside.');
  expect(r.stage.cards[1]!.note!.slot).toBe('LIVE');
  expect(r.px.outsideOpaque, 'outside the cards: transparent').toBe(0);
  expect(r.px.insideClear, 'cards: opaque').toBe(0);
  // pixels: text in the written boxes, none in an empty one (dark, opaque); the slot label's corner holds text
  const k = r.stage.cards;
  const textArea = (i: number) => ({ x: (k[i]!.note!.x + 10) * r.ratio, y: (k[i]!.note!.y + 8) * r.ratio, w: 200 * r.ratio, h: 18 * r.ratio });
  const label = (i: number) => ({ x: (k[i]!.note!.x + k[i]!.note!.w - 50) * r.ratio, y: (k[i]!.note!.y + 4) * r.ratio, w: 28 * r.ratio, h: 12 * r.ratio });
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
    const raw = await (await fetch('/data/schedule.json')).json();
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
