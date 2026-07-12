import type {
  ListProductionLocationsQuery,
  ListProductionLocationsResult,
  ProductionLocation,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type ListProductionLocationsCommand = ListProductionLocationsQuery &
  Readonly<{ allowedLocationIds: readonly string[] | null }>;

export type ListProductionLocations = (
  command: ListProductionLocationsCommand,
) => Promise<Result<ListProductionLocationsResult, AppError>>;

export type ListProductionLocationsRepository = Readonly<{
  listLocations: (input: {
    includeInactive: boolean;
    allowedLocationIds: readonly string[] | null;
  }) => Promise<readonly ProductionLocation[]>;
}>;
