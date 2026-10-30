// Schedule-fatigue columns in the Team List (desktop 1280 and 1920): every row of all 30 teams — the selected team's
// tricode at one x, both columns' labels left-aligned in their columns, the tag area at one x, one line, nothing
// clipped, no sideways scroll; tooltips on hover and focus. Prints the widest content per column.

import { expect, test, type Page } from './fixtures';

const NOW = new Date('2026-11-15T15:00:00Z');

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'desktop-xl', 'desktop widths only'));

async function open(page: Page, search: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${search}`);
  await expect(page.getByTestId('team-list').locator('article').first()).toBeAttached();
}

const TRICODES = ['ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'];

test('fatigue columns: all 30 teams, fixed x, left-aligned, one line, nothing clipped', async ({ page }, info) => {
  test.setTimeout(240_000);
  const xs = { self: new Set<number>(), oppCol: new Set<number>(), tags: new Set<number>(), teamCol: new Set<number>(), logo1: new Set<string>(), vsat: new Set<string>(), oppRight: new Set<string>(), logo2: new Set<string>() };
  const bad: string[] = [];
  let rows = 0;
  let widest = { team: 0, opp: 0 };
  for (const tri of TRICODES) {
    await open(page, `?view=team&layout=list&team=${tri}&rest=1`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const r = await page.evaluate(() => {
      const round = (n: number) => Math.round(n * 10) / 10;
      const root = document.querySelector('.ck-root')!.getBoundingClientRect();
      const out = { rows: 0, self: [] as number[], oppCol: [] as number[], tags: [] as number[], teamCol: [] as number[], logo1: [] as string[], vsat: [] as string[], oppRight: [] as string[], logo2: [] as string[], bad: [] as string[], widestTeam: 0, widestOpp: 0, restCols: 0 };
      for (const c of document.querySelectorAll<HTMLElement>('.ck-team-rows > .ck-card')) {
        out.rows++;
        const name = c.getAttribute('aria-label')!.slice(0, 40);
        const box = (s: string) => c.querySelector(s)!.getBoundingClientRect();
        const team = c.querySelector<HTMLElement>('[data-testid="fatigue-team"]');
        const opp = c.querySelector<HTMLElement>('[data-testid="fatigue-opp"]');
        if (!team || !opp) {
          out.bad.push(`${name}: no fatigue columns`);
          continue;
        }
        out.self.push(round(box('.ck-self').left));
        // mirrored matchup (round 4): "[logo] BOS 113 vs 121 CHI [logo]" — logos, "vs"/"@" and the opponent's tricode
        // (right edge, it sits against its logo) at one x on every played row, and on every unplayed row (round 7, 2.4: no
        // score slots there, so the two kinds differ — Alex's trade-off); the slot holds it all
        const kind = c.querySelector('.ck-matchup .ck-score') ? 'played|' : 'unplayed|';
        const logos = [...c.querySelectorAll('.ck-matchup .ck-logo-backing, .ck-matchup .ck-logo-empty')].map((l) => kind + round(l.getBoundingClientRect().left));
        out.logo1.push(logos[0]!);
        out.logo2.push(logos[1]!);
        out.vsat.push(kind + round(box('.ck-matchup .ck-vsat').left));
        out.oppRight.push(kind + round(box('.ck-matchup .ck-opp').right));
        const m = c.querySelector('.ck-matchup')!;
        if (m.scrollWidth > m.clientWidth) out.bad.push(`${name}: matchup overflows its slot`);
        out.tags.push(round(box('.ck-tags').left));
        out.oppCol.push(round(opp.getBoundingClientRect().left));
        out.teamCol.push(round(team.getBoundingClientRect().left));
        // labels left-aligned: the first one starts at the column's left; together they fit the column
        for (const col of [team, opp]) {
          const cb = col.getBoundingClientRect();
          const kids = [...col.children].map((k) => k.getBoundingClientRect());
          if (kids.length && Math.abs(kids[0]!.left - cb.left) > 0.5) out.bad.push(`${name}: label not left-aligned`);
          if (kids.length && kids.at(-1)!.right > cb.right + 0.5) out.bad.push(`${name}: column overflows by ${kids.at(-1)!.right - cb.right}`);
          if (new Set(kids.map((k) => Math.round(k.top))).size > 1) out.bad.push(`${name}: column wraps`);
          const used = kids.length ? kids.at(-1)!.right - kids[0]!.left : 0;
          if (col === team) out.widestTeam = Math.max(out.widestTeam, used);
          else out.widestOpp = Math.max(out.widestOpp, used);
        }
        // one line: every part's middle on the same line, tags on one line; nothing outside the row or the widget
        const parts = [...c.children].filter((k) => getComputedStyle(k).position !== 'absolute' && k.getBoundingClientRect().width > 0).map((k) => k.getBoundingClientRect());
        if (new Set(parts.map((p) => Math.round(p.top + p.height / 2))).size > 1) out.bad.push(`${name}: wraps`);
        if (new Set([...c.querySelectorAll('.ck-tags > *')].map((k) => Math.round(k.getBoundingClientRect().top))).size > 1) out.bad.push(`${name}: tags wrap`);
        const cb = c.getBoundingClientRect();
        if (c.scrollWidth > c.clientWidth || cb.right > root.right + 0.5 || parts.some((p) => p.right > cb.right + 0.5)) out.bad.push(`${name}: clipped`);
      }
      out.restCols = document.querySelectorAll('.ck-rest-row .ck-fat').length;
      return out;
    });
    rows += r.rows;
    r.self.forEach((x) => xs.self.add(x));
    r.oppCol.forEach((x) => xs.oppCol.add(x));
    r.tags.forEach((x) => xs.tags.add(x));
    r.teamCol.forEach((x) => xs.teamCol.add(x));
    for (const k of ['logo1', 'vsat', 'oppRight', 'logo2'] as const) r[k].forEach((x) => xs[k].add(x));
    bad.push(...r.bad.map((b) => `${tri} ${b}`));
    expect(r.restCols, `${tri} rest rows have no columns`).toBe(0);
    widest = { team: Math.max(widest.team, r.widestTeam), opp: Math.max(widest.opp, r.widestOpp) };
  }
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const widths = await page.evaluate(() => ({
    team: document.querySelector('.ck-fat-team')!.getBoundingClientRect().width,
    opp: document.querySelector('.ck-fat-opp')!.getBoundingClientRect().width,
    list: document.querySelector('.ck-team-list')!.getBoundingClientRect().width,
  }));
  console.log(
    `[fatigue] ${info.project.name}: ${rows} rows, list ${widths.list} px, team column ${widths.team} px (widest ${widest.team.toFixed(1)}), opponent column ${widths.opp} px (widest ${widest.opp.toFixed(1)}), x: self ${[...xs.self]}, tags ${[...xs.tags]}`,
  );
  expect(rows).toBeGreaterThanOrEqual(2400);
  expect(bad).toEqual([]);
  expect([...xs.self]).toHaveLength(1);
  expect([...xs.teamCol]).toHaveLength(1);
  expect([...xs.oppCol]).toHaveLength(1);
  expect([...xs.tags]).toHaveLength(1);
  for (const k of ['logo1', 'vsat', 'oppRight', 'logo2'] as const)
    for (const kind of ['played', 'unplayed']) expect([...xs[k]].filter((x) => x.startsWith(`${kind}|`)), `${k} on ${kind} rows`).toHaveLength(1);
  expect(sideways).toBeLessThanOrEqual(0);
});

test('fatigue tooltips on hover and focus (round 5: on the Fatigue components): details line by line, opponent too', async ({ page }) => {
  await open(page, '?view=team&layout=list&team=BOS');
  const tip = page.getByTestId('tooltip');
  const own = page.locator('[data-testid="fatigue-team"] [data-testid="fatigue"][data-tif][data-night]').first();
  await own.scrollIntoViewIfNeeded();
  await own.hover();
  const text = (await own.getAttribute('data-tip'))!;
  // the text, then (round 6) the stretch's day strip
  await expect(tip).toContainText(text.replace(/\n/g, ' ')); // collapses whitespace
  expect(await tip.evaluate((t) => t.firstChild!.textContent)).toBe(text);
  // the leg, both games, the merged 3-in-4 stretch, the record: one per line, the strip under them
  const strip = tip.getByTestId('tip-days');
  await expect(strip).toBeVisible();
  const lines = await tip.evaluate((t) => Math.round((t.querySelector('[data-testid="tip-days"]')!.getBoundingClientRect().top - t.getBoundingClientRect().top) / parseFloat(getComputedStyle(t).lineHeight)));
  expect(lines).toBe(text.split('\n').length);
  expect(text).toMatch(/^BOS — [12]\/2 · [HA]{2} \((1st|2nd) night of a back-to-back\)\n/);
  expect(text).toMatch(/\n\d+in\d+ · \d+(st|nd|rd|th): \d+ games in \d+ days \([A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+\), tonight the \d+(st|nd|rd|th)(\n|$)/);
  expect(text).not.toContain('3 games in 4 days — ');
  // the strip: one cell per day of the stretch, exactly one tonight, games at both ends
  const kinds = await strip.locator('.ck-tip-day').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
  expect(kinds.filter((k) => k === 'tonight')).toHaveLength(1);
  expect(kinds[0]).not.toBe('rest');
  expect(kinds.at(-1)).not.toBe('rest');
  const box = await tip.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);
  const opp = page.locator('[data-testid="fatigue-opp"] [data-testid="fatigue"][data-night="2"]').first();
  await opp.scrollIntoViewIfNeeded();
  // the tooltip closes on scroll: let the scroll's event pass first (round 7: with rest rows on by default the row is
  // further down, and the late scroll event closed the tooltip opened by the focus — 2 of 3 runs)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await opp.focus();
  await expect(tip).toHaveText(/^[A-Z]{3} — 2\/2 · [HA]{2} \(2nd night of a back-to-back\)/);
});
