import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/db\/testing$/,
        replacement: alias('../../../packages/db/src/testing.ts'),
      },
      {
        find: /^@pressly\/db$/,
        replacement: alias('../../../packages/db/src/index.ts'),
      },
      {
        find: /^@pressly\/contracts$/,
        replacement: alias('../../../packages/contracts/src/index.ts'),
      },
      {
        find: /^@pressly\/errors$/,
        replacement: alias('../../../packages/errors/src/index.ts'),
      },
      {
        find: /^@pressly\/kernel\/node$/,
        replacement: alias('../../../packages/kernel/src/node.ts'),
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
