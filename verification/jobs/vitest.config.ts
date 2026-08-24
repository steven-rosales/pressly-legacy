import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/jobs-host$/,
        replacement: `${repositoryRoot}/hosts/jobs/src/public.ts`,
      },
      {
        find: /^@pressly\/jobs$/,
        replacement: `${repositoryRoot}/platform/jobs/src/public.ts`,
      },
      {
        find: /^@pressly\/cells\/result$/,
        replacement: `${repositoryRoot}/platform/cells/src/result.ts`,
      },
      {
        find: /^@pressly\/codec\/node$/,
        replacement: `${repositoryRoot}/platform/codec/src/node.ts`,
      },
      {
        find: /^@pressly\/errors\/(app-error|factories)$/,
        replacement: `${repositoryRoot}/platform/errors/src/$1.ts`,
      },
      {
        find: /^@pressly\/ingress-system\/capabilities\/process-inbound-event-job$/,
        replacement: `${repositoryRoot}/systems/ingress/src/capabilities/process-inbound-event-job/public.ts`,
      },
      {
        find: /^@pressly\/ingress-system$/,
        replacement: `${repositoryRoot}/systems/ingress/src/public.ts`,
      },
      {
        find: /^@pressly\/orders-system$/,
        replacement: `${repositoryRoot}/systems/orders/src/public.ts`,
      },
      {
        find: /^@pressly\/production-system$/,
        replacement: `${repositoryRoot}/systems/production/src/public.ts`,
      },
      {
        find: /^@pressly\/logging$/,
        replacement: `${repositoryRoot}/platform/logging/src/index.ts`,
      },
      {
        find: /^@pressly\/observability$/,
        replacement: `${repositoryRoot}/platform/observability/src/index.ts`,
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
