import type {
  ProductionBoard,
  ProductionBoardParams,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  StageTransitionContext,
  Transactional,
} from '../production.port.ts';

export type LoadProductionBoard = (
  command: ProductionBoardParams & { locationId: string },
) => Promise<Result<ProductionBoard, AppError>>;

export type LoadProductionBoardRepository = Transactional<
  Readonly<{
    loadBoard: (
      locationId: string,
      productionShiftId: string,
      now: Date,
    ) => Promise<ProductionBoard | null>;
    loadStageTransitionContext: (
      locationId: string,
      stageRunId: string,
      now: Date,
    ) => Promise<StageTransitionContext | null>;
  }>
>;
