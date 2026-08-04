import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/codec\/node$/,
        replacement: source('../../packages/codec/src/node.ts'),
      },
      {
        find: /^@pressly\/codec$/,
        replacement: source('../../packages/codec/src/index.ts'),
      },
      {
        find: /^@pressly\/contracts\/utc-iso$/,
        replacement: source(
          '../../packages/contracts/src/utc-iso.contracts.ts',
        ),
      },
      {
        find: /^@pressly\/contracts\/(auth|cents|lpms|orders|pricing|processor|production|users|webhook-ingestion)$/,
        replacement: `${source('../../packages/contracts/src')}/$1/index.ts`,
      },
      {
        find: /^@pressly\/db\/schema\/(.+)$/,
        replacement: `${source('../../packages/db/src')}/schema/$1.schema.ts`,
      },
      {
        find: /^@pressly\/db\/(client|health|query|testing|unit-of-work)$/,
        replacement: `${source('../../packages/db/src')}/$1.ts`,
      },
      {
        find: /^@pressly\/errors\/(app-error|factories|presentation)$/,
        replacement: `${source('../../packages/errors/src')}/$1.ts`,
      },
      {
        find: /^@pressly\/kernel\/node$/,
        replacement: source('../../packages/kernel/src/node.ts'),
      },
      {
        find: /^@pressly\/kernel$/,
        replacement: source('../../packages/kernel/src/index.ts'),
      },
      {
        find: /^@pressly\/logging$/,
        replacement: source('../../packages/logging/src/index.ts'),
      },
      {
        find: /^@pressly\/observability$/,
        replacement: source('../../packages/observability/src/index.ts'),
      },
      {
        find: /^@pressly\/production$/,
        replacement: source('../../modules/business/production/src/public.ts'),
      },
      {
        find: /^@pressly\/time$/,
        replacement: source('../../packages/time/src/index.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
