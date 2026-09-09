import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, expect: { timeout: 10000 }, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'pnpm dev:api', url: 'http://127.0.0.1:3100/api/health', reuseExistingServer: false, timeout: 60000 },
    { command: 'pnpm dev:web', url: 'http://localhost:5173', reuseExistingServer: false, timeout: 60000 },
  ],
});
