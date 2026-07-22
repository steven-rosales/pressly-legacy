export type { AccessControlModule, AccessControlModuleDeps } from './main.ts';
export { makeAccessControlModule } from './main.ts';
export type { OrderManagementAccessControl } from './order-management/order-management.guard.ts';
export { makeOrderManagementPolicies } from './order-management/order-management.policy.ts';
export {
  orderManagementLocationResource,
  orderManagementUsersResource,
  type OrderManagementLocationResource,
  type OrderManagementUsersResource,
} from './order-management/order-management.resource.ts';
export type { ProductionAccessControl } from './production/production.guard.ts';
export { makeProductionPolicies } from './production/production.policy.ts';
export {
  productionLocationResource,
  type ProductionLocationResource,
} from './production/production.resource.ts';
