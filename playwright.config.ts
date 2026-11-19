import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E tests run against an isolated stack:
 *  - API on :8790 with a fresh in-memory database (re-seeded every run)
 *  - Vite dev server on :5180 proxying /api to that API
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ar-KW',
    timezoneId: 'Asia/Kuwait',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } }, testIgnore: /responsive.spec.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'npx tsx apps/api/src/server.ts',
      url: 'http://127.0.0.1:8790/api/health',
      env: { API_PORT: '8790', PGLITE_DATA_DIR: '', CORS_ORIGINS: 'http://127.0.0.1:5180', RATE_LIMIT_PER_MINUTE: '2000' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'npx vite apps/web --port 5180 --host 127.0.0.1 --strictPort',
      url: 'http://127.0.0.1:5180',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:8790' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
