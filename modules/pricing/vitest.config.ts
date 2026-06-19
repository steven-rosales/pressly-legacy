import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const testkitSource = fileURLToPath(
  new URL('../../packages/testkit/src', import.meta.url),
);
const dbSource = fileURLToPath(
  new URL('../../packages/db/src/index.ts', import.meta.url),
);
const errorsSource = fileURLToPath(
  new URL('../../packages/errors/src/index.ts', import.meta.url),
);
const kernelSource = fileURLToPath(
  new URL('../../packages/kernel/src/index.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/testkit\/(.+)$/,
        replacement: `${testkitSource}/$1.ts`,
      },
      {
        find: '@pressly/testkit',
        replacement: `${testkitSource}/index.ts`,
      },
      {
        find: '@pressly/db',
        replacement: dbSource,
      },
      {
        find: '@pressly/errors',
        replacement: errorsSource,
      },
      {
        find: '@pressly/kernel',
        replacement: kernelSource,
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
