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
const authCredentialsSource = fileURLToPath(
  new URL('../../../packages/auth/src/credentials/index.ts', import.meta.url),
);
const contractsSource = fileURLToPath(
  new URL('../../../packages/contracts/src', import.meta.url),
);
const dbSource = fileURLToPath(
  new URL('../../../packages/db/src', import.meta.url),
);
const errorsSource = fileURLToPath(
  new URL('../../../packages/errors/src', import.meta.url),
);
const httpSource = fileURLToPath(
  new URL('../../../packages/http/src/index.ts', import.meta.url),
);
const httpExpressSource = fileURLToPath(
  new URL('../../../packages/http/src/express/index.ts', import.meta.url),
);
const kernelSource = fileURLToPath(
  new URL('../../../packages/kernel/src/index.ts', import.meta.url),
);
const testkitSource = fileURLToPath(
  new URL('../../../packages/testkit/src', import.meta.url),
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
        find: /^@pressly\/auth\/credentials$/,
        replacement: authCredentialsSource,
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
        find: /^@pressly\/db\/schema\/(.+)$/,
        replacement: `${dbSource}/schema/$1.schema.ts`,
      },
      {
        find: /^@pressly\/db\/(client|health|query|testing|unit-of-work)$/,
        replacement: `${dbSource}/$1.ts`,
      },
      {
        find: /^@pressly\/errors\/(app-error|factories|presentation)$/,
        replacement: `${errorsSource}/$1.ts`,
      },
      {
        find: /^@pressly\/http\/express$/,
        replacement: httpExpressSource,
      },
      {
        find: /^@pressly\/http$/,
        replacement: httpSource,
      },
      {
        find: '@pressly/kernel',
        replacement: kernelSource,
      },
      {
        find: '@pressly/time',
        replacement: timeSource,
      },
      {
        find: /^@pressly\/testkit\/(.+)$/,
        replacement: `${testkitSource}/$1.ts`,
      },
      {
        find: '@pressly/testkit',
        replacement: `${testkitSource}/index.ts`,
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
