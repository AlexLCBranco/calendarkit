// Probe: can a real browser page on a non-nba.com origin fetch the schedule feed? (Node ignores CORS, so use Chromium.)
// Usage: npx tsx scripts/probe-cors.ts [pageUrl]   (default: a throwaway page served on http://localhost:4180)
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { SCHEDULE_URL } from '../src/shared/nba-schedule/parse';

const server = createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>probe</title>'));
await new Promise<void>((r) => server.listen(4180, r));
const pageUrl = process.argv[2] ?? 'http://localhost:4180/';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('console:', m.text()));
await page.goto(pageUrl);
const result = await page.evaluate(async (url) => {
  try {
    const r = await fetch(url);
    const text = await r.text();
    return { ok: r.ok, status: r.status, bytes: text.length };
  } catch (e) {
    return { error: String(e) };
  }
}, SCHEDULE_URL);
console.log('page', pageUrl, '→', JSON.stringify(result));
const resp = await page.request.get(SCHEDULE_URL, { headers: { Origin: new URL(pageUrl).origin } });
console.log('same request outside CORS: status', resp.status(), 'ACAO', resp.headers()['access-control-allow-origin']);
await browser.close();
server.close();
