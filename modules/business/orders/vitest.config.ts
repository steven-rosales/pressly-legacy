import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/codec\/zod$/,
        replacement: alias('../../../packages/codec/src/zod.ts'),
      },
      {
        find: /^@pressly\/codec\/node$/,
        replacement: alias('../../../packages/codec/src/node.ts'),
      },
      {
        find: /^@pressly\/codec$/,
        replacement: alias('../../../packages/codec/src/index.ts'),
      },
      {
        find: /^@pressly\/contracts\/utc-iso$/,
        replacement: alias(
          '../../../packages/contracts/src/utc-iso.contracts.ts',
        ),
      },
      {
        find: /^@pressly\/contracts\/(auth|cents|lpms|orders|pricing|processor|production|users|webhook-ingestion)$/,
        replacement: `${alias('../../../packages/contracts/src')}/$1/index.ts`,
      },
      {
        find: /^@pressly\/db\/schema\/(.+)$/,
        replacement: `${alias('../../../packages/db/src')}/schema/$1.schema.ts`,
      },
      {
        find: /^@pressly\/db\/(client|health|query|testing|unit-of-work)$/,
        replacement: `${alias('../../../packages/db/src')}/$1.ts`,
      },
      {
        find: /^@pressly\/errors\/(app-error|factories|presentation)$/,
        replacement: `${alias('../../../packages/errors/src')}/$1.ts`,
      },
      {
        find: /^@pressly\/kernel$/,
        replacement: alias('../../../packages/kernel/src/index.ts'),
      },
      {
        find: /^@pressly\/time$/,
        replacement: alias('../../../packages/time/src/index.ts'),
      },
      {
        find: /^@pressly\/testkit\/(.+)$/,
        replacement: `${alias('../../../packages/testkit/src')}/$1.ts`,
      },
      {
        find: /^@pressly\/testkit$/,
        replacement: alias('../../../packages/testkit/src/index.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
