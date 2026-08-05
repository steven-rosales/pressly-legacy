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
        dependsOn: [],
      }),
    }),
    orders: defineNamespace({
      'resolve-board-order-identities': defineFeature.headlessQuery({
        dependsOn: [
          'language/operational-order',
          'ports/operational-order-identity',
        ],
      }),
      'resolve-workspace-order-identities': defineFeature.headlessQuery({
        dependsOn: [
          'language/operational-order',
          'ports/operational-order-identity',
        ],
      }),
      'resolve-forecast-order-identities': defineFeature.headlessQuery({
        dependsOn: [
          'language/operational-order',
          'ports/operational-order-identity',
        ],
      }),
      'resolve-history-run-order-identities': defineFeature.headlessQuery({
        dependsOn: [
          'language/operational-order',
          'ports/operational-order-identity',
        ],
      }),
      'resolve-backlog-order-identities': defineFeature.headlessQuery({
        dependsOn: [
          'language/operational-order',
          'ports/operational-order-identity',
        ],
      }),
      'resolve-history-activity-order-identities': defineFeature.headlessQuery({
        dependsOn: [
          'language/operational-order',
          'ports/operational-order-identity',
        ],
      }),
      'load-operational-order-contexts': defineFeature.headlessQuery({
        dependsOn: [
          'language/operational-order',
          'ports/operational-order-identity',
        ],
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      'operational-order': defineFoundation.language(),
    }),
    ports: defineNamespace({
      'operational-order-identity': defineFoundation.port({
        dependsOn: ['language/operational-order'],
      }),
    }),
    adapters: defineNamespace({
      postgres: defineNamespace({
        'operational-order-identity': defineFoundation.adapter({
          implements: 'ports/operational-order-identity',
          dependsOn: [
            'language/operational-order',
            'ports/operational-order-identity',
          ],
        }),
      }),
    }),
  },
});
