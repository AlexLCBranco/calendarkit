// Scores next to each other, logos mirrored (round 4, item 2), League List at every width: "[logo] BOS 113 @ 121 DET
// [logo]", with each team's record going in on the outside (item 5). Desktop/tablet: away record, away logo, away
// tricode, "@", home tricode (right edge), home logo and home record at one x on every row
// of a day, played or not (fixed slots); every row one line. Phones: the same order, no scores (rows with long TV
// names wrap there as before). Prints the widest row.

import { expect, test } from '@playwright/test';

const NOW = new Date('2026-11-15T15:00:00Z');

test('League List: mirrored matchup, one x per part down every day, one line per row', async ({ page }, info) => {
  test.setTimeout(120_000);
  const phone = info.project.name === 'phone';
  let widest = 0;
  // played days (Oct 21–27), today's mixed day and later ones
  for (const date of ['2026-10-21', '2026-10-24', '2026-10-27', '2026-11-15', '2026-12-25', '2027-02-26']) {
    await page.clock.setFixedTime(NOW);
    await page.goto(`/?view=league&layout=list&date=${date}`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete) && !!document.querySelector('[data-testid="league-list"] [data-game-id]'));
    const r = await page.evaluate((phone) => {
      const round = (n: number) => Math.round(n * 10) / 10;
      const out = { bad: [] as string[], cols: [] as Record<string, number[]>[], widest: 0, order: [] as string[] };
      for (const day of document.querySelectorAll('[data-testid="league-list"] .ck-lday')) {
        const cols: Record<string, number[]> = { rec1: [], logo1: [], away: [], at: [], home: [], logo2: [], rec2: [] };
        for (const c of day.querySelectorAll<HTMLElement>('.ck-card')) {
          const m = c.querySelector('.ck-matchup')!;
          const logos = [...m.querySelectorAll('.ck-logo-backing, .ck-logo-empty')].map((l) => l.getBoundingClientRect());
          const teams = [...m.querySelectorAll('.ck-team')].map((t) => t.getBoundingClientRect());
          cols.logo1!.push(round(logos[0]!.left));
          cols.away!.push(round(teams[0]!.left));
          cols.at!.push(round(m.querySelector('.ck-vsat')!.getBoundingClientRect().left));
          cols.home!.push(round(teams[1]!.right));
          cols.logo2!.push(round(logos[1]!.left));
          // records going in (round 4, item 5): slots outside the logos, desktop/tablet only
          const recs = [...m.querySelectorAll('.ck-rec')].map((r) => r.getBoundingClientRect());
          if (recs.length === 2) cols.rec1!.push(round(recs[0]!.right)), cols.rec2!.push(round(recs[1]!.left));
          else if (recs.length || !phone) out.bad.push(`${c.dataset.gameId}: ${recs.length} record slots`);
          // order: logo, away, (score), @, (score), home, logo
          const seq = [...m.querySelectorAll('.ck-logo-backing, .ck-logo-empty, .ck-team, .ck-score, .ck-vsat')].map((e) => (e.classList.contains('ck-team') ? 'T' : e.classList.contains('ck-score') ? 'S' : e.classList.contains('ck-vsat') ? '@' : 'L')).join('');
          out.order.push(seq);
          // every tricode and score's text inside its slot (a slot too narrow lets the text spill out sideways)
          for (const e of m.querySelectorAll('.ck-team, .ck-score, .ck-rec:not(:empty)')) {
            const range = document.createRange();
            range.selectNodeContents(e.firstChild!);
            const t = range.getBoundingClientRect();
            const b = e.getBoundingClientRect();
            if (t.left < b.left - 0.5 || t.right > b.right + 0.5) out.bad.push(`${c.dataset.gameId}: "${e.textContent}" spills out of its slot`);
          }
          const parts = [...c.children].filter((k) => getComputedStyle(k).position !== 'absolute' && k.getBoundingClientRect().width > 0).map((k) => k.getBoundingClientRect());
          // phones: long TV names already took a second line before (e.g. GSW @ DEN Oct 24, 47.5 px), so only wider rows
          if (!phone && new Set(parts.map((p) => Math.round(p.top + p.height / 2))).size > 1) out.bad.push(`${c.dataset.gameId}: wraps`);
          if (c.scrollWidth > c.clientWidth) out.bad.push(`${c.dataset.gameId}: clipped`);
          out.widest = Math.max(out.widest, Math.max(...parts.map((p) => p.right)) - c.getBoundingClientRect().left);
        }
        out.cols.push(cols);
      }
      return out;
    }, phone);
    widest = Math.max(widest, r.widest);
    expect(r.bad, date).toEqual([]);
    for (const seq of r.order) expect(['LTSSTL'.replace('SS', 'S@S'), 'LT@TL'], date).toContain(seq);
    if (!phone) for (const cols of r.cols) for (const [k, xs] of Object.entries(cols)) expect(new Set(xs).size, `${date} ${k}: ${[...new Set(xs)]}`).toBe(1);
    // records: the worst case "41-41" fits its slot
    if (!phone) {
      const fit = await page.evaluate(() => {
        const rec = document.querySelector<HTMLElement>('[data-testid="league-list"] .ck-rec')!;
        const t = rec.textContent;
        rec.textContent = '41-41';
        const range = document.createRange();
        range.selectNodeContents(rec);
        const r = { text: range.getBoundingClientRect().width, slot: rec.getBoundingClientRect().width };
        rec.textContent = t;
        return r;
      });
      expect(fit.text, `"41-41" ${fit.text} px in a ${fit.slot} px slot`).toBeLessThanOrEqual(fit.slot);
    }
  }
  console.log(`[mirror] ${info.project.name} League List widest row ${widest.toFixed(1)} px`);
});
