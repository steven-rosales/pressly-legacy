import {
  allow,
  authorize,
  hasActiveRole,
  hasScopedRole,
  type Action,
  type PrincipalAttributes,
  type PolicyRule,
} from '../../public.ts';
import type { Principal } from '../../../authentication/public.ts';
import {
  productionLocationResource,
  type ProductionResource,
} from './production-resource.value.ts';

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

const productionLocationManagerActions = productionManagerActions.filter(
  (action) => action !== 'production:resources',
);

export const makeProductionPolicies =
  (): readonly PolicyRule<ProductionResource>[] => [
    ...productionFloorActions.map((action) =>
      allow({
        id: `${action}.owner_manager_operator_in_scope`,
        action,
        when: [hasScopedRole(['owner', 'manager', 'operator'])],
      }),
    ),
    ...productionLocationManagerActions.map((action) =>
      allow({
        id: `${action}.owner_manager_in_scope`,
        action,
        when: [hasScopedRole(['owner', 'manager'])],
      }),
    ),
    allow({
      id: 'production:resources.active_owner_manager',
      action: 'production:resources',
      when: [hasActiveRole(['owner', 'manager'])],
    }),
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
