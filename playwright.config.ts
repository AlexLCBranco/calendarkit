import { defineConfig, devices } from '@playwright/test';

// Runs against the production build served by `vite preview` (same files Vercel serves).
// Set E2E_BASE_URL to run the same tests against a deployed site.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4174';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 2,
  reporter: [['list']],
  use: { baseURL, trace: 'off', timezoneId: 'America/Sao_Paulo' },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run build && npm run preview', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
});
