import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

export default defineModule({
  id: 'experience/processor',
  packageName: '@pressly/processor-experience',
  features: defineNamespace({
    session: defineNamespace({
      'resolve-processor-access': defineFeature.headlessQuery({
        dependsOn: [
          'language/processor-access',
          'ports/processor-access-locations',
          'ports/production-capabilities',
        ],
      }),
    }),
    orders: defineNamespace({
      'resolve-operational-order-identities': defineFeature.headlessQuery({
        dependsOn: [
          'language/operational-order',
          'ports/operational-order-identity',
        ],
      }),
      'load-operational-order-contexts': defineFeature.headlessQuery({
        dependsOn: [
          'language/operational-order',
          'ports/operational-order-identity',
          'ports/operational-order-audit',
        ],
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      'processor-access': defineFoundation.language(),
      'operational-order': defineFoundation.language(),
    }),
    ports: defineNamespace({
      'processor-access-locations': defineFoundation.port({
        dependsOn: ['language/processor-access'],
      }),
      'production-capabilities': defineFoundation.port({
        dependsOn: ['language/processor-access'],
      }),
      'operational-order-identity': defineFoundation.port({
        dependsOn: ['language/operational-order'],
      }),
      'operational-order-audit': defineFoundation.port({
        dependsOn: ['language/operational-order'],
      }),
    }),
    adapters: defineNamespace({
      postgres: defineNamespace({
        'processor-access-locations': defineFoundation.adapter({
          dependsOn: ['ports/processor-access-locations'],
        }),
        'operational-order-identity': defineFoundation.adapter({
          dependsOn: [
            'language/operational-order',
            'ports/operational-order-identity',
          ],
        }),
        'operational-order-audit': defineFoundation.adapter({
          dependsOn: ['ports/operational-order-audit'],
        }),
      }),
    }),
  },
});
