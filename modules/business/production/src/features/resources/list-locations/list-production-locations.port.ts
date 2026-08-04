import type { ListProductionLocationsFailure } from './list-production-locations.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  ProductionLocation,
  ProductionLocations,
} from './list-production-locations.model.ts';

export type ListProductionLocationsCommand = Readonly<{
  includeInactive: boolean;
  allowedLocationIds: readonly string[] | null;
}>;

export type ListProductionLocations = (
  command: ListProductionLocationsCommand,
) => Promise<Result<ProductionLocations, ListProductionLocationsFailure>>;

export type ListProductionLocationsRepository = Readonly<{
  listLocations: (input: {
    includeInactive: boolean;
    allowedLocationIds: readonly string[] | null;
  }) => Promise<readonly ProductionLocation[]>;
}>;
