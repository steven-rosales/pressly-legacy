import type {
  ProductionBoard,
  ProductionRunBoardParams,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type { ProductionBoardProjection } from '../production-board-read.policy.ts';

export type LoadProductionBoard = (
  command: ProductionRunBoardParams,
) => Promise<Result<ProductionBoard, AppError>>;

export type LoadProductionBoardRepository = Readonly<{
  loadBoardProjection: (
    locationId: string,
    productionRunId: string,
    now: Date,
  ) => Promise<ProductionBoardProjection | null>;
}>;
