import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) =>
  fileURLToPath(new URL(`../../../packages/${path}`, import.meta.url));

const testkitSource = source('testkit/src');
const timeSource = source('time/src/index.ts');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/codec\/node$/,
        replacement: source('codec/src/node.ts'),
      },
      {
        find: /^@pressly\/codec$/,
        replacement: source('codec/src/index.ts'),
      },
      {
        find: /^@pressly\/testkit\/(.+)$/,
        replacement: `${testkitSource}/$1.ts`,
      },
      {
        find: /^@pressly\/contracts\/utc-iso$/,
        replacement: source('contracts/src/utc-iso.contracts.ts'),
      },
      {
        find: /^@pressly\/contracts\/(auth|cents|lpms|orders|pricing|processor|production|users|webhook-ingestion)$/,
        replacement: `${source('contracts/src')}/$1/index.ts`,
      },
      {
        find: /^@pressly\/db\/schema\/(.+)$/,
        replacement: `${source('db/src')}/schema/$1.schema.ts`,
      },
      {
        find: /^@pressly\/db\/(client|health|query|testing|unit-of-work)$/,
        replacement: `${source('db/src')}/$1.ts`,
      },
      {
        find: /^@pressly\/errors\/(app-error|factories|presentation)$/,
        replacement: `${source('errors/src')}/$1.ts`,
      },
      {
        find: /^@pressly\/http\/express$/,
        replacement: source('http/src/express/index.ts'),
      },
      { find: /^@pressly\/http$/, replacement: source('http/src/index.ts') },
      {
        find: /^@pressly\/kernel$/,
        replacement: source('kernel/src/index.ts'),
      },
      { find: /^@pressly\/time$/, replacement: timeSource },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
