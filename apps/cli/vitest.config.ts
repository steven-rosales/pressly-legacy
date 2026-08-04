import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const contractsSource = fileURLToPath(
  new URL('../../packages/contracts/src', import.meta.url),
);
const codecSource = fileURLToPath(
  new URL('../../packages/codec/src/index.ts', import.meta.url),
);
const codecNodeSource = fileURLToPath(
  new URL('../../packages/codec/src/node.ts', import.meta.url),
);
const dbSource = fileURLToPath(
  new URL('../../packages/db/src', import.meta.url),
);
const errorsSource = fileURLToPath(
  new URL('../../packages/errors/src', import.meta.url),
);
const kernelSource = fileURLToPath(
  new URL('../../packages/kernel/src/index.ts', import.meta.url),
);
const kernelNodeSource = fileURLToPath(
  new URL('../../packages/kernel/src/node.ts', import.meta.url),
);
const identitySource = fileURLToPath(
  new URL('../../modules/security/identity/src/public.ts', import.meta.url),
);
const moneySource = fileURLToPath(
  new URL('../../packages/money/src/index.ts', import.meta.url),
);
const timeSource = fileURLToPath(
  new URL('../../packages/time/src/index.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/codec\/node$/,
        replacement: codecNodeSource,
      },
      {
        find: /^@pressly\/codec$/,
        replacement: codecSource,
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
        find: /^@pressly\/identity$/,
        replacement: identitySource,
      },
      {
        find: /^@pressly\/kernel\/node$/,
        replacement: kernelNodeSource,
      },
      {
        find: /^@pressly\/kernel$/,
        replacement: kernelSource,
      },
      {
        find: '@pressly/money',
        replacement: moneySource,
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
