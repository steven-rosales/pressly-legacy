import { defineRepository } from './architecture-definition.factory.ts';

export const presslyRepositoryArchitecture = defineRepository({
  name: 'pressly-modular-monolith',
  moduleFamilies: ['business', 'security', 'integration', 'experience'],
  moduleRootFiles: ['main.ts', 'public.ts'],
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
