import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dbSource = fileURLToPath(
  new URL('../../../packages/db/src', import.meta.url),
);
const kernelSource = fileURLToPath(
  new URL('../../../packages/kernel/src/index.ts', import.meta.url),
);
const timeSource = fileURLToPath(
  new URL('../../../packages/time/src/index.ts', import.meta.url),
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
      { find: /^@pressly\/kernel$/, replacement: kernelSource },
      { find: /^@pressly\/time$/, replacement: timeSource },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
    maxWorkers: 2,
  },
});
