// Cup view (round 11): the NBA Cup group standings from the served snapshot — opened from the View switch (desktop
// only), a 3 × 2 grid of group cards (West over East), every team's W / L / DIFF equal to sums worked out here from the
// snapshot's finished group games, one ★ per group and one WC per conference, the panels, the copy (the grid, not the
// panels), and the Cup's code loaded only when the view is opened.

import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

const OUT = 'test-output/copy-images';
const desktop = (name: string) => ['desktop', 'desktop-xl'].includes(name);

type RawTeam = { teamId: number; teamTricode: string; score: number };
type RawGame = { gameDateEst: string; gameStatus: number; gameSubtype: string; gameSubLabel: string; awayTeam: RawTeam; homeTeam: RawTeam };

/** Per tricode: W, L, DIFF from the snapshot's finished group games (Oct 30 – Nov 27), and the last such date. */
const snapshotTable = (page: Page) =>
  page.evaluate(async (app) => {
    const raw = await (await fetch(`${app}data/schedule.json`)).json();
    const t: Record<string, { w: number; l: number; diff: number; group: string }> = {};
    let through = '';
    for (const d of raw.leagueSchedule.gameDates as { games: RawGame[] }[])
      for (const g of d.games) {
        if (g.gameSubtype !== 'in-season') continue;
        for (const s of [g.homeTeam, g.awayTeam]) t[s.teamTricode] ??= { w: 0, l: 0, diff: 0, group: g.gameSubLabel };
        const date = g.gameDateEst.slice(0, 10);
        if (g.gameStatus !== 3 || date < '2026-10-30' || date > '2026-11-27') continue;
        through = date > through ? date : through;
        const h = t[g.homeTeam.teamTricode]!;
        const a = t[g.awayTeam.teamTricode]!;
        const m = g.homeTeam.score - g.awayTeam.score;
        h.diff += m;
        a.diff -= m;
        if (m > 0) (h.w++, a.l++);
        else (a.w++, h.l++);
      }
    return { teams: t, through };
  }, APP);

async function openCup(page: Page) {
  await page.goto(`${APP}?view=league&layout=list`);
  await page.getByRole('tab', { name: 'Cup' }).click();
  await expect(page.getByTestId('cup-group')).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
}

test.describe('Cup view', () => {
  test.beforeEach(({}, info) => test.skip(!desktop(info.project.name), 'desktop only'));

  test('3 × 2 group cards with every team’s W, L and DIFF from the snapshot; markers; panels', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await openCup(page);
    await expect(page).toHaveURL(/view=cup/);

    const cards = await page.getByTestId('cup-group').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { group: e.getAttribute('data-group')!, x: Math.round(r.left), y: Math.round(r.top), header: e.querySelector('.ck-cup-cols')!.textContent };
      }),
    );
    // top row West A/B/C left to right, bottom row East A/B/C under them
    expect(cards.map((c) => c.group)).toEqual(['West Group A', 'West Group B', 'West Group C', 'East Group A', 'East Group B', 'East Group C']);
    expect(new Set(cards.slice(0, 3).map((c) => c.y)).size).toBe(1);
    expect(new Set(cards.slice(3).map((c) => c.y)).size).toBe(1);
    expect(cards[3]!.y).toBeGreaterThan(cards[0]!.y);
    expect(cards[0]!.x).toBeLessThan(cards[1]!.x);
    expect(cards[1]!.x).toBeLessThan(cards[2]!.x);
    for (let i = 0; i < 3; i++) expect(cards[i + 3]!.x).toBe(cards[i]!.x);
    expect(cards.map((c) => c.header)).toEqual(['WEST AWLDIFF', 'WEST BWLDIFF', 'WEST CWLDIFF', 'EAST AWLDIFF', 'EAST BWLDIFF', 'EAST CWLDIFF']);

    const pills = await page.locator('.ck-cup-pill').evaluateAll((els) =>
      els.map((e) => {
        const nums = [...e.querySelectorAll('.ck-cup-num')].map((n) => n.textContent);
        return {
          tri: e.getAttribute('data-team')!,
          group: e.closest('[data-group]')!.getAttribute('data-group')!,
          status: e.getAttribute('data-status'),
          mark: e.querySelector('.ck-cup-mark')!.textContent,
          w: Number(nums[0]),
          l: Number(nums[1]),
          diff: e.querySelector('.ck-cup-chip')!.textContent!.replace('−', '-').replace('+', ''),
          chip: e.querySelector('.ck-cup-chip')!.className,
          logo: (e.querySelector('img') as HTMLImageElement | null)?.naturalWidth ?? 0,
          name: e.querySelector('.ck-cup-name')!.scrollWidth <= e.querySelector('.ck-cup-name')!.clientWidth,
          bg: getComputedStyle(e).backgroundImage,
        };
      }),
    );
    const snap = await snapshotTable(page);
    expect(pills).toHaveLength(30);
    for (const p of pills) {
      const s = snap.teams[p.tri]!;
      expect({ tri: p.tri, group: p.group, w: p.w, l: p.l, diff: Number(p.diff) }).toEqual({ tri: p.tri, group: s.group, w: s.w, l: s.l, diff: s.diff });
      expect(p.chip).toContain(s.diff > 0 ? 'ck-cup-pos' : s.diff < 0 ? 'ck-cup-neg' : 'ck-cup-zero');
      expect(p.logo, `${p.tri} logo loaded`).toBeGreaterThan(0);
      expect(p.name, `${p.tri} name not cut off`).toBe(true);
      expect(p.bg).toContain('gradient');
    }
    // one ★ per group (its first pill), one WC per conference on a 2nd-place pill, a rank number on every other pill
    for (const c of cards) {
      const g = pills.filter((p) => p.group === c.group);
      expect(g[0]!.status).toBe('leader');
      expect(g[0]!.mark).toBe('★');
      g.slice(1).forEach((p, i) => expect(p.mark).toBe(p.status === 'wild-card' ? 'WC' : String(i + 2)));
    }
    const wc = pills.filter((p) => p.status === 'wild-card');
    expect(wc.map((p) => p.group.split(' ')[0])).toEqual(['West', 'East']);
    for (const p of wc) expect(pills.filter((q) => q.group === p.group).indexOf(p)).toBe(1);
    // records go down the group: no team below one with a better record (games over .500)
    for (const c of cards) {
      const net = pills.filter((p) => p.group === c.group).map((p) => p.w - p.l);
      expect(net).toEqual([...net].sort((a, b) => b - a));
    }

    // "Through <last finished group game>"
    const through = new Date(`${snap.through}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    await expect(page.getByTestId('cup-through')).toHaveText(`Through ${through}`);
    await expect(page.getByText('If group play ended today')).toBeVisible();

    // panels: the rules with the OT note; the wild-card race, its holders = the WC pills
    await expect(page.getByTestId('cup-rules')).toContainText('Head-to-head record among the tied teams');
    await expect(page.getByTestId('cup-ot-note')).toContainText('OT games are counted with their final score');
    const holders = await page.locator('.ck-cup-holder').evaluateAll((els) => els.map((e) => e.getAttribute('data-team')));
    expect(holders).toEqual(wc.map((p) => p.tri));
    await expect(page.locator('.ck-cup-race-row')).toHaveCount(6);

    // nothing below the panels is cut off and the page doesn't scroll sideways
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // the League | Team | Cup switch, and back to League
    await page.getByRole('tab', { name: 'League' }).click();
    await expect(page.getByTestId('cup')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('copy as image: the group grid (not the panels) on the clipboard', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openCup(page);
    const grid = await page.getByTestId('cup-grid').boundingBox();
    const button = page.getByTestId('copy-view');
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await button.click();
    await expect(button).toHaveAttribute('data-state', 'copied', { timeout: 60_000 });
    const ratio = Number((await button.getAttribute('data-captured'))!.split('@')[1]);
    const png = await page.evaluate(async () => {
      const item = (await navigator.clipboard.read()).find((i) => i.types.includes('image/png'))!;
      const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    });
    writeFileSync(`${OUT}/${test.info().project.name}-cup.png`, Buffer.from(png, 'base64'));
    const img = await page.evaluate(async (png) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      const colors = new Set<number>();
      for (let i = 0; i < data.length; i += 4 * 97) colors.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
      return { width: bmp.width, height: bmp.height, corner: [...data.subarray(0, 4)], colors: colors.size };
    }, png);
    // the grid's size × the ratio (± 2 px rounding): the panels below it are not in the image
    expect(Math.abs(img.width - grid!.width * ratio)).toBeLessThanOrEqual(2 * ratio);
    expect(Math.abs(img.height - grid!.height * ratio)).toBeLessThanOrEqual(2 * ratio);
    expect(img.corner).toEqual([15, 17, 21, 255]); // the dark page background, opaque
    expect(img.colors).toBeGreaterThan(50); // pills, logos and text drawn, not a blank image
  });

  test('the Cup’s code loads only when the view is opened', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => /CupView/.test(r.url()) && chunks.push(r.url()));
    await page.goto(`${APP}?view=league&layout=list`);
    await expect(page.getByRole('tab', { name: 'Cup' })).toBeVisible();
    await page.getByRole('tab', { name: 'Team' }).click();
    await page.getByRole('tab', { name: 'League' }).click();
    expect(chunks).toEqual([]);
    await page.getByRole('tab', { name: 'Cup' }).click();
    await expect(page.getByTestId('cup-group')).toHaveCount(6);
    expect(chunks.length).toBeGreaterThan(0);
  });
});

test('no Cup view on tablets and phones; a Cup link shows the League view there', async ({ page }, info) => {
  test.skip(desktop(info.project.name), 'tablet and phone only');
  await page.goto(`${APP}?view=cup`);
  await expect(page.getByRole('tab', { name: 'League' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Cup' })).toHaveCount(0);
  await expect(page.getByTestId('cup')).toHaveCount(0);
});
