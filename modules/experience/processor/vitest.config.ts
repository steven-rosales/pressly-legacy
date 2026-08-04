import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dbSource = fileURLToPath(
  new URL('../../../packages/db/src', import.meta.url),
);
const timeSource = fileURLToPath(
  new URL('../../../packages/time/src/index.ts', import.meta.url),
);
const testkitDatabaseSource = fileURLToPath(
  new URL('../../../packages/testkit/src/database.ts', import.meta.url),
);
const errorFactoriesSource = fileURLToPath(
  new URL('../../../packages/errors/src', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
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
        replacement: `${errorFactoriesSource}/$1.ts`,
      },
      { find: /^@pressly\/time$/, replacement: timeSource },
      {
        find: /^@pressly\/testkit\/database$/,
        replacement: testkitDatabaseSource,
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
  },
});
