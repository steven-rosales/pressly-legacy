import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

const command = [
  'language/commands',
  'language/failures',
  'adapters/postgres/commands',
] as const;

const query = ['language/failures', 'adapters/postgres/commands'] as const;

const httpFailure = ['adapters/errors'] as const;

export default defineModule({
  id: 'business/production',
  packageName: '@pressly/production',
  features: defineNamespace({
    demand: defineNamespace({
      'apply-fulfillment-demand': defineFeature.headlessCommand({
        dependsOn: [...command, 'language/execution', 'language/rules'],
      }),
      'change-admission': defineFeature.httpCommand({
        dependsOn: [...command, ...httpFailure, 'language/rules'],
      }),
      'change-order-resolution': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
          'adapters/postgres/orders',
        ],
      }),
      'resolve-source-closed-fulfillment': defineFeature.headlessCommand({
        dependsOn: ['language/failures'],
      }),
      'record-order-intake': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
        ],
      }),
      'commit-production-order-backlog': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/production-order-backlog',
          'language/resolution',
          'ports/production-order-backlog-cursor',
          'ports/production-order-backlog-snapshot',
          'adapters/postgres/production-order-backlog-snapshot',
        ],
      }),
      'preview-production-order-backlog': defineFeature.httpQuery({
        dependsOn: [
          ...httpFailure,
          'language/failures',
          'language/production-order-backlog',
          'language/resolution',
          'ports/production-order-backlog-cursor',
          'ports/production-order-backlog-snapshot',
          'adapters/postgres/production-order-backlog-snapshot',
        ],
      }),
      'set-order-priority': defineFeature.httpCommand({
        dependsOn: [...command, ...httpFailure, 'language/rules'],
      }),
    }),
    floor: defineNamespace({
      'advance-stage': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
          'ports/signals',
          'adapters/postgres/execution',
        ],
      }),
      'assign-stage-machines': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
          'adapters/postgres/execution',
        ],
      }),
      'manage-batch-membership': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/rules',
          'ports/signals',
        ],
      }),
      'reconcile-batch-progress': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
          'ports/signals',
          'adapters/postgres/execution',
        ],
      }),
    }),
    history: defineNamespace({
      'list-activity': defineFeature.httpQuery({
        dependsOn: [
          ...query,
          ...httpFailure,
          'language/history',
          'adapters/postgres/history',
        ],
      }),
      'list-plans': defineFeature.httpQuery({
        dependsOn: [
          ...query,
          ...httpFailure,
          'language/history',
          'adapters/postgres/history',
        ],
      }),
      'list-runs': defineFeature.httpQuery({
        dependsOn: [
          ...query,
          ...httpFailure,
          'language/history',
          'adapters/postgres/history',
        ],
      }),
      'load-run': defineFeature.httpQuery({
        dependsOn: [
          ...query,
          ...httpFailure,
          'language/history',
          'adapters/postgres/history',
        ],
      }),
    }),
    orders: defineNamespace({
      'list-order-control': defineFeature.httpQuery({
        dependsOn: [
          ...query,
          ...httpFailure,
          'language/due-dates',
          'language/execution',
          'language/order-routing',
          'language/orders',
          'language/resolution',
          'language/rules',
          'adapters/postgres/orders',
        ],
      }),
      'list-orders': defineFeature.httpQuery({
        dependsOn: [...query, ...httpFailure, 'language/orders'],
      }),
      'route-order': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/order-routing',
          'language/rules',
          'ports/signals',
        ],
      }),
    }),
    queries: defineNamespace({
      'load-board': defineFeature.httpQuery({
        dependsOn: [
          ...query,
          ...httpFailure,
          'language/board',
          'language/rules',
          'adapters/postgres/board',
        ],
      }),
      'load-remaining-day-forecast': defineFeature.httpQuery({
        dependsOn: [
          ...query,
          ...httpFailure,
          'language/rules',
          'language/scheduling',
          'adapters/postgres/scheduling',
        ],
      }),
      'load-workspace': defineFeature.httpQuery({
        dependsOn: [
          ...query,
          ...httpFailure,
          'language/board',
          'language/due-dates',
          'language/execution',
          'language/orders',
          'language/rules',
          'language/scheduling',
          'algorithms/approved-production',
          'adapters/postgres/board',
          'adapters/postgres/scheduling',
        ],
      }),
    }),
    resources: defineNamespace({
      'list-locations': defineFeature.httpQuery({
        dependsOn: [...query, ...httpFailure],
      }),
      'manage-resources': defineFeature.headlessCommand({
        dependsOn: command,
      }),
      'create-production-shift': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/rules',
          'language/shifts',
          'adapters/postgres/scheduling',
        ],
      }),
      'update-production-shift': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
          'language/shifts',
          'ports/signals',
          'adapters/postgres/scheduling',
        ],
      }),
    }),
    scheduling: defineNamespace({
      'accept-schedule': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
          'language/scheduling',
          'adapters/postgres/scheduling',
        ],
      }),
      'create-schedule': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
          'language/scheduling',
          'ports/signals',
          'algorithms/approved-production',
          'adapters/postgres/scheduling',
        ],
      }),
      'load-schedule': defineFeature.httpQuery({
        dependsOn: [
          'language/scheduling',
          'language/failures',
          ...httpFailure,
          'adapters/postgres/commands',
          'adapters/postgres/scheduling',
        ],
      }),
      'place-order': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
          'language/scheduling',
          'algorithms/approved-production',
          'ports/signals',
          'adapters/postgres/scheduling',
        ],
      }),
      'publish-config': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/scheduling',
          'adapters/postgres/scheduling',
        ],
      }),
      'replace-shift-selection': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
          'ports/signals',
        ],
      }),
      'start-schedule': defineFeature.httpCommand({
        dependsOn: [
          ...command,
          ...httpFailure,
          'language/execution',
          'language/rules',
          'language/scheduling',
          'ports/signals',
          'adapters/postgres/scheduling',
        ],
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      admission: defineFoundation.language(),
      'batch-membership': defineFoundation.language(),
      board: defineFoundation.language({
        dependsOn: [
          'language/due-dates',
          'language/execution',
          'language/orders',
          'language/rules',
        ],
      }),
      commands: defineFoundation.language({
        dependsOn: ['language/failures'],
      }),
      'current-plan': defineFoundation.language(),
      demand: defineFoundation.language(),
      'due-dates': defineFoundation.language(),
      eligibility: defineFoundation.language(),
      execution: defineFoundation.language(),
      failures: defineFoundation.language(),
      history: defineFoundation.language({
        dependsOn: ['language/failures'],
      }),
      lifecycles: defineFoundation.language(),
      'machine-assignment': defineFoundation.language(),
      'order-routing': defineFoundation.language(),
      orders: defineFoundation.language({
        dependsOn: ['language/due-dates'],
      }),
      placement: defineFoundation.language(),
      'progress-reconciliation': defineFoundation.language(),
      'production-order-backlog': defineFoundation.language({
        dependsOn: ['language/execution', 'language/resolution'],
      }),
      resolution: defineFoundation.language({
        dependsOn: ['language/execution', 'language/rules'],
      }),
      rules: defineFoundation.language({
        dependsOn: [
          'language/admission',
          'language/batch-membership',
          'language/current-plan',
          'language/demand',
          'language/eligibility',
          'language/lifecycles',
          'language/machine-assignment',
          'language/order-routing',
          'language/placement',
          'language/progress-reconciliation',
          'language/schedule-acceptance',
          'language/schedule-start',
          'language/shift-planning-window',
          'language/stage-transition',
        ],
      }),
      'schedule-acceptance': defineFoundation.language(),
      'schedule-start': defineFoundation.language(),
      scheduling: defineFoundation.language(),
      'shift-planning-window': defineFoundation.language(),
      shifts: defineFoundation.language(),
      'stage-transition': defineFoundation.language(),
    }),
    algorithms: defineNamespace({
      'approved-production': defineFoundation.algorithm({
        dependsOn: [
          'language/scheduling',
          'algorithms/demand-forecast-v1',
          'algorithms/fixed-pulse-ffd-v2',
          'algorithms/online-stable-insertion-v1',
          'algorithms/remaining-day-forecast-v1',
        ],
      }),
      'demand-forecast-v1': defineFoundation.algorithm({
        dependsOn: ['algorithms/fixed-pulse'],
      }),
      'fixed-pulse': defineFoundation.algorithm(),
      'fixed-pulse-ffd-v2': defineFoundation.algorithm({
        dependsOn: ['algorithms/fixed-pulse'],
      }),
      'online-stable-insertion-v1': defineFoundation.algorithm(),
      'remaining-day-forecast-v1': defineFoundation.algorithm(),
    }),
    ports: defineNamespace({
      'production-order-backlog-cursor': defineFoundation.port({
        dependsOn: ['language/production-order-backlog'],
      }),
      'production-order-backlog-snapshot': defineFoundation.port({
        dependsOn: ['language/production-order-backlog'],
      }),
      signals: defineFoundation.port({
        dependsOn: ['language/execution'],
      }),
    }),
    adapters: defineNamespace({
      errors: defineFoundation.adapter({
        dependsOn: ['language/failures'],
      }),
      signals: defineFoundation.adapter({
        dependsOn: ['ports/signals'],
        implements: 'ports/signals',
      }),
      contracts: defineNamespace({
        'production-order-backlog-cursor': defineFoundation.adapter({
          dependsOn: ['language/production-order-backlog'],
          implements: 'ports/production-order-backlog-cursor',
        }),
      }),
      postgres: defineNamespace({
        board: defineFoundation.adapter({
          dependsOn: ['language/board'],
        }),
        commands: defineFoundation.adapter({
          dependsOn: ['language/commands'],
        }),
        execution: defineFoundation.adapter({
          dependsOn: ['language/execution', 'adapters/postgres/scheduling'],
        }),
        history: defineFoundation.adapter({
          dependsOn: ['language/history'],
        }),
        orders: defineFoundation.adapter(),
        'production-order-backlog-snapshot': defineFoundation.adapter({
          dependsOn: [
            'language/production-order-backlog',
            'adapters/postgres/orders',
          ],
          implements: 'ports/production-order-backlog-snapshot',
        }),
        scheduling: defineFoundation.adapter({
          dependsOn: ['language/scheduling', 'language/shifts'],
        }),
      }),
    }),
  },
});
