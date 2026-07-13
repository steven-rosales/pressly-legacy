import type { ProductionWorkspace } from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type LoadProductionWorkspace = (command: {
  locationId: string;
}) => Promise<Result<ProductionWorkspace, AppError>>;

export type LoadProductionWorkspaceRepository = Readonly<{
  loadWorkspace: (
    locationId: string,
    now: Date,
  ) => Promise<ProductionWorkspace | null>;
}>;
