import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against a running stack with seeded demo data:
 *   docker compose up -d && docker compose exec backend node dist/scripts/seed.js
 *   E2E_BASE_URL=http://localhost:8080 npm run test:e2e
 * (or `npm run dev` + seed, with E2E_BASE_URL=http://localhost:5173)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
});
