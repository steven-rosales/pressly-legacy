export { makeAuthorizationModule } from './main.ts';
export type { AuthorizationModule, AuthorizationModuleDeps } from './main.ts';

export { makeOrderManagementPolicies } from './features/commercial/authorize-order-management/order-management-authorization.policy.ts';
export {
  orderManagementLocationResource,
  orderManagementUsersResource,
  type OrderManagementLocationResource,
  type OrderManagementUsersResource,
} from './features/commercial/authorize-order-management/order-management-resource.value.ts';
export {
  makeProductionPolicies,
  productionCapabilitiesForLocation,
  productionCapabilityActions,
  productionFloorActions,
  productionManagerActions,
  type ProductionCapabilityAction,
} from './features/operations/authorize-production/production-authorization.policy.ts';
export {
  productionLocationResource,
  type ProductionLocationResource,
} from './features/operations/authorize-production/production-resource.value.ts';
export type { LocationAncestryPort } from './foundations/ports/location-ancestry/location-ancestry.port.ts';
