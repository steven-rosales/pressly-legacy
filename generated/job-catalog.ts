/* This file is generated from the checked deployment topology. */
import { defineJobCatalog, type ExecutableJobCatalog } from '@pressly/cells';
import { makeIngressSystem as assemble0 } from '@pressly/ingress-system';
import { makeProductionSystem as assemble1 } from '@pressly/production-system';

export type JobCatalogOwners = Readonly<{
  'system:ingress': Awaited<ReturnType<typeof assemble0>>;
  'system:production': Awaited<ReturnType<typeof assemble1>>;
}>;

export type JobCatalogDependencies = Readonly<{
  'system:ingress': Parameters<typeof assemble0>;
  'system:production': Parameters<typeof assemble1>;
}>;

export const makeJobCatalogFromOwners = (
  owners: JobCatalogOwners,
): ExecutableJobCatalog =>
  defineJobCatalog([
    owners['system:ingress'].cells['processInboundEvent'],
    owners['system:production'].cells['applyFulfillmentDemand'],
  ] as const);

export const makeJobCatalog = async (
  dependencies: JobCatalogDependencies,
): Promise<ExecutableJobCatalog> => {
  const owner0 = await assemble0(...dependencies['system:ingress']);
  const owner1 = await assemble1(...dependencies['system:production']);

  return makeJobCatalogFromOwners({
    'system:ingress': owner0,
    'system:production': owner1,
  });
};
