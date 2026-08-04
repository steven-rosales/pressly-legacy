export {
  makeProductionApplication,
  makePostgresProductionApplication,
  makePostgresProductionModule,
  makeProductionRoutes,
  productionFailureToAppError,
} from './composition/production.composition.ts';
export type {
  ProductionApplication,
  ProductionApplicationDeps,
  ProductionHttpApplication,
  ProductionRepositories,
  ProductionRouteSecurity,
  ProductionFeatureFailure,
} from './composition/production.composition.ts';
