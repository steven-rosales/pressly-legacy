import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const contractsSource = fileURLToPath(
  new URL('../../packages/contracts/src/index.ts', import.meta.url),
);
const errorsSource = fileURLToPath(
  new URL('../../packages/errors/src/index.ts', import.meta.url),
);
const kernelSource = fileURLToPath(
  new URL('../../packages/kernel/src/index.ts', import.meta.url),
);
const moneySource = fileURLToPath(
  new URL('../../packages/money/src/index.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@pressly/contracts',
        replacement: contractsSource,
      },
      {
        find: '@pressly/errors',
        replacement: errorsSource,
      },
      {
        find: '@pressly/kernel',
        replacement: kernelSource,
      },
      {
        find: '@pressly/money',
        replacement: moneySource,
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
