import { defineConfig } from '@playwright/test';

const deployed = process.env.E2E_BASE_URL;
const baseURL = deployed || 'http://127.0.0.1:4178';

export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    viewport: { width: 1440, height: 1000 },
    permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--auto-select-desktop-capture-source=Entire screen',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: deployed
    ? undefined
    : {
        command: 'node server/index.mjs',
        env: { PORT: '4178' },
        url: baseURL + '/health',
        reuseExistingServer: false,
      },
});
