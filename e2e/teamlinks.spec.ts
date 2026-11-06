// Round 15: every team name, logo and tricode is a link to that team's Team view (TeamLink, src/slate/teamLink.tsx),
// against the built app at 1920 × 1080 (every desktop view and the maps fit there). For each view and popup:
//   - every team element on show is a team link (none left plain), the Cup standings' game slots are not;
//   - each link names the right team (its text / label vs the snapshot) and, once pressed, points at that team's Team
//     view in the last-used Team mode on the date being looked at;
//   - a real click on each kind of link opens that Team view here, on that date;
// plus Ctrl- and middle-click (a new tab, this page stays), the last-used Team mode, and hover (pointer, faint tint,
// no underline; none under .ck-capturing, i.e. in images).

import { expect, test, type Locator, type Page } from './fixtures';
import { APP } from './app';
import { clearScope, destination } from './nav';

const NOW = new Date('2026-11-15T15:00:00Z'); // Sun Nov 15, 12:00 in São Paulo (the tests' zone)
const TODAY = '2026-11-15';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'desktop, 1920 px: every view and both maps'));

/** Every element that shows a team (outside the team pickers and the Team view's own header). */
const TEAM_ELEMENTS = '.ck-logo-backing, .ck-team, .ck-mtri, .ck-slate-name, .ck-cup-name, .ck-cup-tri';
const LINK = 'a[data-team-link]';

type Team = { id: number; tri: string; name: string; city: string };

async function open(page: Page, search: string, ready = '[data-game-id], .ck-cup-row') {
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}${search}`);
  await page.waitForSelector(ready);
  await page.evaluate(() => document.fonts.ready);
}

/** The snapshot's teams, by id (independent of the app's code). */
const snapshotTeams = (page: Page) =>
  page.evaluate(async (app) => {
    const raw = await (await fetch(`${app}data/schedule.json`)).json();
    const out: Record<number, { id: number; tri: string; name: string; city: string }> = {};
    for (const d of raw.leagueSchedule.gameDates) for (const g of d.games) for (const t of [g.homeTeam, g.awayTeam]) if (t.teamId) out[t.teamId] = { id: t.teamId, tri: t.teamTricode, name: t.teamName, city: t.teamCity };
    return out;
  }, APP);

/** Team elements on show that are not links (expected: none). */
const plainTeamElements = (page: Page, scope: string) =>
  page.locator(scope).evaluateAll(
    (roots, [sel, link]) =>
      roots.flatMap((r) =>
        [...r.querySelectorAll<HTMLElement>(sel!)]
          .filter((e) => !e.closest('[data-testid="team-picker"], [role="listbox"], .ck-capture-stage'))
          .filter((e) => !(e.closest('[data-testid="team-header"]') && !e.closest('[data-testid="cup-team"]')))
          .filter((e) => e.offsetParent !== null && !e.matches(link!))
          .map((e) => e.outerHTML.slice(0, 120)),
      ),
    [TEAM_ELEMENTS, LINK],
  );

/**
 * A point of the link a click lands on (nothing covers it there), or null when the link is out of view (scrolled out of
 * its list); false: in view but covered everywhere. Sampled on a grid over the link's boxes.
 */
const hitPoint = (a: Element): { x: number; y: number } | null | false => {
  const clip = a.closest<HTMLElement>('[data-select-scroller], .ck-llist')?.getBoundingClientRect();
  const rects = [...a.getClientRects()];
  const inView = rects.some((r) => r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && (!clip || (r.top >= clip.top && r.bottom <= clip.bottom)));
  if (!inView) return null;
  for (const r of rects)
    for (const fy of [0.5, 0.3, 0.7])
      for (const fx of [0.5, 0.2, 0.8, 0.1, 0.9]) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const e = document.elementFromPoint(x, y);
        if (e && a.contains(e)) return { x, y };
      }
  return false;
};

/** Each visible link: its team id, what it shows, and its URL once pressed (the press writes the fresh one). */
const pressedLinks = (page: Page, scope: string) =>
  page.locator(scope).evaluateAll(
    (roots, [link, hitSrc]) =>
      roots.flatMap((r) => {
        const hitPoint = new Function(`return (${hitSrc})`)() as (a: Element) => unknown;
        return [...r.querySelectorAll<HTMLAnchorElement>(link!)]
          .filter((a) => a.getClientRects().length > 0)
          .map((a) => {
            a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2 })); // a right press: no marquee, no click
            return { id: Number(a.dataset.teamLink), text: (a.textContent ?? '').trim(), label: a.getAttribute('aria-label') ?? '', href: a.getAttribute('href')!, hit: hitPoint(a) };
          });
      }),
    [LINK, hitPoint.toString()],
  );

/** Every link names its team and points at its Team view (mode, date). Returns the number of links checked. */
async function checkLinks(page: Page, scope: string, want: { layout: 'list' | 'calendar'; date: string | ((d: string) => boolean) }) {
  const teams = await snapshotTeams(page);
  expect(await plainTeamElements(page, scope), 'team elements that are not links').toEqual([]);
  const links = await pressedLinks(page, scope);
  for (const l of links) {
    const t: Team | undefined = teams[l.id];
    expect(t, `link to unknown team ${l.id}`).toBeTruthy();
    expect(l.hit, `${l.text || l.label}: a link in view that no click reaches`).not.toBe(false);
    const shows = l.text || l.label;
    expect([t!.tri, t!.name, `${t!.city} ${t!.name}`], `link text "${shows}" for ${t!.tri}`).toContain(shows);
    const u = new URL(l.href, 'https://x');
    expect(u.pathname).toBe(APP);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ view: 'team', team: t!.tri, layout: want.layout });
    const on = u.searchParams.get('on')!;
    if (typeof want.date === 'string') expect(on, `date for ${t!.tri}`).toBe(want.date);
    else expect(want.date(on), `date ${on} for ${t!.tri}`).toBe(true);
  }
  return links.length;
}

/** After a team link's plain click: that Team view here, in that mode, showing `date`. */
async function expectTeamView(page: Page, t: Team, layout: 'list' | 'calendar', date: string, title?: string) {
  await expect(page.getByTestId('team-header')).toContainText(`${t.city} ${t.name}`);
  await expect(destination(page, 'Schedule')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('bar-local').getByTestId('team-picker')).toHaveAttribute('data-team-id', String(t.id));
  await expect(page.getByRole('tablist', { name: 'Layout' }).getByRole('tab', { name: layout === 'list' ? 'List' : 'Calendar' })).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).searchParams.get('team')).toBe(t.tri);
  const month = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (layout === 'list') {
    await expect(page.getByTestId('team-month')).toHaveText(month);
    // the row of that date (or the next row after it) is at the top of the list
    await expect
      .poll(() =>
        page.getByTestId('team-list').evaluate((el, date) => {
          const top = el.getBoundingClientRect().top;
          const row = [...el.querySelectorAll<HTMLElement>('.ck-daylist > [data-row-date]')].find((r) => r.getBoundingClientRect().bottom > top + 2);
          return `${row?.dataset.rowDate ?? 'none'} >= ${date}: ${(row?.dataset.rowDate ?? '') >= date}`;
        }, date),
      )
      .toMatch(/: true$/);
  } else {
    await expect(page.getByTestId('period-title')).toHaveText(title ?? month);
  }
}

/** The links matching `kind` (the link itself, or links inside it). */
const linksOf = (page: Page, kind: string) => page.locator(`${LINK}:is(${kind}), :is(${kind}) ${LINK}`).filter({ visible: true });

/** layout: the Team mode the links open (the page's own Team mode when it opened on one, else List). */
const VIEWS: { name: string; search: string; scope: string; layout?: 'calendar'; title?: string; date: string | ((d: string) => boolean); kinds: string[]; prepare?: (p: Page) => Promise<unknown> }[] = [
  { name: 'League List + map', search: '?view=league&layout=list&date=2026-11-16', scope: '[data-testid="league-list"]', date: '2026-11-16', kinds: ['[data-testid="league-list"] .ck-team', '[data-testid="league-list"] .ck-logo-backing'] },
  { name: 'Slate', search: '?view=league&layout=slate&date=2026-11-16', scope: '[data-testid="slate"]', date: '2026-11-16', kinds: ['[data-testid="slate"] .ck-slate-name', '[data-testid="slate"] .ck-logo-backing'] },
  { name: 'League week', search: '?view=league&layout=calendar&date=2026-11-16', scope: '.ck-week-view', date: TODAY, kinds: ['.ck-week-view .ck-mtri', '.ck-week-view .ck-logo-backing'] },
  { name: 'League 2 weeks', search: '?view=league&layout=calendar&weeks=2&date=2026-11-16', scope: '.ck-week-view', date: TODAY, kinds: ['.ck-week-view .ck-mtri'] },
  { name: 'Team List + map', search: '?view=team&layout=list&team=LAL', scope: '[data-testid="team-list"]', date: (d) => d.startsWith('2026-11'), kinds: ['[data-testid="team-list"] .ck-team', '[data-testid="team-list"] .ck-logo-backing'] },
  { name: 'Team Calendar (month)', search: '?view=team&layout=calendar&team=LAL', scope: '.ck-team-grid', layout: 'calendar', date: TODAY, kinds: ['.ck-team-grid .ck-team.ck-opp', '.ck-team-grid .ck-logo-backing'] },
  { name: 'Team Calendar (2 weeks)', search: '?view=team&layout=calendar&team=LAL&span=2w', scope: '.ck-team-grid', layout: 'calendar', title: 'Nov 15 – 28, 2026', date: TODAY, kinds: ['.ck-team-grid .ck-team.ck-opp'] },
  { name: 'Cup standings', search: '?view=cup', scope: '[data-testid="cup"]', date: TODAY, kinds: ['.ck-cup-name', '.ck-cup-row .ck-logo-backing', '.ck-cup-tri'] },
  {
    name: 'Cup schedule, League by group',
    search: '?view=cup',
    scope: '[data-testid="cup-league"]',
    date: TODAY, // no night on show: today
    kinds: ['[data-testid="cup-league"] .ck-team', '[data-testid="cup-league"] .ck-logo-backing'],
    prepare: async (p) => {
      await p.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click();
      await expect(p.getByTestId('cup-board')).toBeVisible();
    },
  },
  {
    name: 'Cup schedule, League by date',
    search: '?view=cup',
    scope: '[data-testid="cup-league"]',
    date: '2026-11-20', // the night on show: the next Cup night after Sun Nov 15
    kinds: ['[data-testid="cup-league"] .ck-team', '[data-testid="cup-league"] .ck-logo-backing'],
    prepare: async (p) => {
      await p.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click();
      await p.getByRole('tablist', { name: 'Cup layout' }).getByRole('tab', { name: 'By date' }).click();
      await expect(p.getByTestId('cup-league')).toHaveAttribute('data-by', 'date');
    },
  },
  {
    name: 'Cup schedule, Team',
    search: '?view=cup',
    scope: '[data-testid="cup-team"]',
    date: TODAY,
    kinds: ['[data-testid="cup-team"] [data-testid="team-header"] .ck-logo-backing', '[data-testid="cup-team"] [data-testid="team-header"] h2', '[data-testid="cup-team"] .ck-team'],
    prepare: async (p) => {
      await p.getByRole('tablist', { name: 'Cup view' }).getByRole('tab', { name: 'Schedule' }).click();
      await p.getByRole('tablist', { name: 'Cup list' }).getByRole('tab', { name: 'Team' }).click();
      await p.getByTestId('team-picker').click();
      await p.getByRole('option', { name: 'Los Angeles Lakers' }).click();
      await expect(p.getByTestId('cup-team')).toBeVisible();
    },
  },
];

test.describe('team links', () => {
  for (const v of VIEWS)
    test(`${v.name}: every team element is a link to its Team view on the shown date; each kind clicks through`, async ({ page }) => {
      await open(page, v.search);
      await v.prepare?.(page);
      const layout = v.layout ?? 'list';
      const n = await checkLinks(page, v.scope, { layout, date: v.date });
      expect(n, 'links checked').toBeGreaterThan(5);
      // a real click on each kind of link: that Team view, in that mode, at the date
      for (const kind of v.kinds) {
        await open(page, v.search);
        await v.prepare?.(page);
        const a = linksOf(page, kind).first();
        const teams = await snapshotTeams(page);
        const t = teams[Number(await a.getAttribute('data-team-link'))]!;
        // scroll first: scrolling the Team List moves the row at the top, i.e. the date the link opens on (the list
        // reports its top row at most every FOLLOW_MS = 120 ms, so let it settle before reading the date)
        await a.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await a.dispatchEvent('pointerdown', { button: 2 });
        const on = new URL((await a.getAttribute('href'))!, 'https://x').searchParams.get('on')!;
        const p = await a.evaluate((el, src) => (new Function(`return (${src})`)() as (e: Element) => { x: number; y: number } | null | false)(el), hitPoint.toString());
        expect(p, `${kind}: a point a click reaches`).toBeTruthy();
        if (!p) return;
        await page.mouse.click(p.x, p.y);
        await expectTeamView(page, t, layout, on, v.title);
        expect(page.url(), 'the date is never kept in the address').not.toContain('on=');
      }
    });

  test('the season-series popup: both tricodes in its title are team links', async ({ page }) => {
    await open(page, '?view=league&layout=slate&date=2026-11-16');
    const chip = page.locator('[data-testid="slate"] [data-testid="series-chip"]').first();
    await chip.hover();
    const pop = page.getByTestId('series-popup');
    await expect(pop).toBeVisible();
    const links = pop.locator('.ck-series-title a[data-team-link]');
    await expect(links).toHaveCount(2);
    expect(await checkLinks(page, '[data-testid="series-popup"]', { layout: 'list', date: '2026-11-16' })).toBe(2);
    const teams = await snapshotTeams(page);
    const t = teams[Number(await links.nth(1).getAttribute('data-team-link'))]!;
    await links.nth(1).hover();
    await links.nth(1).click();
    await expectTeamView(page, t, 'list', '2026-11-16');
  });

  test('the map labels stay plain, click-through text (a link there would take a nearby pin\x27s hover)', async ({ page }) => {
    for (const [search, sel] of <[string, string][]>[['?view=league&layout=list&date=2026-11-16', 'league-map'], ['?view=team&layout=list&team=LAL', 'team-map']]) {
      await open(page, search);
      const codes = page.getByTestId(sel).locator('.ck-map-code');
      await expect(codes.first()).toBeVisible();
      await expect(codes.locator('a')).toHaveCount(0);
      expect(await codes.first().evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
    }
  });

  test('the Cup standings game slots are not team links', async ({ page }) => {
    await open(page, '?view=cup');
    const slots = page.getByTestId('cup-slots');
    expect(await slots.count()).toBeGreaterThan(20);
    await expect(slots.locator('a')).toHaveCount(0);
    await expect(slots.locator('[data-team-link]')).toHaveCount(0);
    // and a click on one goes nowhere
    await slots.first().locator('.ck-cup-slot').first().click();
    await expect(destination(page, 'Cup')).toHaveAttribute('aria-selected', 'true');
  });

  test('the last-used Team mode is respected (Calendar, then List; Slate kept for League)', async ({ page }) => {
    await open(page, '?view=team&layout=calendar&team=LAL');
    await clearScope(page);
    await page.getByRole('tablist', { name: 'Layout' }).getByRole('tab', { name: 'Slate' }).click();
    await page.waitForSelector('[data-testid="slate"] a[data-team-link]');
    const teams = await snapshotTeams(page);
    let a = page.locator('[data-testid="slate"] .ck-slate-name').first();
    let t = teams[Number(await a.getAttribute('data-team-link'))]!;
    await a.dispatchEvent('pointerdown', { button: 2 });
    expect(new URL((await a.getAttribute('href'))!, 'https://x').searchParams.get('layout')).toBe('calendar');
    await a.click();
    await expectTeamView(page, t, 'calendar', TODAY);
    // List now, then back to League: Slate is still League's layout, and a team link opens the List
    await page.getByRole('tablist', { name: 'Layout' }).getByRole('tab', { name: 'List' }).click();
    await clearScope(page);
    await page.getByRole('tablist', { name: 'Layout' }).getByRole('tab', { name: 'Slate' }).click();
    a = page.locator('[data-testid="slate"] .ck-slate-name').nth(1);
    t = teams[Number(await a.getAttribute('data-team-link'))]!;
    await a.click();
    await expectTeamView(page, t, 'list', TODAY);
    await clearScope(page);
    await expect(page.getByTestId('slate')).toBeVisible();
  });

  for (const how of ['ctrl', 'middle'] as const)
    test(`${how}-click opens the Team view in a new tab (on the shown date); this page stays`, async ({ page, context }) => {
      await open(page, '?view=league&layout=list&date=2026-11-16');
      const teams = await snapshotTeams(page);
      const a = page.locator('[data-testid="league-list"] .ck-team').first();
      const t = teams[Number(await a.getAttribute('data-team-link'))]!;
      const before = page.url();
      const [tab, req] = await Promise.all([context.waitForEvent('page'), context.waitForEvent('request', (r) => r.isNavigationRequest() && r.url().includes('view=team')), how === 'ctrl' ? a.click({ modifiers: ['ControlOrMeta'] }) : a.click({ button: 'middle' })]);
      await tab.clock.setFixedTime(NOW);
      await tab.waitForLoadState();
      const u = new URL(req.url()); // as opened (the app drops on= from the address once read)
      expect(Object.fromEntries(u.searchParams)).toMatchObject({ view: 'team', team: t.tri, layout: 'list', on: '2026-11-16' });
      await tab.waitForSelector('[data-testid="team-list"] [data-row-date]');
      await expectTeamView(tab, t, 'list', '2026-11-16');
      expect(tab.url(), 'on= is dropped once read: a reload opens on today').not.toContain('on=');
      await tab.close();
      expect(page.url()).toBe(before);
      await expect(page.getByTestId('league-list')).toBeVisible();
    });

  test('hover: pointer and a faint tint, no underline (also inside a game link); nothing under .ck-capturing', async ({ page }) => {
    // a List row (round 16: no game link around it) and a week line (inside the matchup game link)
    for (const [search, sel, inGame] of [
      ['?view=league&layout=list&date=2026-11-16', '[data-testid="league-list"] .ck-teams .ck-team', false],
      ['?view=league&layout=calendar&date=2026-11-16', '.ck-mline.ck-mlink .ck-mtri', true],
    ] as const) {
      await open(page, search);
      const a = page.locator(sel).first();
      expect(await a.evaluate((e) => !!e.closest('.ck-mlink')), search).toBe(inGame);
      const style = (l: Locator) => l.evaluate((e) => ({ cursor: getComputedStyle(e).cursor, shadow: getComputedStyle(e).boxShadow, deco: getComputedStyle(e.closest('.ck-mlink') ?? e).textDecorationLine, own: getComputedStyle(e).textDecorationLine }));
      await page.mouse.move(2, 2);
      expect((await style(a)).shadow).toBe('none');
      await a.hover();
      const on = await style(a);
      expect(on.cursor).toBe('pointer');
      expect(on.shadow).not.toBe('none');
      expect(on.deco).toBe('none');
      expect(on.own).toBe('none');
      await page.evaluate(() => document.querySelector('.ck-root')!.classList.add('ck-capturing'));
      expect((await style(a)).shadow).toBe('none');
    }
  });
});
