import { defineConfig } from '@playwright/test';
import { browserEnvironment } from './support/environment';

const ci = process.env['CI'] === 'true';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: `${browserEnvironment.artifactDir}/results`,
  reporter: [
    ['line'],
    [
      'html',
      { outputFolder: `${browserEnvironment.artifactDir}/html`, open: 'never' },
    ],
    ['json', { outputFile: `${browserEnvironment.artifactDir}/results.json` }],
    ['junit', { outputFile: `${browserEnvironment.artifactDir}/junit.xml` }],
  ],
  use: {
    baseURL: browserEnvironment.controlOrigin,
    ignoreHTTPSErrors: true,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--host-resolver-rules=MAP *.pressly.test 127.0.0.1'],
    },
  },
  projects: [
    {
      name: 'control-auth-setup',
      testMatch: /control-auth\.setup\.ts/,
      retries: 0,
    },
    {
      name: 'processor-auth-setup',
      testMatch: /processor-auth\.setup\.ts/,
      dependencies: ['control-auth-setup'],
      retries: 0,
    },
    {
      name: 'chromium-desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
      testIgnore: /.*\.setup\.ts/,
      dependencies: ['processor-auth-setup'],
      grepInvert: /@mobile/,
    },
    {
      name: 'chromium-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
      testIgnore: /.*\.setup\.ts/,
      dependencies: ['processor-auth-setup'],
      grep: /@mobile/,
    },
  ],
});
