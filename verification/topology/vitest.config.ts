import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/cells\/id-source\/node$/,
        replacement: `${repositoryRoot}/platform/cells/src/id-source.node.ts`,
      },
      {
        find: /^@pressly\/cells\/(command-context|id-source|result|state-machine|unit-of-work)$/,
        replacement: `${repositoryRoot}/platform/cells/src/$1.ts`,
      },
      {
        find: /^@pressly\/cells$/,
        replacement: `${repositoryRoot}/platform/cells/src/public.ts`,
      },
      {
        find: /^@pressly\/topology\/postgres-schema$/,
        replacement: `${repositoryRoot}/topology/pressly-postgres-schema.ts`,
      },
      {
        find: /^@pressly\/topology$/,
        replacement: `${repositoryRoot}/topology/src/public.ts`,
      },
    ],
  },
  test: {
    exclude: ['**/node_modules/**'],
    include: [`${repositoryRoot}/verification/topology/*.test.ts`],
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
