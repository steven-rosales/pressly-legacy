import { bindCell, declareCommandCell } from '@pressly/cells';
import { acceptScheduleContract } from './contract.ts';
import { acceptScheduleOperationId } from './decide.ts';
import {
  makeExecuteAcceptSchedule,
  type AcceptScheduleDependencies,
} from './execute.ts';
import { acceptScheduleHttpSurfaces } from './http.ts';
import type {
  AcceptScheduleCommand,
  AcceptScheduleExpectedFailure,
  AcceptScheduleResult,
} from './types.ts';

export const acceptScheduleCellDeclaration = declareCommandCell<
  AcceptScheduleCommand,
  AcceptScheduleResult,
  AcceptScheduleExpectedFailure
>({
  id: acceptScheduleOperationId,
  contract: acceptScheduleContract,
  authorization: {
    capability: 'production:accept',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: { transaction: 'required', concurrency: 'optimistic' },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: acceptScheduleHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.accept_schedule' },
});

export const makeAcceptScheduleCell = <StoredWorkEvent>(
  deps: AcceptScheduleDependencies<StoredWorkEvent>,
) => bindCell(acceptScheduleCellDeclaration, makeExecuteAcceptSchedule(deps));
