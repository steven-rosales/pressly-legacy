import {
  composePresslyJobsRuntime,
  type PresslyJobsCompositionInput,
} from './runtime/jobs/public.js';
import { makeJobCatalogFromOwners } from './runtime/jobs/catalog.js';

export const composeJobsRuntime = (input: PresslyJobsCompositionInput) =>
  composePresslyJobsRuntime(input, makeJobCatalogFromOwners);

export { makeJobCatalogFromOwners } from './runtime/jobs/catalog.js';
