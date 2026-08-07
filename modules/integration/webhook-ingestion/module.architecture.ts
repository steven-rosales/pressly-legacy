import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

const inboxLifecycleDependency = ['language/inbox'] as const;
const eventFailureDependencies = [
  'language/inbox',
  'adapters/postgres/webhook-event-claim-fence',
] as const;

export default defineModule({
  id: 'integration/webhook-ingestion',
  packageName: '@pressly/webhook-ingestion',
  features: defineNamespace({
    inbox: defineNamespace({
      'ingest-event': defineFeature.headlessCommand(),
      'claim-events': defineFeature.headlessCommand({
        dependsOn: inboxLifecycleDependency,
      }),
      'measure-webhook-backlog': defineFeature.headlessQuery({
        dependsOn: inboxLifecycleDependency,
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
        dependsOn: [],
      }),
      'replay-dead-event': defineFeature.headlessCommand({
        dependsOn: [],
      }),
    }),
    quarantine: defineNamespace({
      'capture-webhook-receipt': defineFeature.headlessCommand({
        dependsOn: [],
      }),
      'link-webhook-receipt': defineFeature.headlessCommand({
        dependsOn: [],
      }),
      'purge-expired-webhook-receipts': defineFeature.headlessCommand({
        dependsOn: [],
      }),
    }),
    bindings: defineNamespace({
      'resolve-source-location': defineFeature.headlessQuery({
        dependsOn: [],
      }),
      'reconcile-source-location-bindings': defineFeature.headlessCommand({
        dependsOn: [],
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      inbox: defineFoundation.language(),
    }),
    adapters: defineNamespace({
      postgres: defineNamespace({
        'webhook-event-claim-fence': defineFoundation.adapter(),
      }),
    }),
  },
});
