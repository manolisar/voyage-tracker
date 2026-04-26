// Playwright config for the v8 e2e suite.
//
// The app uses the File System Access API and a per-ship network folder. Tests
// stub `window.showDirectoryPicker` with the OPFS (Origin Private File System)
// so the same `FileSystemDirectoryHandle` interface is exercised end-to-end —
// no native OS dialogs, no folder mocking adapter.
//
// Vite's dev server is auto-started by Playwright via `webServer` and reused
// across tests. The default base URL targets the GitHub Pages build path
// because the app's vite.config sets `base: '/voyage-tracker/'`.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // The flow has many state-mutating steps; do not run tests in parallel.
  // (Each test still runs in its own browser context with a fresh OPFS.)
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://localhost:5173/voyage-tracker/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/voyage-tracker/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
