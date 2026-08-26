import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/jobs$/,
        replacement: `${repositoryRoot}/platform/jobs/src/public.ts`,
      },
      {
        find: /^@pressly\/jobs-host$/,
        replacement: `${repositoryRoot}/hosts/jobs/src/public.ts`,
      },
      {
        find: /^@pressly\/orders-system\/contracts\/fulfillment-demand-changed-v2$/,
        replacement: `${repositoryRoot}/systems/orders/src/contracts/fulfillment-demand-changed-v2.ts`,
      },
      {
        find: /^@pressly\/orders-system$/,
        replacement: `${repositoryRoot}/systems/orders/src/public.ts`,
      },
      {
        find: /^@pressly\/production-system$/,
        replacement: `${repositoryRoot}/systems/production/src/public.ts`,
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
