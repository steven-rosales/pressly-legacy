export {
  makeProductionApplication,
  makePostgresProductionApplication,
  makePostgresProductionModule,
  makeProductionRoutes,
} from './composition/production.composition.ts';
export type {
  ProductionApplication,
  ProductionApplicationDeps,
  ProductionHttpApplication,
  ProductionRepositories,
  ProductionRouteSecurity,
} from './composition/production.composition.ts';
