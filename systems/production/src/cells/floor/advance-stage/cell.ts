import { bindCell, declareCommandCell } from '@pressly/cells';
import { advanceStageContract } from './contract.ts';
import { advanceStageOperationId } from './decide.ts';
import {
  makeExecuteAdvanceStage,
  type AdvanceStageDependencies,
} from './execute.ts';
import { advanceStageHttpSurfaces } from './http.ts';
import type {
  AdvanceStageCommand,
  AdvanceStageExpectedFailure,
  AdvanceStageResult,
} from './types.ts';

export const advanceStageCellDeclaration = declareCommandCell<
  AdvanceStageCommand,
  AdvanceStageResult,
  AdvanceStageExpectedFailure
>({
  id: advanceStageOperationId,
  contract: advanceStageContract,
  authorization: {
    capability: 'production:stage',
    timing: 'before-input',
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
  },
  surfaces: advanceStageHttpSurfaces,
  emits: [],
  consumes: [],
  observability: {
    operation: 'production.advance_stage',
  },
});

export const makeAdvanceStageCell = <StoredWorkEvent>(
  deps: AdvanceStageDependencies<StoredWorkEvent>,
) => bindCell(advanceStageCellDeclaration, makeExecuteAdvanceStage(deps));
