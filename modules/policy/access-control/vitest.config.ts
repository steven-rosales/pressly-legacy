import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const authAuthenticationSource = fileURLToPath(
  new URL(
    '../../../packages/auth/src/authentication/index.ts',
    import.meta.url,
  ),
);
const authAuthorizationSource = fileURLToPath(
  new URL('../../../packages/auth/src/authorization/index.ts', import.meta.url),
);
const contractsSource = fileURLToPath(
  new URL('../../../packages/contracts/src/index.ts', import.meta.url),
);
const errorsSource = fileURLToPath(
  new URL('../../../packages/errors/src/index.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/auth\/authentication$/,
        replacement: authAuthenticationSource,
      },
      {
        find: /^@pressly\/auth\/authorization$/,
        replacement: authAuthorizationSource,
      },
      {
        find: '@pressly/contracts',
        replacement: contractsSource,
      },
      {
        find: '@pressly/errors',
        replacement: errorsSource,
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
