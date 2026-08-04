import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

const inboxLifecycleDependency = ['language/inbox'] as const;
const inboxQueueDependencies = [
  'language/inbox',
  'ports/webhook-inbox-queue-store',
] as const;
const eventFailureDependencies = [
  'language/inbox',
  'ports/webhook-event-failure-store',
] as const;
const deadEventDependencies = [
  'language/dead-events',
  'ports/dead-webhook-event-store',
] as const;
const quarantineReceiptDependencies = [
  'language/quarantine-receipts',
  'ports/webhook-receipt-quarantine-store',
] as const;
const sourceLocationBindingDependencies = [
  'language/source-location-bindings',
  'ports/source-location-binding-store',
] as const;

export default defineModule({
  id: 'integration/webhook-ingestion',
  packageName: '@pressly/webhook-ingestion',
  features: defineNamespace({
    inbox: defineNamespace({
      'ingest-event': defineFeature.headlessCommand(),
      'claim-events': defineFeature.headlessCommand({
        dependsOn: inboxQueueDependencies,
      }),
      'measure-webhook-backlog': defineFeature.headlessQuery({
        dependsOn: inboxQueueDependencies,
      }),
      'complete-event': defineFeature.headlessCommand({
        dependsOn: inboxLifecycleDependency,
      }),
      'retry-event': defineFeature.headlessCommand({
        dependsOn: eventFailureDependencies,
      }),
      'dead-letter-event': defineFeature.headlessCommand({
        dependsOn: eventFailureDependencies,
      }),
      'list-dead-events': defineFeature.headlessQuery({
        dependsOn: deadEventDependencies,
      }),
      'replay-dead-event': defineFeature.headlessCommand({
        dependsOn: deadEventDependencies,
      }),
    }),
    quarantine: defineNamespace({
      'capture-webhook-receipt': defineFeature.headlessCommand({
        dependsOn: quarantineReceiptDependencies,
      }),
      'link-webhook-receipt': defineFeature.headlessCommand({
        dependsOn: quarantineReceiptDependencies,
      }),
      'purge-expired-webhook-receipts': defineFeature.headlessCommand({
        dependsOn: quarantineReceiptDependencies,
      }),
    }),
    bindings: defineNamespace({
      'resolve-source-location': defineFeature.headlessQuery({
        dependsOn: sourceLocationBindingDependencies,
      }),
      'reconcile-source-location-bindings': defineFeature.headlessCommand({
        dependsOn: sourceLocationBindingDependencies,
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      inbox: defineFoundation.language(),
      'dead-events': defineFoundation.language(),
      'quarantine-receipts': defineFoundation.language(),
      'source-location-bindings': defineFoundation.language(),
    }),
    ports: defineNamespace({
      'webhook-inbox-queue-store': defineFoundation.port({
        dependsOn: ['language/inbox'],
      }),
      'webhook-event-failure-store': defineFoundation.port({
        dependsOn: ['language/inbox'],
      }),
      'dead-webhook-event-store': defineFoundation.port({
        dependsOn: ['language/dead-events'],
      }),
      'webhook-receipt-quarantine-store': defineFoundation.port({
        dependsOn: ['language/quarantine-receipts'],
      }),
      'source-location-binding-store': defineFoundation.port({
        dependsOn: ['language/source-location-bindings'],
      }),
    }),
    adapters: defineNamespace({
      postgres: defineNamespace({
        'webhook-inbox-queue-store': defineFoundation.adapter({
          dependsOn: ['language/inbox', 'ports/webhook-inbox-queue-store'],
        }),
        'webhook-event-failure-store': defineFoundation.adapter({
          dependsOn: ['ports/webhook-event-failure-store'],
        }),
        'dead-webhook-event-store': defineFoundation.adapter({
          dependsOn: ['ports/dead-webhook-event-store'],
        }),
        'webhook-receipt-quarantine-store': defineFoundation.adapter({
          dependsOn: ['ports/webhook-receipt-quarantine-store'],
        }),
        'source-location-binding-store': defineFoundation.adapter({
          dependsOn: ['ports/source-location-binding-store'],
        }),
      }),
    }),
  },
});
