// Standings (round 17): the Standings view (West | East | League tables) and the header's condensed popup, against the
// served snapshot — every W / L worked out here from the raw feed, the fit at 1600 × 1000 and 1920 × 950 (no page
// scroll, one line per row, the longest name with a clinch marker), the lines, sorting, tie hovers, team links, the
// copies read back from the clipboard, and the popup opening and closing over every view.

import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

const OUT = 'test-output/copy-images';
const desktop = (name: string) => ['desktop', 'desktop-xl'].includes(name);

/** W-L per tricode from the snapshot's finished regular-season (002) games — the Cup Championship (006) is not one. */
const snapshotRecords = (page: Page) =>
  page.evaluate(async (app) => {
    const raw = await (await fetch(`${app}data/schedule.json`)).json();
    const t: Record<string, [number, number]> = {};
    for (const d of raw.leagueSchedule.gameDates as { games: { gameId: string; gameStatus: number; homeTeam: { teamTricode: string; score: number }; awayTeam: { teamTricode: string; score: number } }[] }[])
      for (const g of d.games) {
        if (!g.gameId.startsWith('002') || g.gameStatus !== 3 || !g.homeTeam.teamTricode || !g.awayTeam.teamTricode) continue;
        const hw = g.homeTeam.score > g.awayTeam.score;
        (t[g.homeTeam.teamTricode] ??= [0, 0])[hw ? 0 : 1]++;
        (t[g.awayTeam.teamTricode] ??= [0, 0])[hw ? 1 : 0]++;
      }
    return t;
  }, APP);

const openStandings = async (page: Page, table: 'West' | 'East' | 'League' = 'West') => {
  await page.goto(`${APP}?view=standings`);
  await expect(page.getByTestId('standings-table')).toBeVisible();
  if (table !== 'West') await page.getByRole('tablist', { name: 'Standings table' }).getByRole('tab', { name: table }).click();
  await expect(page.getByTestId('standings-table')).toHaveAttribute('data-table', table);
};

/** The clipboard's PNG as base64 (after a copy button reached ✓). */
const clipboardPng = (page: Page) =>
  page.evaluate(async () => {
    const item = (await navigator.clipboard.read()).find((i) => i.types.includes('image/png'))!;
    const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
/** Image size, and the RGB at points given in CSS px from the copied node's top-left. */
const imagePixels = (page: Page, png: string, ratio: number, points: { x: number; y: number }[]) =>
  page.evaluate(
    async ({ png, ratio, points }) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      const at = (x: number, y: number) => {
        const i = (Math.round(y * ratio) * bmp.width + Math.round(x * ratio)) * 4;
        return [data[i]!, data[i + 1]!, data[i + 2]!];
      };
      return { width: bmp.width, height: bmp.height, corner: [...data.subarray(0, 4)], px: points.map((p) => at(p.x, p.y)) };
    },
    { png, ratio, points },
  );

test.describe('Standings view', () => {
  test.beforeEach(({}, info) => test.skip(!desktop(info.project.name), 'desktop only'));

  test('West, East and League tables: every W / L from the snapshot, seeds in order, lines after 6 and 10', async ({ page }) => {
    const want = await (await page.goto(`${APP}?view=standings`), snapshotRecords(page));
    for (const table of ['West', 'East', 'League'] as const) {
      await openStandings(page, table);
      const rows = await page.locator('[data-testid="standings-table"] tbody tr').evaluateAll((els) =>
        els.map((r) => ({ tri: r.getAttribute('data-team')!, seed: Number(r.getAttribute('data-seed')), w: r.querySelector('[data-col="w"]')!.textContent, l: r.querySelector('[data-col="l"]')!.textContent, cls: r.className })),
      );
      expect(rows).toHaveLength(table === 'League' ? 30 : 15);
      expect(rows.map((r) => r.seed)).toEqual(rows.map((_, i) => i + 1));
      for (const r of rows) expect([r.tri, Number(r.w), Number(r.l)]).toEqual([r.tri, ...(want[r.tri] ?? [0, 0])]);
      const lines = rows.map((r, i) => (r.cls.includes('playoffs') ? `p${i + 1}` : r.cls.includes('playin') ? `i${i + 1}` : '')).filter(Boolean);
      expect(lines).toEqual(table === 'League' ? [] : ['p6', 'i10']);
    }
  });

  test('every column is there; sorting by a column and back to seeds; the lines only in seed order', async ({ page }) => {
    await openStandings(page);
    const head = page.locator('.ck-st-cols th');
    await expect(head).toHaveText(['Seed ▲', 'Team', 'W', 'L', 'Pct', 'GB', 'Home', 'Road', 'Conf', 'Div', '.500+', 'Close', 'OT', 'L10', 'Strk', 'PF', 'PA', 'Diff', 'Left', 'Home', 'Road', 'B2B', '1st', '2nd']);
    await expect(page.locator('.ck-st-groups th')).toHaveText(['', '', 'Splits', 'Games', 'Form', 'Per game', 'Remaining', 'B2B legs']);
    const col = (key: string) => page.locator(`[data-testid="standings-table"] tbody td[data-col="${key}"]`).allTextContents();
    await page.locator('th button[data-col="l"]').click(); // losses: fewest first
    const l = (await col('l')).map(Number);
    expect(l).toEqual([...l].sort((a, b) => a - b));
    await expect(page.locator('.ck-st-line-playoffs, .ck-st-line-playin')).toHaveCount(0);
    await page.locator('th button[data-col="diff"]').click(); // differential: best first, then reversed
    const d = (await col('diff')).map((x) => Number(x.replace('−', '-')));
    expect(d).toEqual([...d].sort((a, b) => b - a));
    await page.locator('th button[data-col="diff"]').click();
    expect((await col('diff')).map((x) => Number(x.replace('−', '-')))).toEqual([...d].reverse().sort((a, b) => a - b));
    await page.getByRole('button', { name: /^Seed/ }).click();
    await expect(page.locator('.ck-st-line-playoffs')).toHaveCount(1);
    expect((await page.locator('[data-testid="standings-table"] tbody tr').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-seed')))))).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  test('a tied seed shows which tiebreaker decided it on hover', async ({ page }) => {
    await openStandings(page);
    let tied = page.getByTestId('tied-seed');
    if (!(await tied.count())) {
      await page.getByRole('tablist', { name: 'Standings table' }).getByRole('tab', { name: 'East' }).click();
      tied = page.getByTestId('tied-seed');
    }
    test.skip(!(await tied.count()), 'no tie in the snapshot (the unit tests cover the rules)');
    await tied.first().hover();
    await expect(page.getByTestId('tooltip')).toContainText(/^Tied at \.\d{3} with /);
    await expect(page.getByTestId('tooltip')).toContainText(/Head-to-head|Division leader|Division record|Conference record|top-10|Point differential|drawing/);
  });

  test('team names and logos are team links to the Team view', async ({ page }) => {
    await openStandings(page);
    const row = page.locator('[data-testid="standings-table"] tbody tr').first();
    const tri = await row.getAttribute('data-team');
    await expect(row.locator('a[data-team-link]')).toHaveCount(2);
    await row.locator('.ck-st-name').click();
    await expect(page.getByRole('tablist', { name: 'View' }).getByRole('tab', { name: 'Team' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(new RegExp(`team=${tri}`));
  });

  for (const table of ['West', 'League'] as const)
    test(`copy as image (${table}): the whole table on the clipboard, every row and both lines`, async ({ page }) => {
      mkdirSync(OUT, { recursive: true });
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await openStandings(page, table);
      const node = page.getByTestId('standings-capture');
      const size = await node.evaluate((e) => ({ w: e.scrollWidth, h: e.scrollHeight, top: e.getBoundingClientRect().top, left: e.getBoundingClientRect().left }));
      // probes (CSS px from the node's top-left): each row's seed cell text area is non-background; the two lines in their colours
      const probes = await page.locator('[data-testid="standings-table"] tbody tr').evaluateAll(
        (els, o) =>
          els.map((r) => {
            const b = r.getBoundingClientRect();
            const line = r.classList.contains('ck-st-line-playoffs') ? 'p' : r.classList.contains('ck-st-line-playin') ? 'i' : '';
            return { x: b.left - o.left + b.width / 2, y: b.bottom - o.top, line, last: false };
          }),
        size,
      );
      const button = page.getByTestId('copy-view');
      await page.evaluate(() => navigator.clipboard.writeText(''));
      await button.click();
      await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 60_000 });
      const ratio = Number((await button.getAttribute('data-captured'))!.split('@')[1]);
      const png = await clipboardPng(page);
      writeFileSync(`${OUT}/${test.info().project.name}-standings-${table}.png`, Buffer.from(png, 'base64'));
      const img = await imagePixels(page, png, ratio, probes);
      // the whole node — the League table's 30 rows too, below the window
      expect(Math.abs(img.width - size.w * ratio)).toBeLessThanOrEqual(2 * ratio);
      expect(Math.abs(img.height - size.h * ratio)).toBeLessThanOrEqual(2 * ratio);
      expect(img.corner).toEqual([15, 17, 21, 255]);
      const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 14);
      const red = [229, 83, 75]; // --ck-playoffs
      const lines = probes.map((p, i) => (p.line === 'p' ? near(img.px[i]!, red) : p.line === 'i' ? 'playin' : true));
      expect(lines.filter((x) => x === false)).toEqual([]);
      // the last row's bottom edge is inside the image
      expect(probes.at(-1)!.y * ratio).toBeLessThan(img.height);
    });

  test('the view’s code loads only when it (or the popup) is opened', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => /Standings/.test(r.url()) && chunks.push(r.url()));
    await page.goto(`${APP}?view=league&layout=list`);
    await expect(page.getByRole('tab', { name: 'Standings' })).toBeVisible();
    await page.getByRole('tab', { name: 'Team' }).click();
    expect(chunks).toEqual([]);
    await page.getByRole('tab', { name: 'Standings' }).click();
    await expect(page.getByTestId('standings-table')).toBeVisible();
    expect(chunks.length).toBeGreaterThan(0);
  });
});

test.describe('Standings fit the window', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'fixed window sizes: one desktop project is enough'));
  for (const size of [{ width: 1600, height: 1000 }, { width: 1920, height: 950 }])
    for (const table of ['West', 'East'] as const)
      test(`${size.width}×${size.height}, ${table}: 15 rows, no page scroll, one line per row, text not shrunk`, async ({ page }) => {
        await page.setViewportSize(size);
        await openStandings(page, table);
        await page.evaluate(() => document.fonts.ready);
        // the longest team name in the league, with a clinch marker beside it, in the first row (the widest a name cell gets)
        await page.evaluate(() => {
          const cell = document.querySelector('[data-testid="standings-table"] tbody tr .ck-st-name')!;
          cell.textContent = 'Minnesota Timberwolves';
          for (const r of document.querySelectorAll('[data-testid="standings-table"] tbody .ck-st-teamcell')) {
            if (r.querySelector('.ck-st-clinch')) continue;
            const m = document.createElement('span');
            m.className = 'ck-st-clinch';
            m.textContent = 'pi';
            r.append(m);
          }
        });
        const r = await page.evaluate(() => {
          const t = document.querySelector<HTMLElement>('[data-testid="standings-table"]')!;
          const cap = document.querySelector<HTMLElement>('[data-testid="standings-capture"]')!;
          const rows = [...t.querySelectorAll<HTMLElement>('tbody tr')];
          const cells = [...t.querySelectorAll<HTMLElement>('td, th')];
          return {
            rows: rows.length,
            pageScroll: document.documentElement.scrollHeight - innerHeight,
            pageScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            tableScrollX: cap.scrollWidth - cap.clientWidth,
            bottom: t.getBoundingClientRect().bottom,
            rowHeights: [...new Set(rows.map((x) => Math.round(x.getBoundingClientRect().height)))],
            // every cell's text on one line: one client rect per text node line
            multiLine: cells.filter((c) => [...c.querySelectorAll<HTMLElement>('span, button, a')].concat(c).some((e) => e.getClientRects().length > 1 || (e.textContent && e.getBoundingClientRect().height > 26 && e.tagName !== 'TD' && e.tagName !== 'TH'))).map((c) => c.textContent),
            cellFont: [...new Set(rows.flatMap((x) => [...x.querySelectorAll('td')].map((c) => getComputedStyle(c).fontSize)))],
            headFont: [...new Set([...t.querySelectorAll('thead th')].map((c) => getComputedStyle(c).fontSize))],
            nameWidth: t.querySelector('tbody .ck-st-name')!.getBoundingClientRect().width,
          };
        });
        expect(r.rows).toBe(15);
        expect(r.pageScroll).toBeLessThanOrEqual(0);
        expect(r.pageScrollX).toBeLessThanOrEqual(0);
        expect(r.tableScrollX).toBeLessThanOrEqual(0);
        expect(r.bottom).toBeLessThanOrEqual(size.height);
        expect(r.rowHeights).toEqual([30]);
        expect(r.multiLine).toEqual([]);
        expect(r.cellFont).toEqual(['13px']);
        expect(r.headFont).toEqual(['11px']);
        expect(r.nameWidth).toBeGreaterThan(140);
        await page.screenshot({ path: `test-output/standings-${table}-${size.width}x${size.height}.png` });
      });
});

/** Every view the popup can open over, the URL that opens it and an element only that view shows. */
const VIEWS: { name: string; url: string; marker: string; then?: (p: Page) => Promise<void> }[] = [
  { name: 'League List', url: '?view=league&layout=list', marker: '[data-testid="league-list"]' },
  { name: 'League Calendar', url: '?view=league&layout=calendar', marker: '.ck-week-view, .ck-month-grid, [data-testid="league-week"]' },
  { name: 'League Slate', url: '?view=league&layout=slate', marker: '[data-testid="slate"]' },
  { name: 'Team List', url: '?view=team&layout=list&team=BOS', marker: '[data-testid="team-list"]' },
  { name: 'Team Calendar', url: '?view=team&layout=calendar&team=BOS', marker: '.ck-team-grid' },
  { name: 'Cup standings', url: '?view=cup', marker: '[data-testid="cup-grid"]' },
  { name: 'Cup schedule', url: '?view=cup', marker: '[data-testid="cup-night"]', then: (p) => p.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click() },
  { name: 'Standings', url: '?view=standings', marker: '[data-testid="standings-table"]' },
];

test.describe('Standings popup', () => {
  test.beforeEach(({}, info) => test.skip(!desktop(info.project.name), 'desktop only'));

  for (const v of VIEWS)
    test(`over ${v.name}: opens without leaving it; closes with the button, Esc and a click outside`, async ({ page }) => {
      await page.goto(`${APP}${v.url}`);
      await v.then?.(page);
      const marker = page.locator(v.marker).first();
      await expect(marker).toBeVisible();
      const url = page.url();
      const button = page.getByTestId('standings-button');
      const pop = page.getByTestId('standings-popup');
      // 1. button opens, button closes
      await button.click();
      await expect(pop).toBeVisible();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(pop.getByTestId('standings-mini')).toHaveCount(2);
      await expect(pop.locator('[data-conference="West"] tbody tr')).toHaveCount(15);
      await expect(pop.locator('[data-conference="East"] tbody tr')).toHaveCount(15);
      await expect(pop.locator('.ck-st-line-playoffs')).toHaveCount(2);
      await expect(pop.locator('.ck-st-line-playin')).toHaveCount(2);
      await expect(pop.locator('[data-conference="West"] thead th')).toHaveText(['West', '', 'W-L', 'GB', 'L10', 'Strk']);
      await expect(pop.locator('tbody .ck-st-name[data-team-link]')).toHaveCount(30);
      await expect(marker).toBeVisible(); // still on the same view underneath
      expect(page.url()).toBe(url);
      await button.click();
      await expect(pop).toHaveCount(0);
      // 2. Esc
      await button.click();
      await expect(pop).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(pop).toHaveCount(0);
      // 3. a click outside it: the page's left gutter, at the popup's height
      await button.click();
      await expect(pop).toBeVisible();
      const box = (await pop.boundingBox())!;
      expect(box.x).toBeGreaterThan(20);
      await page.mouse.click(4, box.y + box.height / 2);
      await expect(pop).toHaveCount(0);
      // the view never changed
      await expect(marker).toBeVisible();
      expect(page.url()).toBe(url);
    });

  test('a click inside keeps it open; a team link in it opens the Team view and closes it', async ({ page }) => {
    await page.goto(`${APP}?view=league&layout=list`);
    await page.getByTestId('standings-button').click();
    const pop = page.getByTestId('standings-popup');
    await pop.locator('.ck-st-title').click();
    await expect(pop).toBeVisible();
    const tri = await pop.locator('[data-conference="East"] tbody tr').first().getAttribute('data-team');
    await pop.locator('[data-conference="East"] tbody tr .ck-st-name').first().click();
    await expect(pop).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`view=team.*team=${tri}`));
  });

  test('copy as image: both conferences, all 30 rows and the lines', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${APP}?view=league&layout=list`);
    await page.getByTestId('standings-button').click();
    const body = page.getByTestId('standings-popup-body');
    const size = await body.evaluate((e) => ({ w: e.scrollWidth, h: e.scrollHeight, top: e.getBoundingClientRect().top, left: e.getBoundingClientRect().left }));
    const probes = await body.locator('.ck-st-line-playoffs').evaluateAll((els, o) => els.map((r) => { const b = r.getBoundingClientRect(); return { x: b.left - o.left + b.width / 2, y: b.bottom - o.top }; }), size);
    expect(probes).toHaveLength(2);
    const button = page.getByTestId('standings-popup-copy');
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await button.click();
    await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 60_000 });
    const png = await clipboardPng(page);
    writeFileSync(`${OUT}/${test.info().project.name}-standings-popup.png`, Buffer.from(png, 'base64'));
    const ratio = await page.evaluate(({ w, h }) => Math.min(4, 16000 / Math.max(w, h)), size);
    const img = await imagePixels(page, png, ratio, probes);
    expect(Math.abs(img.width - size.w * ratio)).toBeLessThanOrEqual(2 * ratio);
    expect(Math.abs(img.height - size.h * ratio)).toBeLessThanOrEqual(2 * ratio);
    const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 14);
    for (const p of img.px) expect(near(p, [229, 83, 75])).toBe(true);
    await expect(page.getByTestId('standings-popup')).toBeVisible(); // copying doesn't close it
  });
});

test('no Standings tab or button on tablets and phones; a Standings link shows the League view there', async ({ page }, info) => {
  test.skip(desktop(info.project.name), 'tablet and phone only');
  await page.goto(`${APP}?view=standings`);
  await expect(page.getByRole('tablist', { name: 'View' }).getByRole('tab', { name: 'League' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Standings' })).toHaveCount(0);
  await expect(page.getByTestId('standings-button')).toHaveCount(0);
  await expect(page.getByTestId('standings-table')).toHaveCount(0);
});
