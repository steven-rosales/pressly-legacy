import {
  allow,
  authorize,
  hasScopedRole,
  type Action,
  type PrincipalAttributes,
  type PolicyRule,
} from '@pressly/auth/authorization';
import type { Principal } from '@pressly/auth/authentication';
import {
  productionLocationResource,
  type ProductionResource,
} from './production.resource.ts';

export const productionFloorActions = [
  'production:read',
  'production:priority',
  'production:intake',
  'production:admission',
  'production:stage',
  'production:queue',
] as const satisfies readonly Action[];

export const productionManagerActions = [
  'production:schedule',
  'production:accept',
  'production:start',
  'production:override',
  'production:resources',
] as const satisfies readonly Action[];

export type ProductionCapabilityAction =
  | (typeof productionFloorActions)[number]
  | (typeof productionManagerActions)[number];

export const productionCapabilityActions: readonly ProductionCapabilityAction[] =
  [...productionFloorActions, ...productionManagerActions];

const productionLocationCapabilityActions = productionCapabilityActions.filter(
  (action) => action !== 'production:resources',
);

export const makeProductionPolicies =
  (): readonly PolicyRule<ProductionResource>[] => [
    ...productionFloorActions.map((action) =>
      allow({
        id: `${action}.owner_manager_admin_operator_in_scope`,
        action,
        when: [hasScopedRole(['owner', 'manager', 'admin', 'operator'])],
      }),
    ),
    ...productionManagerActions.map((action) =>
      allow({
        id: `${action}.owner_manager_admin_in_scope`,
        action,
        when: [hasScopedRole(['owner', 'manager', 'admin'])],
      }),
    ),
  ];

export const productionCapabilitiesForLocation = (input: {
  principal: Principal;
  principalAttributes: PrincipalAttributes;
  locationId: string;
  businessId: string;
  now: Date;
}): readonly ProductionCapabilityAction[] => {
  const policies = makeProductionPolicies();
  const resource = productionLocationResource(
    input.locationId,
    input.businessId,
  );

  return productionLocationCapabilityActions.filter(
    (action) =>
      authorize({
        principal: input.principal,
        principalAttributes: input.principalAttributes,
        action,
        resource,
        environment: { now: input.now },
        policies,
      }).tag === 'allowed',
  );
};
