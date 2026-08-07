import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

export default defineModule({
  id: 'security/authorization',
  packageName: '@pressly/authorization',
  features: defineNamespace({
    identity: defineNamespace({
      'authorize-auth-sessions': defineFeature.purePolicy({
        dependsOn: ['language/identity-resource'],
      }),
      'authorize-mfa': defineFeature.purePolicy({
        dependsOn: ['language/identity-resource'],
      }),
    }),
    commercial: defineNamespace({
      'authorize-order-management': defineFeature.purePolicy(),
      'authorize-pricing': defineFeature.purePolicy(),
    }),
    operations: defineNamespace({
      'authorize-production': defineFeature.purePolicy(),
    }),
    scopes: defineNamespace({
      'resolve-location-ancestry': defineFeature.headlessQuery({
        dependsOn: ['ports/location-ancestry'],
      }),
      'resolve-production-visibility': defineFeature.headlessQuery({
        dependsOn: ['ports/location-ancestry'],
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      'identity-resource': defineFoundation.language(),
    }),
    ports: defineNamespace({
      'location-ancestry': defineFoundation.port(),
    }),
  },
});
