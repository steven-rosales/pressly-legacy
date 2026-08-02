import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) =>
  fileURLToPath(new URL(`../../../packages/${path}`, import.meta.url));

const testkitSource = source('testkit/src');
const timeSource = source('time/src/index.ts');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/testkit\/(.+)$/,
        replacement: `${testkitSource}/$1.ts`,
      },
      {
        find: /^@pressly\/contracts$/,
        replacement: source('contracts/src/index.ts'),
      },
      {
        find: /^@pressly\/db\/testing$/,
        replacement: source('db/src/testing.ts'),
      },
      { find: /^@pressly\/db$/, replacement: source('db/src/index.ts') },
      {
        find: /^@pressly\/errors$/,
        replacement: source('errors/src/index.ts'),
      },
      {
        find: /^@pressly\/kernel$/,
        replacement: source('kernel/src/index.ts'),
      },
      {
        find: /^@pressly\/kernel\/node$/,
        replacement: source('kernel/src/node.ts'),
      },
      { find: /^@pressly\/time$/, replacement: timeSource },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
