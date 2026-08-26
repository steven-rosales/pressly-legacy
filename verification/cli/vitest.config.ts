import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/cli-host$/,
        replacement: `${repositoryRoot}/hosts/cli/src/public.ts`,
      },
      {
        find: /^@pressly\/cli-host\/process$/,
        replacement: `${repositoryRoot}/hosts/cli/src/runtime/process-runtime.ts`,
      },
      {
        find: /^@pressly\/cli-host\/ink$/,
        replacement: `${repositoryRoot}/hosts/cli/src/ink-tty.tsx`,
      },
      {
        find: /^@pressly\/experience-control\/cli\/runtime$/,
        replacement: `${repositoryRoot}/experiences/control/src/cli/runtime.ts`,
      },
      {
        find: /^@pressly\/cells\/id-source\/node$/,
        replacement: `${repositoryRoot}/platform/cells/src/id-source.node.ts`,
      },
      {
        find: /^@pressly\/cells\/result$/,
        replacement: `${repositoryRoot}/platform/cells/src/result.ts`,
      },
      {
        find: /^@pressly\/errors\/(app-error|factories|presentation)$/,
        replacement: `${repositoryRoot}/platform/errors/src/$1.ts`,
      },
      {
        find: /^@pressly\/http$/,
        replacement: `${repositoryRoot}/platform/http/src/index.ts`,
      },
      {
        find: /^@pressly\/time$/,
        replacement: `${repositoryRoot}/platform/time/src/index.ts`,
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    maxWorkers: 2,
  },
});
