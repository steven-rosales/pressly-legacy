import {
  composePresslyJobs,
  type PresslyJobCatalogFactory,
} from './pressly-jobs.composition.js';
import type {
  PresslyJobsCompositionInput,
  PresslyJobsProcessAssembly,
} from './types.js';

export const composePresslyJobsRuntime = (
  input: PresslyJobsCompositionInput,
  makeCatalog: PresslyJobCatalogFactory,
): PresslyJobsProcessAssembly => composePresslyJobs(input, makeCatalog);

export type {
  PresslyJobCatalogFactory,
  PresslyJobRuntimeOwners,
} from './pressly-jobs.composition.js';
export type {
  PresslyJobsCompositionInput,
  PresslyJobsHostMechanisms,
  PresslyJobsProcessAssembly,
} from './types.js';
