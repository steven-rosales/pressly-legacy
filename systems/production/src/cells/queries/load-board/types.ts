import type { BoardProjection } from '../../../read-models/production-board/model.ts';

export const loadBoardOperationId = 'production.load-board.v1' as const;

export type LoadBoardInput = Readonly<{
  locationId: string;
  productionRunId: string;
}>;

export type LoadBoardRepository = Readonly<{
  load: (
    locationId: string,
    productionRunId: string,
    asOf: Date,
  ) => Promise<BoardProjection | null>;
}>;

export type LoadBoardClock = Readonly<{ now: () => Date }>;

export type LoadBoardExpectedFailure = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_board_not_found';
  message: 'The production board was not found.';
  safeMessage: 'The production board was not found.';
}>;
