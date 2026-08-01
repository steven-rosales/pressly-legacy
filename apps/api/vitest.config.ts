import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const errorsSource = fileURLToPath(
  new URL('../../packages/errors/src/index.ts', import.meta.url),
);
const accessControlSource = fileURLToPath(
  new URL('../../modules/policy/access-control/src/public.ts', import.meta.url),
);
const authModuleSource = fileURLToPath(
  new URL('../../modules/business/auth/src/public.ts', import.meta.url),
);
const authAuthenticationSource = fileURLToPath(
  new URL('../../packages/auth/src/authentication/index.ts', import.meta.url),
);
const authAuthorizationSource = fileURLToPath(
  new URL('../../packages/auth/src/authorization/index.ts', import.meta.url),
);
const authCredentialsSource = fileURLToPath(
  new URL('../../packages/auth/src/credentials/index.ts', import.meta.url),
);
const configSource = fileURLToPath(
  new URL('../../packages/config/src/index.ts', import.meta.url),
);
const contractsSource = fileURLToPath(
  new URL('../../packages/contracts/src/index.ts', import.meta.url),
);
const dbSource = fileURLToPath(
  new URL('../../packages/db/src/index.ts', import.meta.url),
);
const dbTestingSource = fileURLToPath(
  new URL('../../packages/db/src/testing.ts', import.meta.url),
);
const httpSource = fileURLToPath(
  new URL('../../packages/http/src/index.ts', import.meta.url),
);
const httpExpressSource = fileURLToPath(
  new URL('../../packages/http/src/express/index.ts', import.meta.url),
);
const kernelSource = fileURLToPath(
  new URL('../../packages/kernel/src/index.ts', import.meta.url),
);
const loggingSource = fileURLToPath(
  new URL('../../packages/logging/src/index.ts', import.meta.url),
);
const metricsSource = fileURLToPath(
  new URL('../../packages/metrics/src/index.ts', import.meta.url),
);
const pricingSource = fileURLToPath(
  new URL('../../modules/business/pricing/src/public.ts', import.meta.url),
);
const productionSource = fileURLToPath(
  new URL('../../modules/business/production/src/public.ts', import.meta.url),
);
const productionTestingSource = fileURLToPath(
  new URL(
    '../../modules/business/production/test/support/memory-production-repositories.ts',
    import.meta.url,
  ),
);
const productionPolicySource = fileURLToPath(
  new URL('../../modules/policy/production/src/public.ts', import.meta.url),
);
const productionSchedulingSource = fileURLToPath(
  new URL(
    '../../modules/computation/scheduling/src/public.ts',
    import.meta.url,
  ),
);
const timeSource = fileURLToPath(
  new URL('../../packages/time/src/index.ts', import.meta.url),
);
const testkitDatabaseSource = fileURLToPath(
  new URL('../../packages/testkit/src/database.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pressly\/access-control$/,
        replacement: accessControlSource,
      },
      {
        find: /^@pressly\/auth-module$/,
        replacement: authModuleSource,
      },
      {
        find: /^@pressly\/auth\/authentication$/,
        replacement: authAuthenticationSource,
      },
      {
        find: /^@pressly\/auth\/authorization$/,
        replacement: authAuthorizationSource,
      },
      {
        find: /^@pressly\/auth\/credentials$/,
        replacement: authCredentialsSource,
      },
      {
        find: /^@pressly\/config$/,
        replacement: configSource,
      },
      {
        find: /^@pressly\/contracts$/,
        replacement: contractsSource,
      },
      {
        find: /^@pressly\/db\/testing$/,
        replacement: dbTestingSource,
      },
      {
        find: /^@pressly\/db$/,
        replacement: dbSource,
      },
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
      {
        find: /^@pressly\/kernel$/,
        replacement: kernelSource,
      },
      {
        find: /^@pressly\/logging$/,
        replacement: loggingSource,
      },
      {
        find: /^@pressly\/metrics$/,
        replacement: metricsSource,
      },
      {
        find: /^@pressly\/pricing$/,
        replacement: pricingSource,
      },
      {
        find: /^@pressly\/production\/testing$/,
        replacement: productionTestingSource,
      },
      {
        find: /^@pressly\/production$/,
        replacement: productionSource,
      },
      {
        find: /^@pressly\/production-policy$/,
        replacement: productionPolicySource,
      },
      {
        find: /^@pressly\/production-scheduling$/,
        replacement: productionSchedulingSource,
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
