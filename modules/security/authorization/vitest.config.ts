import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const authAuthenticationSource = fileURLToPath(
  new URL(
    '../../../packages/auth/src/authentication/index.ts',
    import.meta.url,
  ),
);
const authAuthorizationSource = fileURLToPath(
  new URL('../../../packages/auth/src/authorization/index.ts', import.meta.url),
);
const contractsSource = fileURLToPath(
  new URL('../../../packages/contracts/src', import.meta.url),
);
const errorsSource = fileURLToPath(
  new URL('../../../packages/errors/src', import.meta.url),
);
const timeSource = fileURLToPath(
  new URL('../../../packages/time/src/index.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/auth\/authentication$/,
        replacement: authAuthenticationSource,
      },
      {
        find: /^@pressly\/auth\/authorization$/,
        replacement: authAuthorizationSource,
      },
      {
        find: /^@pressly\/contracts\/utc-iso$/,
        replacement: `${contractsSource}/utc-iso.contracts.ts`,
      },
      {
        find: /^@pressly\/contracts\/(auth|cents|lpms|orders|pricing|processor|production|users|webhook-ingestion)$/,
        replacement: `${contractsSource}/$1/index.ts`,
      },
      {
        find: /^@pressly\/errors\/(app-error|factories|presentation)$/,
        replacement: `${errorsSource}/$1.ts`,
      },
      {
        find: '@pressly/time',
        replacement: timeSource,
      },
    ],
  },
  test: {
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
  },
});
