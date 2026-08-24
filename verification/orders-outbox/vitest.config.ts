import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/orders-system$/,
        replacement: `${repositoryRoot}/systems/orders/src/public.ts`,
      },
    ],
  },
  test: {
    include: ['test/**/*.int.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
