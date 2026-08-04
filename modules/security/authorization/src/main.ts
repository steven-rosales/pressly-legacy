export {
  makeAuthorizationModule,
  makeOrderManagementPolicies,
  makeProductionPolicies,
  orderManagementLocationResource,
  orderManagementUsersResource,
  productionCapabilitiesForLocation,
  productionCapabilityActions,
  productionFloorActions,
  productionLocationResource,
  productionManagerActions,
} from './composition/authorization.composition.ts';

export type {
  AuthorizationModule,
  AuthorizationModuleDeps,
  LocationAncestryPort,
  OrderManagementLocationResource,
  OrderManagementUsersResource,
  ProductionCapabilityAction,
  ProductionLocationResource,
} from './composition/authorization.composition.ts';
