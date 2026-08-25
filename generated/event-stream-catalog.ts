/* This file is generated from the checked deployment topology. */
import {
  defineEventStreamCatalog,
  type ExecutableEventStreamCatalog,
} from '@pressly/cells';
import { makeProductionSystem as assemble0 } from '@pressly/production-system';

export type EventStreamCatalogOwners = Readonly<{
  'system:production': Awaited<ReturnType<typeof assemble0>>;
}>;

export type EventStreamCatalogDependencies = Readonly<{
  'system:production': Parameters<typeof assemble0>;
}>;

export const makeEventStreamCatalogFromOwners = (
  owners: EventStreamCatalogOwners,
): ExecutableEventStreamCatalog =>
  defineEventStreamCatalog([
    owners['system:production'].cells['subscribeChanges'],
  ] as const);

export const makeEventStreamCatalog = async (
  dependencies: EventStreamCatalogDependencies,
): Promise<ExecutableEventStreamCatalog> => {
  const owner0 = await assemble0(...dependencies['system:production']);

  return makeEventStreamCatalogFromOwners({
    'system:production': owner0,
  });
};
