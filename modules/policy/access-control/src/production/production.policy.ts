import {
  allow,
  hasScopedRole,
  type Action,
  type PolicyRule,
} from '@pressly/auth/authorization';
import type { ProductionResource } from './production.resource.ts';

const actions: readonly Action[] = [
  'production:read',
  'production:schedule',
  'production:accept',
  'production:priority',
  'production:intake',
  'production:resources',
  'production:stage',
];

export const makeProductionPolicies =
  (): readonly PolicyRule<ProductionResource>[] =>
    actions.map((action) =>
      allow({
        id: `${action}.owner_admin_operator_in_scope`,
        action,
        when: [hasScopedRole(['owner', 'admin', 'operator'])],
      }),
    );
