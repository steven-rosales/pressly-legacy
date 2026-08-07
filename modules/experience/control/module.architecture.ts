import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

const customerDependencies = [
  'language/control-context',
  'language/control-customer',
] as const;
const orderDependencies = [
  'language/control-context',
  'language/control-order',
] as const;
const workforceDependencies = [
  'language/control-context',
  'language/control-workforce',
] as const;

export default defineModule({
  id: 'experience/control',
  packageName: '@pressly/control-experience',
  features: defineNamespace({
    session: defineNamespace({
      'resolve-control-access': defineFeature.headlessQuery({
        dependsOn: ['language/control-access'],
      }),
    }),
    customers: defineNamespace({
      'list-control-customers': defineFeature.headlessQuery({
        dependsOn: customerDependencies,
      }),
      'get-control-customer': defineFeature.headlessQuery({
        dependsOn: customerDependencies,
      }),
      'create-control-customer': defineFeature.headlessCommand({
        dependsOn: customerDependencies,
      }),
      'update-control-customer': defineFeature.headlessCommand({
        dependsOn: customerDependencies,
      }),
    }),
    orders: defineNamespace({
      'list-control-orders': defineFeature.headlessQuery({
        dependsOn: orderDependencies,
      }),
      'get-control-order': defineFeature.headlessQuery({
        dependsOn: [...orderDependencies, 'ports/control-order-reader'],
      }),
      'create-control-order': defineFeature.headlessCommand({
        dependsOn: orderDependencies,
      }),
      'correct-control-order': defineFeature.headlessCommand({
        dependsOn: [...orderDependencies, 'ports/control-order-reader'],
      }),
    }),
    workforce: defineNamespace({
      'list-control-members': defineFeature.headlessQuery({
        dependsOn: workforceDependencies,
      }),
      'get-control-member': defineFeature.headlessQuery({
        dependsOn: workforceDependencies,
      }),
      'list-control-member-sessions': defineFeature.headlessQuery({
        dependsOn: workforceDependencies,
      }),
      'revoke-control-member-sessions': defineFeature.headlessCommand({
        dependsOn: workforceDependencies,
      }),
      'transition-control-membership': defineFeature.headlessCommand({
        dependsOn: workforceDependencies,
      }),
      'grant-control-access': defineFeature.headlessCommand({
        dependsOn: workforceDependencies,
      }),
      'revoke-control-access': defineFeature.headlessCommand({
        dependsOn: workforceDependencies,
      }),
    }),
    invitations: defineNamespace({
      'list-control-invitations': defineFeature.headlessQuery({
        dependsOn: workforceDependencies,
      }),
      'issue-control-invitation': defineFeature.headlessCommand({
        dependsOn: workforceDependencies,
      }),
      'reissue-control-invitation': defineFeature.headlessCommand({
        dependsOn: workforceDependencies,
      }),
      'revoke-control-invitation': defineFeature.headlessCommand({
        dependsOn: workforceDependencies,
      }),
      'preview-control-invitation': defineFeature.headlessQuery({
        dependsOn: ['language/control-workforce'],
      }),
      'accept-control-invitation': defineFeature.headlessCommand({
        dependsOn: ['language/control-workforce'],
      }),
    }),
    security: defineNamespace({
      'read-control-security-events': defineFeature.headlessQuery({
        dependsOn: workforceDependencies,
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
      'control-order': defineFoundation.language({
        dependsOn: ['language/control-access'],
      }),
      'control-workforce': defineFoundation.language(),
    }),
    ports: defineNamespace({
      'control-order-reader': defineFoundation.port({
        dependsOn: ['language/control-order'],
      }),
    }),
  },
});
