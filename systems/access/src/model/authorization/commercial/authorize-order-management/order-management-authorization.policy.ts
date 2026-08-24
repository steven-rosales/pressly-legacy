import { allow, hasScopedRole, type PolicyRule } from '../../public.ts';
import type { OrderManagementLocationResource } from './order-management-resource.value.ts';

export const makeOrderManagementPolicies =
  (): readonly PolicyRule<OrderManagementLocationResource>[] => [
    allow({
      id: 'order-management:order:write.owner_manager_in_scope',
      action: 'order-management:order:write',
      when: [hasScopedRole(['owner', 'manager'])],
    }),
  ];
