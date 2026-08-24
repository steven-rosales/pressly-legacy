/* This file is generated from the checked deployment topology. */
import { makeJobCatalogFromOwners } from '@pressly/generated/job-catalog';
import { composePresslyJobsRuntime } from '@pressly/topology/runtime/jobs';

export const composeJobsRuntime = (
  input: Parameters<typeof composePresslyJobsRuntime>[0],
) => composePresslyJobsRuntime(input, makeJobCatalogFromOwners);
