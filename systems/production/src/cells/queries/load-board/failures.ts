import type { LoadBoardExpectedFailure } from './types.ts';

export const loadBoardNotFound = (): LoadBoardExpectedFailure => ({
  tag: 'ProductionFailure',
  kind: 'not_found',
  code: 'production_board_not_found',
  message: 'The production board was not found.',
  safeMessage: 'The production board was not found.',
});
