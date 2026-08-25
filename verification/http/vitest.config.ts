import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const errorsSource = fileURLToPath(
  new URL('../../platform/errors/src', import.meta.url),
);
const accessAuthenticationSource = fileURLToPath(
  new URL(
    '../../systems/access/src/model/authentication/public.ts',
    import.meta.url,
  ),
);
const accessAuthorizationSource = fileURLToPath(
  new URL(
    '../../systems/access/src/model/authorization/public.ts',
    import.meta.url,
  ),
);
const configSource = fileURLToPath(
  new URL('../../platform/config/src/index.ts', import.meta.url),
);
const codecSource = fileURLToPath(
  new URL('../../platform/codec/src/index.ts', import.meta.url),
);
const codecNodeSource = fileURLToPath(
  new URL('../../platform/codec/src/node.ts', import.meta.url),
);
const httpSource = fileURLToPath(
  new URL('../../platform/http/src/index.ts', import.meta.url),
);
const httpExpressSource = fileURLToPath(
  new URL('../../platform/http/src/express/index.ts', import.meta.url),
);
const ingressSystemSource = fileURLToPath(
  new URL('../../systems/ingress/src/public.ts', import.meta.url),
);
const cellsIdSource = fileURLToPath(
  new URL('../../platform/cells/src/id-source.ts', import.meta.url),
);
const cellsNodeIdSource = fileURLToPath(
  new URL('../../platform/cells/src/id-source.node.ts', import.meta.url),
);
const cellsResultSource = fileURLToPath(
  new URL('../../platform/cells/src/result.ts', import.meta.url),
);
const loggingSource = fileURLToPath(
  new URL('../../platform/logging/src/index.ts', import.meta.url),
);
const observabilitySource = fileURLToPath(
  new URL('../../platform/observability/src/index.ts', import.meta.url),
);
const timeSource = fileURLToPath(
  new URL('../../platform/time/src/index.ts', import.meta.url),
);
const testkitDatabaseSource = fileURLToPath(
  new URL('../../platform/testing/src/database.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/access-system\/authentication$/,
        replacement: accessAuthenticationSource,
      },
      {
        find: /^@pressly\/access-system\/authorization$/,
        replacement: accessAuthorizationSource,
      },
      {
        find: /^@pressly\/config$/,
        replacement: configSource,
      },
      {
        find: /^@pressly\/codec\/node$/,
        replacement: codecNodeSource,
      },
      {
        find: /^@pressly\/codec$/,
        replacement: codecSource,
      },
      {
        find: /^@pressly\/errors\/(app-error|factories|presentation)$/,
        replacement: `${errorsSource}/$1.ts`,
      },
      {
        find: /^@pressly\/http\/express$/,
        replacement: httpExpressSource,
      },
      {
        find: /^@pressly\/http$/,
        replacement: httpSource,
      },
      {
        find: /^@pressly\/ingress-system$/,
        replacement: ingressSystemSource,
      },
      {
        find: /^@pressly\/cells\/id-source\/node$/,
        replacement: cellsNodeIdSource,
      },
      {
        find: /^@pressly\/cells\/id-source$/,
        replacement: cellsIdSource,
      },
      {
        find: /^@pressly\/cells\/result$/,
        replacement: cellsResultSource,
      },
      {
        find: /^@pressly\/logging$/,
        replacement: loggingSource,
      },
      {
        find: /^@pressly\/observability$/,
        replacement: observabilitySource,
      },
      {
        find: /^@pressly\/testkit\/database$/,
        replacement: testkitDatabaseSource,
      },
      {
        find: /^@pressly\/time$/,
        replacement: timeSource,
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
  },
});
