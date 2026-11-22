// The team calendar's Month range against the built app, on the owner's window (1920 × 855): the line above the grid
// (CK-38), the four-line cells (CK-39), TV cells with the Slate's look (CK-40), logos without their disc on every
// page (CK-41) and the "Fatigue info" switch (CK-42). The rule over all of them: the page never scrolls, in a 5-week
// and in a 6-week month, and no line of a cell wraps.
import { expect, test, type Page } from './fixtures';
import { APP } from './app';

const DAY = '2026-11-22';
const LAKERS = '?view=team&layout=calendar&team=LAL';
/** January 2027 starts on a Friday: six week rows. */
const SIX_WEEKS = '2027-01-10';

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-xl', "the owner's window only");
  await page.setViewportSize({ width: 1920, height: 855 });
  await page.clock.setFixedTime(new Date(`${DAY}T15:00:00Z`));
});

const open = async (page: Page, search = LAKERS, date = DAY) => {
  await page.goto(`${APP}${search}&date=${date}&on=${date}`);
  await expect(page.locator('.ck-team-grid [data-game-id], .ck-llist, .ck-slate-card, [data-testid="standings"], [data-testid="cup-group"], .ck-week-view').first()).toBeVisible();
  await page.waitForTimeout(250); // the probe's scale
};
const fatigueOff = (page: Page) => page.addInitScript(() => localStorage.setItem('ck:fatigue:v1', 'off'));

/** The month's cells, measured: what must hold in every one of them. */
const cells = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('.ck-team-grid')!;
    const box = (e: Element) => e.getBoundingClientRect();
    const px = (e: Element) => parseFloat(getComputedStyle(e).fontSize) * (parseFloat(getComputedStyle(e.closest('.ck-card')!).zoom) || 1);
    const cards = [...grid.querySelectorAll<HTMLElement>('.ck-day-cell .ck-mcell')].map((card) => {
      const cell = box(card.closest('.ck-day-cell')!);
      const lines = [...card.children].filter((e) => !e.matches('.ck-open'));
      return {
        date: card.closest<HTMLElement>('.ck-day-cell')!.dataset.date!,
        kinds: lines.map((e) => (e.matches('.ck-mc-top') ? 'top' : e.matches('.ck-matchup') ? 'match' : (e as HTMLElement).dataset.testid)),
        // one line each: every piece of a line is on the same row (its centre within the line's own height)
        wraps: lines.filter((line) => {
          const parts = [...line.querySelectorAll(':scope > *, :scope > .ck-teams > .ck-side > *')].map(box).filter((r) => r.width > 0);
          const mid = parts.map((r) => r.top + r.height / 2);
          return Math.max(...mid) - Math.min(...mid) > 6;
        }).length,
        spareRight: cell.right - Math.max(...lines.map((e) => box(e).right)),
        spareBottom: cell.bottom - Math.max(...lines.map((e) => box(e).bottom)),
        team: px(card.querySelector('.ck-matchup .ck-team')!),
        time: px(card.querySelector('.ck-time')!),
        gaps: [...card.querySelectorAll('.ck-matchup .ck-side')].flatMap((side) => {
          const kids = [...side.children].map(box);
          return kids.slice(1).map((r, i) => Math.round((r.left - kids[i]!.right) * 10) / 10);
        }),
        final: card.classList.contains('ck-card-final'),
      };
    });
    return { weeks: Number(grid.dataset.weeks), scale: Number(grid.dataset.scale), doc: document.documentElement.scrollHeight, win: window.innerHeight, wide: document.documentElement.scrollWidth - window.innerWidth, cards };
  });

for (const [name, date, weeks] of [
  ['a 5-week month', DAY, 5],
  ['a 6-week month', SIX_WEEKS, 6],
] as const) {
  for (const fatigue of [true, false]) {
    test(`${name}, fatigue info ${fatigue ? 'on' : 'off'}: no page scroll, no line wraps, nothing touches a cell's edge`, async ({ page }) => {
      if (!fatigue) await fatigueOff(page);
      await open(page, LAKERS, date);
      const m = await cells(page);
      expect(m.weeks).toBe(weeks);
      expect(m.cards.length).toBeGreaterThan(8);
      expect(m.doc, 'no vertical scroll').toBeLessThanOrEqual(m.win);
      expect(m.wide).toBeLessThanOrEqual(0);
      for (const c of m.cards) {
        expect(c.wraps, `${c.date}: a line wraps`).toBe(0);
        expect(c.spareRight, `${c.date}: room on the right`).toBeGreaterThanOrEqual(3);
        expect(c.spareBottom, `${c.date}: room below`).toBeGreaterThanOrEqual(3);
        // time first, the matchup second; then at most one line per team, the calendar's team first
        expect(c.kinds.slice(0, 2)).toEqual(['top', 'match']);
        expect(fatigue ? c.kinds.slice(2).every((k, i, a) => (k === 'team-line' || k === 'opp-line') && a.indexOf(k) === i) : c.kinds.length === 2, `${c.date}: ${c.kinds}`).toBe(true);
        if (fatigue) expect(c.kinds.indexOf('team-line')).toBeLessThanOrEqual(2);
        // the matchup is the cell's biggest text, and its pieces are one equal gap apart
        expect(c.team).toBeGreaterThan(c.time * 1.1);
        expect(Math.max(...c.gaps) - Math.min(...c.gaps), `${c.date}: gaps ${c.gaps}`).toBeLessThanOrEqual(1);
      }
      await page.screenshot({ path: `test-output/team-month/${weeks}w-${fatigue ? 'on' : 'off'}.png` });
    });
  }
}

test('sizes at the owner\'s window: matchup about 14.6 px with fatigue info, about 16.8 px without; a 6-week month only as small as it needs', async ({ page, browser }) => {
  await open(page);
  const on = await cells(page);
  expect(on.cards[0]!.team).toBeGreaterThanOrEqual(13.6);
  expect(on.cards[0]!.team).toBeLessThanOrEqual(15.6);
  await open(page, LAKERS, SIX_WEEKS);
  const six = await cells(page);
  expect(six.scale).toBeLessThan(on.scale);
  expect(six.cards[0]!.team).toBeGreaterThanOrEqual(10.5); // still readable
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 855 }, timezoneId: 'America/Sao_Paulo' });
  const p2 = await ctx.newPage();
  await p2.clock.setFixedTime(new Date(`${DAY}T15:00:00Z`));
  await p2.addInitScript((day) => {
    localStorage.setItem('ck:fatigue:v1', 'off');
    (window as unknown as { __ckOpenDate?: string }).__ckOpenDate = day;
  }, DAY);
  await p2.goto(`${APP}${LAKERS}`);
  await expect(p2.locator('.ck-team-grid .ck-mcell').first()).toBeVisible();
  await p2.waitForTimeout(250);
  const off = await cells(p2);
  expect(off.cards[0]!.team).toBeGreaterThanOrEqual(15.8);
  expect(off.cards[0]!.team).toBeLessThanOrEqual(17.8);
  expect(off.scale).toBeGreaterThan(on.scale);
  await ctx.close();
});

test('the line above the grid: sizes, the month centred over the grid, each piece highlights and opens what it names', async ({ page }) => {
  await open(page);
  const head = page.getByTestId('team-month-head');
  const m = await page.evaluate(() => {
    const css = (id: string) => {
      const e = document.querySelector(`[data-testid="${id}"]`)!;
      const s = getComputedStyle(e);
      return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight), cursor: s.cursor, text: e.textContent, box: e.getBoundingClientRect().toJSON() as DOMRect };
    };
    const grid = document.querySelector('.ck-team-grid')!.getBoundingClientRect();
    const head = document.querySelector('[data-testid="team-month-head"]')!.getBoundingClientRect();
    const bar = document.querySelector('[data-testid="top-bar"]')!.getBoundingClientRect();
    const weekdays = document.querySelector('.ck-team-month .ck-grid-head')!.getBoundingClientRect();
    return { team: css('tmh-team'), rec: css('tmh-record'), pos: css('tmh-place'), month: css('tmh-month'), gridMid: grid.left + grid.width / 2, between: head.top >= bar.bottom - 1 && head.bottom <= weekdays.top + 1, picker: document.querySelector('[data-testid="team-picker"] .ck-sr')!.textContent };
  });
  expect(m.between).toBe(true);
  expect([m.team.size, m.team.weight]).toEqual([34, 800]);
  expect(m.rec.size).toBe(24);
  expect(m.pos.size).toBe(18);
  expect([m.month.size, m.month.weight]).toEqual([26, 700]);
  expect(m.team.text).toBe(m.picker);
  expect(m.rec.text).toMatch(/^\d+-\d+$/);
  expect(m.pos.text).toMatch(/^\d+(st|nd|rd|th) (West|East)$/);
  expect(m.month.text).toBe('November 2026');
  // left to right: name, record, place; the month centred over the grid
  expect(m.team.box.right).toBeLessThanOrEqual(m.rec.box.left);
  expect(m.rec.box.right).toBeLessThanOrEqual(m.pos.box.left);
  expect(Math.abs(m.month.box.left + m.month.box.width / 2 - m.gridMid)).toBeLessThanOrEqual(2);
  for (const id of ['tmh-team', 'tmh-record', 'tmh-place', 'tmh-month']) {
    const part = head.getByTestId(id);
    await part.hover();
    await expect(part).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.09)');
    await expect(part).toHaveCSS('cursor', 'pointer');
    expect(await part.getAttribute('title')).toBeTruthy();
  }
  // the record and the place are the Standings page's own
  const rec = m.rec.text!;
  await head.getByTestId('tmh-team').click();
  await expect(page.getByTestId('team-picker-list')).toBeVisible();
  await page.keyboard.press('Escape');
  await head.getByTestId('tmh-month').click();
  await expect(page.getByTestId('date-picker')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /next month/i }).first().click();
  await expect(head.getByTestId('tmh-month')).toHaveText('December 2026');
  await head.getByTestId('tmh-place').click();
  await expect(page.getByTestId('standings')).toBeVisible();
  const row = page.locator('[data-testid="standings-table"] tr', { hasText: 'Los Angeles Lakers' }).first();
  const [w, l] = rec.split('-');
  await expect(row).toContainText(w!);
  await expect(row).toContainText(l!);
  await page.goBack();
  await expect(page.getByTestId('team-month-head')).toBeVisible();
  await page.getByTestId('tmh-record').click();
  await expect(page.getByTestId('standings')).toBeVisible();
});

test('TV cells look like the Slate\'s TV cards; today\'s TV cell keeps its blue outline and takes the tint', async ({ page }) => {
  await open(page);
  const tv = page.locator('.ck-team-grid .ck-cell-tv');
  expect(await tv.count()).toBeGreaterThan(0);
  const look = (el: Element) => {
    const s = getComputedStyle(el);
    return { shadow: s.boxShadow, image: s.backgroundImage, color: s.backgroundColor };
  };
  const cell = await tv.first().evaluate(look);
  // every TV cell has the TV chip, every cell with the chip is a TV cell; finished games too
  expect(await page.locator('.ck-team-grid .ck-day-cell:not(.ck-cell-tv) [data-testid="tv-badge"]').count()).toBe(0);
  expect(await page.locator('.ck-team-grid .ck-cell-tv [data-testid="tv-badge"]').count()).toBe(await tv.count());
  expect(await page.locator('.ck-team-grid .ck-cell-tv.ck-cell-past').count()).toBeGreaterThan(0);
  // the Slate's own TV card, on the same page build
  await open(page, '?view=league&layout=slate', '2026-11-27');
  const card = await page.locator('.ck-slate-card.ck-slate-tv').first().evaluate(look);
  expect(cell).toEqual(card);
  expect(cell.shadow).toContain('inset');
  expect(cell.image).toContain('linear-gradient');
  // Nov 27 (LAL @ SAS, national TV) as today: the blue outline, with the tint
  await page.clock.setFixedTime(new Date('2026-11-27T15:00:00Z'));
  await open(page, LAKERS, '2026-11-27');
  const today = page.locator('.ck-team-grid .ck-cell-today');
  await expect(today).toHaveClass(/ck-cell-tv/);
  const t = await today.evaluate(look);
  const plain = await page.locator('.ck-team-grid .ck-day-cell:not(.ck-cell-tv):not(.ck-cell-today)').first().evaluate(look);
  expect(t.image).toBe(cell.image);
  expect(t.shadow).not.toBe(cell.shadow);
  expect(t.shadow).toContain('1px');
  expect(plain.image).toBe('none');
});

test('the opponent\'s record shows on hover of the matchup and of its tricode, not in the cell', async ({ page }) => {
  await open(page);
  const card = page.locator('.ck-team-grid .ck-mcell.ck-card-final').first();
  const opp = (await card.locator('.ck-opp').textContent())!.trim();
  const title = await card.locator('.ck-opp').getAttribute('title');
  expect(title).toMatch(new RegExp(`^${opp} record: \\d+-\\d+$`));
  expect(await card.locator('.ck-teams').getAttribute('title')).toBe(title);
  expect(await card.textContent()).not.toContain(title!.split(': ')[1]!);
});

test('"Fatigue info" in Options: off hides the team lines and the text grows; a reload remembers it', async ({ page }) => {
  await open(page);
  const before = await cells(page);
  await page.getByTestId('options-button').click();
  const sw = page.getByRole('checkbox', { name: 'Fatigue info' });
  await expect(sw).toBeChecked();
  await sw.uncheck();
  await expect(page.locator('.ck-team-grid .ck-mc-line')).toHaveCount(0);
  await page.waitForTimeout(250);
  const off = await cells(page);
  expect(off.cards[0]!.team).toBeGreaterThan(before.cards[0]!.team * 1.08);
  expect(off.cards[0]!.time).toBeGreaterThan(before.cards[0]!.time * 1.08);
  expect(off.doc).toBeLessThanOrEqual(off.win);
  await page.reload();
  await expect(page.locator('.ck-team-grid .ck-mcell').first()).toBeVisible();
  await expect(page.locator('.ck-team-grid .ck-mc-line')).toHaveCount(0);
  await page.getByTestId('options-button').click();
  await expect(page.getByRole('checkbox', { name: 'Fatigue info' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Fatigue info' }).check();
  await expect(page.locator('.ck-team-grid [data-testid="team-line"]').first()).toBeVisible();
});

test('the week ranges keep their cells: no month line, no four-line cells, no TV tint', async ({ page }) => {
  await open(page, `${LAKERS}&span=2w`);
  await expect(page.locator('.ck-team-grid [data-game-id]').first()).toBeVisible();
  await expect(page.locator('.ck-mcell, .ck-cell-tv, [data-testid="team-month-head"]')).toHaveCount(0);
  await expect(page.locator('.ck-team-grid .ck-oppline').first()).toBeVisible();
});

// CK-41: every page that shows team logos
const LOGO_PAGES: [string, string][] = [
  ['the team month', LAKERS],
  ['the team list', '?view=team&layout=list&team=SAS'],
  ['the league list', '?view=league&layout=list'],
  ['the league calendar', '?view=league&layout=calendar'],
  ['the Slate', '?view=league&layout=slate'],
  ['the Cup groups', '?view=cup'],
  ['Standings', '?view=standings'],
];
for (const [name, search] of LOGO_PAGES) {
  test(`logos on ${name}: no disc behind them, a light outline, the same slot as before`, async ({ page }) => {
    await open(page, search);
    if (name === 'the team month') await page.getByTestId('team-picker').click(); // the picker's 30 logos too
    const logos = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.ck-logo-backing')]
        .filter((e) => e.offsetParent !== null && e.querySelector('img'))
        .map((e) => {
          const s = getComputedStyle(e);
          const img = e.querySelector('img')!;
          const slot = parseFloat(s.getPropertyValue('--ck-logo'));
          return { bg: s.backgroundColor, image: s.backgroundImage, border: s.borderTopWidth, shadow: s.boxShadow, filter: getComputedStyle(img).filter, slot, w: parseFloat(s.width), imgW: parseFloat(getComputedStyle(img).width) };
        }),
    );
    expect(logos.length).toBeGreaterThanOrEqual(name === 'the team month' ? 40 : 10);
    for (const l of logos) {
      expect(l.bg).toBe('rgba(0, 0, 0, 0)');
      expect(l.image).toBe('none');
      expect(l.border).toBe('0px');
      expect(l.shadow).toBe('none');
      expect(l.filter).toContain('drop-shadow');
      // the disc's slot and the logo inside it, unchanged
      expect(Math.abs(l.w - l.slot)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(l.imgW - l.slot * 0.8)).toBeLessThanOrEqual(0.5);
    }
  });
}

test('a copied image keeps the logo discs', async ({ page }) => {
  await open(page);
  const look = await page.evaluate(() => {
    const cell = document.querySelector<HTMLElement>('.ck-team-grid .ck-cell-game')!;
    cell.classList.add('ck-capturing'); // what "Copy as image" marks the copied node with
    const logo = cell.querySelector('.ck-logo-backing')!;
    const out = { bg: getComputedStyle(logo).backgroundColor, filter: getComputedStyle(logo.querySelector('img')!).filter };
    cell.classList.remove('ck-capturing');
    return out;
  });
  expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(look.filter).toBe('none');
});
