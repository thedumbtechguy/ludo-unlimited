import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  // On CI a flaky run gets one more go, and the report is kept for the failed-run artifact.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:5199' },
  projects: [
    // The room tests run once, on desktop: they play at real speed and make rooms, and two runs would match into each other's.
    { name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: ['online.spec.ts', 'quick.spec.ts'] },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // The rooms server. Its routes answer 404 until a room exists, so wait for the port instead of a URL.
      // It starts with empty state each run: wrangler keeps rooms, open listings and rate limits on disk.
      command: 'rm -rf packages/server/.wrangler/e2e && npm run dev -w @ludo/server -- --port 8787 --persist-to .wrangler/e2e',
      port: 8787,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --port 5199 --strictPort',
      url: 'http://localhost:5199',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
