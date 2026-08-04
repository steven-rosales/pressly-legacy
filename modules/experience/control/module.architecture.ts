import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

export default defineModule({
  id: 'experience/control',
  packageName: '@pressly/control-experience',
  features: defineNamespace({
    session: defineNamespace({
      'resolve-control-access': defineFeature.headlessQuery({
        dependsOn: ['language/control-access', 'ports/control-access-store'],
      }),
    }),
    customers: defineNamespace({
      'manage-control-customers': defineFeature.headlessCommand({
        dependsOn: [
          'language/control-context',
          'language/control-customer',
          'ports/control-customers',
        ],
      }),
    }),
    orders: defineNamespace({
      'manage-control-orders': defineFeature.headlessCommand({
        dependsOn: [
          'language/control-access',
          'language/control-context',
          'language/control-order',
          'ports/control-orders',
        ],
      }),
    }),
    workforce: defineNamespace({
      'manage-control-workforce': defineFeature.headlessCommand({
        dependsOn: [
          'language/control-context',
          'language/control-workforce',
          'ports/control-workforce',
        ],
      }),
    }),
    invitations: defineNamespace({
      'manage-control-invitations': defineFeature.headlessCommand({
        dependsOn: [
          'language/control-context',
          'language/control-workforce',
          'ports/control-workforce',
        ],
      }),
    }),
    security: defineNamespace({
      'read-control-security-events': defineFeature.headlessQuery({
        dependsOn: [
          'language/control-context',
          'language/control-workforce',
          'ports/control-workforce',
        ],
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      'control-access': defineFoundation.language(),
      'control-context': defineFoundation.language({
        dependsOn: ['language/control-access'],
      }),
      'control-customer': defineFoundation.language(),
      'control-order': defineFoundation.language(),
      'control-workforce': defineFoundation.language(),
    }),
    ports: defineNamespace({
      'control-access-store': defineFoundation.port({
        dependsOn: ['language/control-access'],
      }),
      'control-customers': defineFoundation.port({
        dependsOn: ['language/control-context', 'language/control-customer'],
      }),
      'control-orders': defineFoundation.port({
        dependsOn: ['language/control-context', 'language/control-order'],
      }),
      'control-workforce': defineFoundation.port({
        dependsOn: ['language/control-workforce'],
      }),
    }),
    adapters: defineNamespace({
      postgres: defineNamespace({
        'control-access-store': defineFoundation.adapter({
          dependsOn: ['ports/control-access-store'],
        }),
      }),
    }),
  },
});
