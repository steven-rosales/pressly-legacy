import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) =>
  fileURLToPath(new URL(`../../${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/codec$/,
        replacement: source('platform/codec/src/index.ts'),
      },
      {
        find: /^@pressly\/errors\/(app-error|factories)$/,
        replacement: `${source('platform/errors/src')}/$1.ts`,
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
