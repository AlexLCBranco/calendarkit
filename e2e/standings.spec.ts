// Standings (round 17; round 18: West and East side by side, four column sets) and the header’s condensed popup,
// against the served snapshot — every W / L worked out here from the raw feed, the fit at 1600 × 1000 and 1920 × 950 in
// every set (both tables, no scroll, one line per row, the longest name with a clinch marker), the lines, sorting both
// tables, tie hovers, team links, the copies read back from the clipboard, and the popup opening and closing over every view.

import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { APP } from './app';
import { destination, pickScope } from './nav';

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

type SetKey = 'main' | 'splits' | 'form' | 'schedule';
const SET_LABEL: Record<SetKey, string> = { main: 'Main', splits: 'Splits', form: 'Form & scoring', schedule: 'Schedule & B2B' };
/** What each column set shows after seed and team: header labels, the cells' column keys, the group row (after the conference title). */
const SETS: Record<SetKey, { heads: string[]; keys: string[]; groups: string[] }> = {
  main: { heads: ['W', 'L', 'Pct', 'GB', 'Conf', 'Home', 'Road', 'L10', 'Strk', 'Diff'], keys: ['w', 'l', 'pct', 'gb', 'conf', 'home', 'road', 'l10', 'streak', 'diff'], groups: ['', 'Splits', 'Form', 'Per game'] },
  splits: { heads: ['W-L', 'Home', 'Road', 'Conf', 'Div', '.500+', 'Close', 'OT'], keys: ['wl', 'home', 'road', 'conf', 'div', 'over500', 'close', 'ot'], groups: ['', 'Splits', 'Games'] },
  form: { heads: ['W-L', 'L10', 'Strk', 'PF', 'PA', 'Diff'], keys: ['wl', 'l10', 'streak', 'ppg', 'oppg', 'diff'], groups: ['', 'Form', 'Per game'] },
  schedule: { heads: ['W-L', 'Left', 'Home', 'Road', 'B2B', '1st', '2nd'], keys: ['wl', 'left', 'leftHome', 'leftRoad', 'leftB2b', 'b2b1', 'b2b2'], groups: ['', 'Remaining', 'B2B legs'] },
};
const CONFS = ['West', 'East'] as const;
const table = (page: Page, conf: 'West' | 'East') => page.locator(`[data-testid="standings-table"][data-conference="${conf}"]`);
const pickSet = async (page: Page, set: SetKey) => {
  await page.getByRole('tablist', { name: 'Standings columns' }).getByRole('tab', { name: SET_LABEL[set], exact: true }).click();
  await expect(page.getByTestId('standings-capture')).toHaveAttribute('data-set', set);
};
const openStandings = async (page: Page, set: SetKey = 'main') => {
  await page.goto(`${APP}?view=standings`);
  await expect(page.getByTestId('standings-table')).toHaveCount(2);
  if (set !== 'main') await pickSet(page, set);
};
const colValues = (page: Page, conf: 'West' | 'East', key: string) => table(page, conf).locator(`tbody td[data-col="${key}"]`).allTextContents();
const lineRows = (page: Page, conf: 'West' | 'East') =>
  table(page, conf).locator('tbody tr').evaluateAll((els) => els.map((r, i) => (r.className.includes('playoffs') ? `p${i + 1}` : r.className.includes('playin') ? `i${i + 1}` : '')).filter(Boolean));

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

  test('West and East side by side: every W / L from the snapshot, seeds in order, lines after 6 and 10 in both', async ({ page }) => {
    const want = await (await page.goto(`${APP}?view=standings`), snapshotRecords(page));
    await expect(page.getByTestId('standings-table')).toHaveCount(2);
    for (const conf of CONFS) {
      const rows = await table(page, conf).locator('tbody tr').evaluateAll((els) =>
        els.map((r) => ({ tri: r.getAttribute('data-team')!, seed: Number(r.getAttribute('data-seed')), w: r.querySelector('[data-col="w"]')!.textContent, l: r.querySelector('[data-col="l"]')!.textContent })),
      );
      expect(rows).toHaveLength(15);
      expect(rows.map((r) => r.seed)).toEqual(rows.map((_, i) => i + 1));
      for (const r of rows) expect([r.tri, Number(r.w), Number(r.l)]).toEqual([r.tri, ...(want[r.tri] ?? [0, 0])]);
      expect(await lineRows(page, conf)).toEqual(['p6', 'i10']);
      await expect(table(page, conf).locator('.ck-st-conf')).toHaveText(`${conf}ern Conference`);
    }
    const w = (await table(page, 'West').boundingBox())!;
    const e = (await table(page, 'East').boundingBox())!;
    expect(w.x + w.width).toBeLessThanOrEqual(e.x); // West left, East right
    expect(Math.abs(w.y - e.y)).toBeLessThanOrEqual(1);
  });

  test('no West / East / League toggle and no League view any more', async ({ page }) => {
    await openStandings(page);
    await expect(page.getByRole('tablist', { name: 'Standings table' })).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'Standings columns' }).getByRole('tab')).toHaveText(['Main', 'Splits', 'Form & scoring', 'Schedule & B2B']);
    await expect(page.locator('[data-testid="standings"]').getByRole('tab')).toHaveCount(0);
    await expect(page.locator('[data-table]')).toHaveCount(0);
    expect(await page.getByTestId('standings-table').evaluateAll((ts) => ts.map((t) => t.getAttribute('data-conference')))).toEqual(['West', 'East']);
    await expect(page.locator('[data-testid="standings-table"] tbody tr')).toHaveCount(30); // 15 + 15, never one 30-row table
    await expect(page.getByText('League standings')).toHaveCount(0);
  });

  for (const set of Object.keys(SETS) as SetKey[])
    test(`column set "${SET_LABEL[set]}": exactly its columns in both tables`, async ({ page }) => {
      await openStandings(page, set);
      for (const conf of CONFS) {
        const t = table(page, conf);
        await expect(t.locator('.ck-st-cols th')).toHaveText(['Seed ▲', 'Team', ...SETS[set].heads]);
        await expect(t.locator('.ck-st-groups th')).toHaveText([`${conf}ern Conference`, ...SETS[set].groups]);
        const keys = await t.locator('tbody tr').evaluateAll((rows) => [...new Set(rows.map((r) => [...r.querySelectorAll('td[data-col]')].map((c) => c.getAttribute('data-col')).join(',')))]);
        expect(keys).toEqual([SETS[set].keys.join(',')]);
      }
    });

  test('sorting a column sorts both tables, each within its conference; seeds bring the lines back', async ({ page }) => {
    await openStandings(page);
    const west = await table(page, 'West').locator('tbody tr').evaluateAll((els) => els.map((e) => e.getAttribute('data-team')).sort());
    await table(page, 'West').locator('th button[data-col="l"]').click(); // losses: fewest first
    for (const conf of CONFS) {
      const l = (await colValues(page, conf, 'l')).map(Number);
      expect(l).toEqual([...l].sort((a, b) => a - b));
      await expect(table(page, conf).locator('th[aria-sort="ascending"] button')).toHaveText('L ▲');
      expect(await lineRows(page, conf)).toEqual([]);
    }
    expect(await table(page, 'West').locator('tbody tr').evaluateAll((els) => els.map((e) => e.getAttribute('data-team')).sort())).toEqual(west);
    await table(page, 'East').locator('th button[data-col="diff"]').click(); // from the East header: best first, in both
    const num = (xs: string[]) => xs.map((x) => Number(x.replace('−', '-')));
    for (const conf of CONFS) {
      const d = num(await colValues(page, conf, 'diff'));
      expect(d).toEqual([...d].sort((a, b) => b - a));
    }
    // Diff is in Form & scoring too: the sort stays; Splits has no Diff: back to seeds
    await pickSet(page, 'form');
    for (const conf of CONFS) await expect(table(page, conf).locator('th[aria-sort="descending"] button')).toHaveText('Diff ▼');
    await pickSet(page, 'splits');
    for (const conf of CONFS) {
      await expect(table(page, conf).locator('th[aria-sort] button')).toHaveText('Seed ▲');
      expect(await lineRows(page, conf)).toEqual(['p6', 'i10']);
    }
    await table(page, 'West').locator('th button[data-col="home"]').click();
    await table(page, 'East').getByRole('button', { name: /^Seed/ }).click();
    for (const conf of CONFS) {
      expect(await table(page, conf).locator('tbody tr').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-seed'))))).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
      expect(await lineRows(page, conf)).toEqual(['p6', 'i10']);
    }
  });

  test('the column set is kept while the page is open, not across a reload', async ({ page }) => {
    await openStandings(page, 'schedule');
    await destination(page, 'Schedule').click();
    await destination(page, 'Standings').click();
    await expect(page.getByTestId('standings-capture')).toHaveAttribute('data-set', 'schedule');
    await page.reload();
    await expect(page.getByTestId('standings-capture')).toHaveAttribute('data-set', 'main');
    expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toMatch(/schedule|splits|form/);
  });

  test('a tied seed shows which tiebreaker decided it on hover', async ({ page }) => {
    await openStandings(page);
    const tied = page.getByTestId('tied-seed');
    test.skip(!(await tied.count()), 'no tie in the snapshot (the unit tests cover the rules)');
    await tied.first().hover();
    await expect(page.getByTestId('tooltip')).toContainText(/^Tied at \.\d{3} with /);
    await expect(page.getByTestId('tooltip')).toContainText(/Head-to-head|Division leader|Division record|Conference record|top-10|Point differential|drawing/);
  });

  test('team names and logos are team links to the Team view', async ({ page }) => {
    await openStandings(page);
    const row = table(page, 'East').locator('tbody tr').first();
    const tri = await row.getAttribute('data-team');
    await expect(row.locator('a[data-team-link]')).toHaveCount(2);
    await row.locator('.ck-st-name').click();
    await expect(destination(page, 'Schedule')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('team-header')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`team=${tri}`));
  });

  for (const set of ['main', 'schedule'] as const)
    test(`copy as image (${SET_LABEL[set]}): both conferences in the current set, every row and both lines in each`, async ({ page }) => {
      mkdirSync(OUT, { recursive: true });
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await openStandings(page, set);
      const node = page.getByTestId('standings-capture');
      const size = await node.evaluate((e) => ({ w: e.scrollWidth, h: e.scrollHeight, top: e.getBoundingClientRect().top, left: e.getBoundingClientRect().left }));
      // probes (CSS px from the node's top-left): the bottom edge of the playoff-line row, in the middle of each table
      const probes = await page.locator('[data-testid="standings-table"] tbody tr.ck-st-line-playoffs').evaluateAll(
        (els, o) => els.map((r) => { const b = r.getBoundingClientRect(); return { x: b.left - o.left + b.width / 2, y: b.bottom - o.top - 1 }; }),
        size,
      );
      expect(probes).toHaveLength(2);
      expect(probes[1]!.x).toBeGreaterThan(size.w / 2); // East's is in the right half
      const tables = await page.getByTestId('standings-table').evaluateAll((ts, o) => ts.map((t) => { const b = t.getBoundingClientRect(); return { right: b.right - o.left, bottom: b.bottom - o.top }; }), size);
      const button = page.getByTestId('copy-view');
      await page.evaluate(() => navigator.clipboard.writeText(''));
      await button.click();
      await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 60_000 });
      const ratio = Number((await button.getAttribute('data-captured'))!.split('@')[1]);
      const png = await clipboardPng(page);
      writeFileSync(`${OUT}/${test.info().project.name}-standings-${set}.png`, Buffer.from(png, 'base64'));
      const img = await imagePixels(page, png, ratio, probes);
      expect(Math.abs(img.width - size.w * ratio)).toBeLessThanOrEqual(2 * ratio);
      expect(Math.abs(img.height - size.h * ratio)).toBeLessThanOrEqual(2 * ratio);
      expect(img.corner).toEqual([15, 17, 21, 255]);
      const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 14);
      for (const p of img.px) expect(near(p, [229, 83, 75])).toBe(true); // --ck-playoffs, in West and in East
      // both tables, whole, inside the image
      for (const t of tables) {
        expect(t.right * ratio).toBeLessThanOrEqual(img.width + ratio);
        expect(t.bottom * ratio).toBeLessThan(img.height);
      }
    });

  test('the view’s code loads only when it (or the popup) is opened', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => /Standings/.test(r.url()) && chunks.push(r.url()));
    await page.goto(`${APP}?view=league&layout=list`);
    await expect(destination(page, 'Standings')).toBeVisible();
    await pickScope(page, 'Boston Celtics');
    expect(chunks).toEqual([]);
    await destination(page, 'Standings').click();
    await expect(page.getByTestId('standings-table').first()).toBeVisible();
    expect(chunks.length).toBeGreaterThan(0);
  });
});

test.describe('Standings fit the window', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'fixed window sizes: one desktop project is enough'));
  for (const size of [{ width: 1600, height: 1000 }, { width: 1920, height: 950 }])
    for (const set of Object.keys(SETS) as SetKey[])
      test(`${size.width}×${size.height}, ${SET_LABEL[set]}: West and East side by side, 15 rows each, no scroll, one line per row, text not shrunk`, async ({ page }) => {
        await page.setViewportSize(size);
        await openStandings(page, set);
        await page.evaluate(() => document.fonts.ready);
        // the longest team name in the league in each table's first row, and a clinch marker in every row (the widest a name cell gets)
        await page.evaluate(() => {
          for (const t of document.querySelectorAll('[data-testid="standings-table"]')) t.querySelector('tbody tr .ck-st-name')!.textContent = 'Minnesota Timberwolves';
          for (const r of document.querySelectorAll('[data-testid="standings-table"] tbody .ck-st-teamcell')) {
            if (r.querySelector('.ck-st-clinch')) continue;
            const m = document.createElement('span');
            m.className = 'ck-st-clinch';
            m.textContent = 'pi';
            r.append(m);
          }
        });
        const r = await page.evaluate(() => {
          const ts = [...document.querySelectorAll<HTMLElement>('[data-testid="standings-table"]')];
          const cap = document.querySelector<HTMLElement>('[data-testid="standings-capture"]')!;
          const rows = ts.flatMap((t) => [...t.querySelectorAll<HTMLElement>('tbody tr')]);
          const cells = ts.flatMap((t) => [...t.querySelectorAll<HTMLElement>('td, th')]);
          const box = ts.map((t) => t.getBoundingClientRect());
          return {
            rows: ts.map((t) => t.querySelectorAll('tbody tr').length),
            sideBySide: box[0]!.right <= box[1]!.left && Math.abs(box[0]!.top - box[1]!.top) <= 1,
            inWindow: box.every((b) => b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight),
            pageScroll: document.documentElement.scrollHeight - innerHeight,
            pageScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            tableScrollX: Math.max(cap.scrollWidth - cap.clientWidth, cap.parentElement!.scrollWidth - cap.parentElement!.clientWidth),
            rowHeights: [...new Set(rows.map((x) => Math.round(x.getBoundingClientRect().height)))],
            multiLine: cells.filter((c) => [...c.querySelectorAll<HTMLElement>('span, button, a')].concat(c).some((e) => e.getClientRects().length > 1 || (e.textContent && e.getBoundingClientRect().height > 26 && e.tagName !== 'TD' && e.tagName !== 'TH'))).map((c) => c.textContent),
            cellFont: [...new Set(rows.flatMap((x) => [...x.querySelectorAll('td')].map((c) => getComputedStyle(c).fontSize)))],
            headFont: [...new Set(ts.flatMap((t) => [...t.querySelectorAll('thead th:not(.ck-st-conf)')].map((c) => getComputedStyle(c).fontSize)))],
            confFont: [...new Set(ts.map((t) => getComputedStyle(t.querySelector('.ck-st-conf')!).fontSize))],
            nameWidth: Math.min(...ts.map((t) => t.querySelector('tbody .ck-st-name')!.getBoundingClientRect().width)),
          };
        });
        expect(r.rows).toEqual([15, 15]);
        expect(r.sideBySide).toBe(true);
        expect(r.inWindow).toBe(true);
        expect(r.pageScroll).toBeLessThanOrEqual(0);
        expect(r.pageScrollX).toBeLessThanOrEqual(0);
        expect(r.tableScrollX).toBeLessThanOrEqual(0);
        expect(r.rowHeights).toEqual([30]);
        expect(r.multiLine).toEqual([]);
        expect(r.cellFont).toEqual(['13px']);
        expect(r.headFont).toEqual(['11px']);
        expect(r.confFont).toEqual(['13px']);
        expect(r.nameWidth).toBeGreaterThan(140);
        await page.screenshot({ path: `test-output/standings-${set}-${size.width}x${size.height}.png` });
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
  { name: 'Cup schedule', url: '?view=cup', marker: '[data-testid="cup-board"]', then: (p) => p.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click() },
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
  await expect(destination(page, 'Schedule')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Standings' })).toHaveCount(0);
  await expect(page.getByTestId('standings-button')).toHaveCount(0);
  await expect(page.getByTestId('standings-table')).toHaveCount(0);
});
