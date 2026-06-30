import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const errorsSource = fileURLToPath(
  new URL('../../packages/errors/src/index.ts', import.meta.url),
);
const httpSource = fileURLToPath(
  new URL('../../packages/http/src/index.ts', import.meta.url),
);
const httpExpressSource = fileURLToPath(
  new URL('../../packages/http/src/express/index.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/errors$/,
        replacement: errorsSource,
      },
      {
        find: /^@pressly\/http\/express$/,
        replacement: httpExpressSource,
      },
      {
        find: /^@pressly\/http$/,
        replacement: httpSource,
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
  },
});
