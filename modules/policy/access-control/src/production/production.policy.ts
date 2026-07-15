import {
  allow,
  hasScopedRole,
  type Action,
  type PolicyRule,
} from '@pressly/auth/authorization';
import type { ProductionResource } from './production.resource.ts';

const floorActions: readonly Action[] = [
  'production:read',
  'production:priority',
  'production:intake',
  'production:stage',
  'production:queue',
];

const managerActions: readonly Action[] = [
  'production:schedule',
  'production:accept',
  'production:start',
  'production:override',
  'production:resources',
];

export const makeProductionPolicies =
  (): readonly PolicyRule<ProductionResource>[] => [
    ...floorActions.map((action) =>
      allow({
        id: `${action}.owner_admin_operator_in_scope`,
        action,
        when: [hasScopedRole(['owner', 'admin', 'operator'])],
      }),
    ),
    ...managerActions.map((action) =>
      allow({
        id: `${action}.owner_admin_in_scope`,
        action,
        when: [hasScopedRole(['owner', 'admin'])],
      }),
    ),
  ];
