import { defineRepository } from './architecture-definition.factory.ts';

export const presslyRepositoryArchitecture = defineRepository({
  name: 'pressly-modular-monolith',
  moduleFamilies: ['business', 'security', 'integration', 'experience'],
  moduleRootFiles: ['main.ts', 'public.ts'],
  symbolSurfaces: [
    'apps/cli/src/features/auth/index.ts',
    'apps/cli/src/features/pricing/index.ts',
    'apps/control/src/components/ui/index.ts',
    'apps/processor/src/i18n/index.ts',
    'apps/web/src/app/(marketing)/new-jersey/content/index.ts',
    'apps/web/src/app/_lib/seo.ts',
    'packages/db/src/schema.ts',
  ],
  packageKinds: {
    pure: [
      '@pressly/errors',
      '@pressly/codec',
      '@pressly/kernel',
      '@pressly/money',
      '@pressly/time',
    ],
    contract: ['@pressly/contracts'],
    persistence: ['@pressly/db'],
    http: ['@pressly/http'],
    observability: ['@pressly/logging', '@pressly/observability'],
    runtime: ['@pressly/auth', '@pressly/config'],
  },
});
