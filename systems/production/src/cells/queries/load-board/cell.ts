import { defineOperation } from '@pressly/cells';
import type { ProductionBoard } from '../../../read-models/production-board/contract.ts';
import { loadBoardContract } from './contract.ts';
import { makeExecuteLoadBoard, type LoadBoardDependencies } from './execute.ts';
import {
  loadBoardOperationId,
  type LoadBoardExpectedFailure,
  type LoadBoardInput,
} from './types.ts';

export const loadBoardCellDeclaration = defineOperation<
  LoadBoardInput,
  ProductionBoard,
  LoadBoardExpectedFailure
>({
  kind: 'query',
  id: loadBoardOperationId,
  contract: loadBoardContract,
  authorization: {
    capability: 'production:read',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'production.load_board' },
});

export const makeLoadBoardCell = (dependencies: LoadBoardDependencies) =>
  defineOperation(loadBoardCellDeclaration, makeExecuteLoadBoard(dependencies));
