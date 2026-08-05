import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

const canonicalOrderCommandFoundations = [
  'language/command-execution',
  'language/order',
  'ports/order-command-store',
  'adapters/postgres/order-store',
] as const;

const orderLifecycleFoundations = [
  'language/command-execution',
  'language/order',
  'language/order-lifecycle',
  'ports/order-lifecycle-transaction',
] as const;

const fulfillmentReleaseFoundations = [
  'language/command-execution',
  'language/order',
  'language/fulfillment-release',
  'ports/fulfillment-release-transaction',
] as const;

const incomingOrderFoundations = [
  'language/incoming-order-proposal',
  'adapters/postgres/incoming-order-proposal-store',
] as const;

export default defineModule({
  id: 'business/orders',
  packageName: '@pressly/orders',
  features: defineNamespace({
    lifecycle: defineNamespace({
      'create-order': defineFeature.headlessCommand({
        dependsOn: canonicalOrderCommandFoundations,
      }),
      'complete-order': defineFeature.headlessCommand({
        dependsOn: orderLifecycleFoundations,
      }),
      'cancel-order': defineFeature.headlessCommand({
        dependsOn: orderLifecycleFoundations,
      }),
      'correct-order': defineFeature.headlessCommand({
        dependsOn: canonicalOrderCommandFoundations,
      }),
    }),
    fulfillment: defineNamespace({
      'release-fulfillment': defineFeature.headlessCommand({
        dependsOn: fulfillmentReleaseFoundations,
      }),
      'withdraw-fulfillment': defineFeature.headlessCommand({
        dependsOn: fulfillmentReleaseFoundations,
      }),
    }),
    intake: defineNamespace({
      'propose-incoming-order': defineFeature.messageConsumer({
        dependsOn: [...incomingOrderFoundations, 'language/order'],
      }),
      'list-incoming-order-proposals': defineFeature.headlessQuery({
        dependsOn: ['language/incoming-order-proposal'],
      }),
      'accept-incoming-order-proposal': defineFeature.headlessCommand({
        dependsOn: [
          ...incomingOrderFoundations,
          'language/command-execution',
          'language/order',
          'adapters/postgres/order-store',
        ],
      }),
      'reject-incoming-order-proposal': defineFeature.headlessCommand({
        dependsOn: [
          ...incomingOrderFoundations,
          'language/command-execution',
          'adapters/postgres/order-store',
        ],
      }),
      'restore-incoming-order-proposal': defineFeature.headlessCommand({
        dependsOn: [...incomingOrderFoundations, 'language/command-execution'],
      }),
      'close-incoming-order-source': defineFeature.messageConsumer({
        dependsOn: [
          ...incomingOrderFoundations,
          'language/command-execution',
          'language/order',
        ],
      }),
    }),
    queries: defineNamespace({
      'list-canonical-orders': defineFeature.headlessQuery({
        dependsOn: ['language/canonical-order-read', 'language/order'],
      }),
      'get-canonical-order': defineFeature.headlessQuery({
        dependsOn: ['language/canonical-order-read', 'language/order'],
      }),
    }),
    outbox: defineNamespace({
      'claim-order-outbox': defineFeature.headlessCommand({
        dependsOn: [
          'language/order-outbox',
          'adapters/outbox/fulfillment-demand-codec',
        ],
      }),
      'complete-order-outbox': defineFeature.headlessCommand({
        dependsOn: ['language/order-outbox'],
      }),
      'retry-order-outbox': defineFeature.headlessCommand({
        dependsOn: ['language/order-outbox'],
      }),
      'dead-letter-order-outbox': defineFeature.headlessCommand({
        dependsOn: ['language/order-outbox'],
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      'command-execution': defineFoundation.language(),
      order: defineFoundation.language(),
      'order-lifecycle': defineFoundation.language({
        dependsOn: ['language/order'],
      }),
      'fulfillment-release': defineFoundation.language({
        dependsOn: ['language/order'],
      }),
      'canonical-order-read': defineFoundation.language({
        dependsOn: ['language/order'],
      }),
      'incoming-order-proposal': defineFoundation.language({
        dependsOn: ['language/order'],
      }),
      'order-outbox': defineFoundation.language({
        dependsOn: ['language/order'],
      }),
    }),
    ports: defineNamespace({
      'order-command-store': defineFoundation.port({
        dependsOn: ['language/command-execution'],
      }),
      'order-lifecycle-transaction': defineFoundation.port({
        dependsOn: ['language/order', 'ports/order-command-store'],
      }),
      'fulfillment-release-transaction': defineFoundation.port({
        dependsOn: ['language/order', 'ports/order-command-store'],
      }),
    }),
    adapters: defineNamespace({
      outbox: defineNamespace({
        'fulfillment-demand-codec': defineFoundation.adapter({
          dependsOn: ['language/order-outbox'],
        }),
      }),
      postgres: defineNamespace({
        'order-store': defineFoundation.adapter({
          dependsOn: [
            'language/command-execution',
            'language/order',
            'language/order-outbox',
            'adapters/outbox/fulfillment-demand-codec',
          ],
          implements: 'ports/order-command-store',
        }),
        'order-lifecycle-transaction': defineFoundation.adapter({
          dependsOn: ['language/order', 'adapters/postgres/order-store'],
          implements: 'ports/order-lifecycle-transaction',
        }),
        'fulfillment-release-transaction': defineFoundation.adapter({
          dependsOn: ['language/order', 'adapters/postgres/order-store'],
          implements: 'ports/fulfillment-release-transaction',
        }),
        'incoming-order-proposal-store': defineFoundation.adapter({
          dependsOn: [
            'language/incoming-order-proposal',
            'language/order',
            'adapters/postgres/order-store',
          ],
        }),
      }),
    }),
  },
});
