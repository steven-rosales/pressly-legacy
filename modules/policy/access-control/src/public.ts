export type { AccessControlModule, AccessControlModuleDeps } from './main.ts';
export { makeAccessControlModule } from './main.ts';
export type { ProductionAccessControl } from './production/production.guard.ts';
export { makeProductionPolicies } from './production/production.policy.ts';
export {
  productionLocationResource,
  type ProductionLocationResource,
} from './production/production.resource.ts';
