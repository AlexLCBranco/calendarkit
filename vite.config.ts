import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Time-zone-sensitive tests run once per zone. The zone is set here (process.env.TZ in the test workers), not by
// a shell prefix, so `npm test` behaves the same on Windows, Linux and CI.
const TIME_ZONES = ['America/New_York', 'America/Sao_Paulo'];
const TZ_TESTS = ['tests/**/*.tz.test.ts', 'tests/**/*.tz.test.tsx'];

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts'], exclude: TZ_TESTS, env: { TZ: 'UTC' } } },
      ...TIME_ZONES.map((tz) => ({ extends: true, test: { name: `tz:${tz}`, include: TZ_TESTS, env: { TZ: tz } } })),
    ],
  },
});
