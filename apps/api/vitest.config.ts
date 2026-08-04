import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const errorsSource = fileURLToPath(
  new URL('../../packages/errors/src', import.meta.url),
);
const authorizationSource = fileURLToPath(
  new URL(
    '../../modules/security/authorization/src/public.ts',
    import.meta.url,
  ),
);
const identitySource = fileURLToPath(
  new URL('../../modules/security/identity/src/public.ts', import.meta.url),
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
const controlExperienceSource = fileURLToPath(
  new URL('../../modules/experience/control/src/public.ts', import.meta.url),
);
const codecSource = fileURLToPath(
  new URL('../../packages/codec/src/index.ts', import.meta.url),
);
const codecNodeSource = fileURLToPath(
  new URL('../../packages/codec/src/node.ts', import.meta.url),
);
const contractsSource = fileURLToPath(
  new URL('../../packages/contracts/src', import.meta.url),
);
const dbSource = fileURLToPath(
  new URL('../../packages/db/src', import.meta.url),
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
const kernelNodeSource = fileURLToPath(
  new URL('../../packages/kernel/src/node.ts', import.meta.url),
);
const loggingSource = fileURLToPath(
  new URL('../../packages/logging/src/index.ts', import.meta.url),
);
const observabilitySource = fileURLToPath(
  new URL('../../packages/observability/src/index.ts', import.meta.url),
);
const pricingSource = fileURLToPath(
  new URL('../../modules/business/pricing/src/public.ts', import.meta.url),
);
const processorExperienceSource = fileURLToPath(
  new URL('../../modules/experience/processor/src/public.ts', import.meta.url),
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
        find: /^@pressly\/authorization$/,
        replacement: authorizationSource,
      },
      {
        find: /^@pressly\/identity$/,
        replacement: identitySource,
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
        find: /^@pressly\/control-experience$/,
        replacement: controlExperienceSource,
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
        find: /^@pressly\/contracts\/utc-iso$/,
        replacement: `${contractsSource}/utc-iso.contracts.ts`,
      },
      {
        find: /^@pressly\/contracts\/(auth|cents|lpms|orders|pricing|processor|production|users|webhook-ingestion)$/,
        replacement: `${contractsSource}/$1/index.ts`,
      },
      {
        find: /^@pressly\/db\/schema\/(.+)$/,
        replacement: `${dbSource}/schema/$1.schema.ts`,
      },
      {
        find: /^@pressly\/db\/(client|health|query|testing|unit-of-work)$/,
        replacement: `${dbSource}/$1.ts`,
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
        find: /^@pressly\/kernel\/node$/,
        replacement: kernelNodeSource,
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
        find: /^@pressly\/observability$/,
        replacement: observabilitySource,
      },
      {
        find: /^@pressly\/pricing$/,
        replacement: pricingSource,
      },
      {
        find: /^@pressly\/processor-experience$/,
        replacement: processorExperienceSource,
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
