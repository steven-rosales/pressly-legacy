import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@pressly/contracts',
        replacement: source('../../packages/contracts/src/index.ts'),
      },
      {
        find: '@pressly/db',
        replacement: source('../../packages/db/src/index.ts'),
      },
      {
        find: '@pressly/errors',
        replacement: source('../../packages/errors/src/index.ts'),
      },
      {
        find: '@pressly/logging',
        replacement: source('../../packages/logging/src/index.ts'),
      },
      {
        find: '@pressly/metrics',
        replacement: source('../../packages/metrics/src/index.ts'),
      },
      {
        find: '@pressly/production',
        replacement: source('../../modules/business/production/src/public.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
