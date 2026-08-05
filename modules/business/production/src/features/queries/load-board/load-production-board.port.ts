import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  ProductionBoard,
  ProductionBoardProjection,
} from '../../../foundations/language/board/production-board-read.model.ts';
import type { LoadProductionBoardCommand } from './load-production-board.model.ts';

export type LoadProductionBoard = (
  command: LoadProductionBoardCommand,
) => Promise<Result<ProductionBoard, ProductionFeatureFailure>>;

export type LoadProductionBoardRepository = Readonly<{
  loadBoardProjection: (
    locationId: string,
    productionRunId: string,
    now: Date,
  ) => Promise<ProductionBoardProjection | null>;
}>;
