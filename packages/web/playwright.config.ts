import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  // On CI a flaky run gets one more go, and the report is kept for the failed-run artifact.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:5199' },
  projects: [
    // The room test runs once, on desktop: it plays at real speed and makes a room.
    { name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: 'online.spec.ts' },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // The rooms server. Its routes answer 404 until a room exists, so wait for the port instead of a URL.
      command: 'npm run dev -w @ludo/server -- --port 8787',
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
