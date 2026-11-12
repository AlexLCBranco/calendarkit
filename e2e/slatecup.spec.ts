// The Slate's Cup track on a real layout — on a Cup night every Cup game's team row shows its 4
// group games (in order, tonight's ringed, "vs"/"@" before the opponent, W/L + margin for played ones) and its group
// record over its differential; non-Cup cards keep the track empty; the cards don't get taller and stay 2 columns at
// 1920; every square opens hoopsjunkie in a new tab; the copy has the squares too. Desktop widths.

import { expect, test } from './fixtures';
import { APP } from './app';
import { copySlate } from './slatecopy';

test.beforeEach(({}, info) => test.skip(!['desktop', 'desktop-xl'].includes(info.project.name), 'desktop only'));

const NOW = new Date('2026-11-06T15:00:00Z'); // Fri Nov 6: a Cup night (9 group games)

test('Cup night: the squares, the record; same card height; 2 columns at 1920; links; nothing cut off', async ({ page }, info) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.setFixedTime(NOW);
  // the card height on a night without Cup games (Nov 7), to compare
  await page.goto(`${APP}?view=league&layout=slate&date=2026-11-07`);
  await expect(page.locator('[data-testid="slate"] .ck-slate-card').first()).toBeVisible();
  const plain = await page.locator('[data-testid="slate"] .ck-slate-card').first().evaluate((c) => c.getBoundingClientRect().height);
  await expect(page.locator('[data-testid="slate-cup"]')).toHaveCount(0);
  await page.goto(`${APP}?view=league&layout=slate&date=2026-11-06`);
  const cards = page.locator('[data-testid="slate"] .ck-slate-card');
  await expect(cards.first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const out: string[] = [];
    const cards = [...document.querySelectorAll<HTMLElement>('[data-testid="slate"] .ck-slate-card')];
    for (const c of cards) {
      for (const t of c.querySelectorAll<HTMLElement>('[data-testid="slate-cup"]')) {
        const sq = [...t.querySelectorAll<HTMLElement>('.ck-cup-slot')];
        if (!t.dataset.team) continue;
        if (sq.length !== 4) out.push(`${t.dataset.team}: ${sq.length} squares`);
        if (sq.filter((s) => s.dataset.tonight).length !== 1) out.push(`${t.dataset.team}: tonight not marked once`);
        for (const s of sq) {
          if (s.tagName !== 'A' || (s as HTMLAnchorElement).target !== '_blank') out.push(`${t.dataset.team}: square not a new-tab link`);
          if (s.scrollWidth > s.clientWidth + 0.5 || s.scrollHeight > s.clientHeight + 0.5) out.push(`${t.dataset.team}: "${s.textContent}" cut off`);
          if (!/^(vs|@)[A-Z]{3}/.test(s.textContent!)) out.push(`${t.dataset.team}: "${s.textContent}" without vs/@`);
          if (s.classList.contains('ck-cup-slot-next') ? s.querySelector('.ck-cup-slot-res') : !/^[WL] [+−]?\d+$/.test(s.querySelector('.ck-cup-slot-res')?.textContent ?? '')) out.push(`${t.dataset.team}: "${s.textContent}" result`);
        }
        if (!/^\d-\d(0|[+−]\d+)$/.test(t.querySelector('.ck-slate-cup-rec')!.textContent!)) out.push(`${t.dataset.team}: record "${t.querySelector('.ck-slate-cup-rec')!.textContent}"`);
        const tb = t.getBoundingClientRect();
        const row = t.closest('.ck-slate-row')!.getBoundingClientRect();
        if (tb.top < row.top - 0.5 || tb.bottom > row.bottom + 0.5) out.push(`${t.dataset.team}: track taller than its row`);
      }
    }
    return { out, cup: document.querySelectorAll('[data-testid="slate-cup"][data-team]').length, heights: [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().height)))], cols: document.querySelector<HTMLElement>('.ck-slate-grid')!.dataset.cols };
  });
  await page.screenshot({ path: `test-output/slate-cup-${info.project.name}.png` });
  expect(r.out).toEqual([]);
  expect(r.cup).toBe(18); // 9 Cup games, 2 teams each
  expect(Math.max(...r.heights)).toBeLessThanOrEqual(Math.round(plain) + 0.5); // not taller than a plain night's card
  if (info.project.name === 'desktop-xl') expect(r.cols).toBe('2');
  // the copy has the squares (and the same column rule)
  const copy = await copySlate(page, 'copy-view', `slate-cup-${info.project.name}`);
  expect(copy.stage.cards.length).toBe(9);
});
