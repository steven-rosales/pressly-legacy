import type { ProductionWorkspace } from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type { ProductionBoardProjection } from '../production-board-read.policy.ts';

export type ProductionWorkspaceReadModel = Readonly<{
  workspace: ProductionWorkspace & Readonly<{ board: null }>;
  boardProjection: ProductionBoardProjection | null;
}>;

export type LoadProductionWorkspace = (command: {
  locationId: string;
  shiftId?: string;
}) => Promise<Result<ProductionWorkspace, AppError>>;

export type LoadProductionWorkspaceRepository = Readonly<{
  loadWorkspace: (
    locationId: string,
    shiftId: string | undefined,
    now: Date,
  ) => Promise<ProductionWorkspaceReadModel | 'shift_not_found' | null>;
}>;
