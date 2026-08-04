import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

const userFeatureDependencies = [
  'language/users',
  'language/command-identity',
  'adapters/postgres',
] as const;

export default defineModule({
  id: 'business/users',
  packageName: '@pressly/users',
  features: defineNamespace({
    users: defineNamespace({
      'create-user': defineFeature.headlessCommand({
        dependsOn: userFeatureDependencies,
      }),
      'read-users': defineFeature.headlessQuery({
        dependsOn: ['language/users'],
      }),
      'update-user': defineFeature.headlessCommand({
        dependsOn: userFeatureDependencies,
      }),
    }),
    sources: defineNamespace({
      'resolve-canonical-source-user': defineFeature.headlessCommand({
        dependsOn: userFeatureDependencies,
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      users: defineFoundation.language(),
      'command-identity': defineFoundation.language(),
    }),
    adapters: defineNamespace({
      postgres: defineFoundation.adapter({
        dependsOn: ['language/users', 'language/command-identity'],
      }),
    }),
  },
});
