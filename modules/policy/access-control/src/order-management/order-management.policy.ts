import {
  allow,
  hasScopedRole,
  type PolicyRule,
} from '@pressly/auth/authorization';
import type { OrderManagementResource } from './order-management.resource.ts';

export const makeOrderManagementPolicies =
  (): readonly PolicyRule<OrderManagementResource>[] => [
    allow({
      id: 'order-management:user:write.owner_admin_global',
      action: 'order-management:user:write',
      when: [hasScopedRole(['owner', 'admin'])],
    }),
    allow({
      id: 'order-management:order:write.owner_admin_in_scope',
      action: 'order-management:order:write',
      when: [hasScopedRole(['owner', 'admin'])],
    }),
  ];
