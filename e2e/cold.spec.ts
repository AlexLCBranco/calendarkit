// CK-16: the cold-weather flag. One live check that Open-Meteo answers for one arena (Target Center, Minneapolis,
// from src/data/arenas.ts); the flag on /calendar's Slate with Open-Meteo's answer stubbed (real weather changes).

import { expect, test } from './fixtures';
import { ARENAS } from '../src/data/arenas';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-xl', 'once'));

test('live: Open-Meteo answers feels-like hours for one arena', async ({ request }) => {
  const a = ARENAS.find((x) => x.arena === 'Target Center')!;
  const r = await request.get(`https://api.open-meteo.com/v1/forecast?latitude=${a.lat}&longitude=${a.lon}&hourly=apparent_temperature&timezone=GMT&forecast_days=2`);
  expect(r.ok()).toBe(true);
  const j = (await r.json()) as { hourly: { time: string[]; apparent_temperature: number[] } };
  expect(j.hourly.time.length).toBeGreaterThanOrEqual(24);
  expect(j.hourly.apparent_temperature.filter((t) => typeof t === 'number').length).toBeGreaterThanOrEqual(24);
});

test('a night where every arena is −15 °C feels-like: each card\'s button is "❄", the pop-up gives the temperature and the credit', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', async (route) => {
    const n = new URL(route.request().url()).searchParams.get('latitude')!.split(',').length;
    const hours = Array.from({ length: 72 }, (_, i) => new Date(Date.parse('2026-11-16T00:00:00Z') + i * 3_600_000).toISOString().slice(0, 16));
    const one = { hourly: { time: hours, apparent_temperature: hours.map(() => -15) } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(n === 1 ? one : Array(n).fill(one)) });
  });
  await page.clock.setFixedTime(new Date('2026-11-16T15:00:00Z'));
  await page.goto('?view=league&layout=slate&date=2026-11-16');
  await expect(page.locator('.ck-slate-card').first()).toBeVisible();
  const buttons = page.getByTestId('game-menu');
  await expect(buttons.first()).toHaveText('❄');
  await buttons.first().click();
  await expect(page.getByTestId('cold-line')).toContainText('Feels like −15 °C at tip-off');
  await expect(page.getByTestId('cold-line')).toContainText('Weather data by Open-Meteo.com');
});

test('a mild night: no mark anywhere', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.clock.setFixedTime(new Date('2026-11-16T15:00:00Z'));
  await page.goto('?view=league&layout=slate&date=2026-11-16');
  await expect(page.locator('.ck-slate-card').first()).toBeVisible();
  await expect(page.getByText('❄')).toHaveCount(0);
});
