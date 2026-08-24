import { bindCell, declareCommandCell } from '@pressly/cells';
import { startScheduleContract } from './contract.ts';
import { startScheduleOperationId } from './decide.ts';
import {
  makeExecuteStartSchedule,
  type StartScheduleDependencies,
} from './execute.ts';
import { startScheduleHttpSurfaces } from './http.ts';
import type {
  StartScheduleCommand,
  StartScheduleExpectedFailure,
  StartScheduleResult,
} from './types.ts';

export const startScheduleCellDeclaration = declareCommandCell<
  StartScheduleCommand,
  StartScheduleResult,
  StartScheduleExpectedFailure
>({
  id: startScheduleOperationId,
  contract: startScheduleContract,
  authorization: {
    capability: 'production:start',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.locationId,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: startScheduleHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.start_schedule' },
});

export const makeStartScheduleCell = <StoredWorkEvent>(
  deps: StartScheduleDependencies<StoredWorkEvent>,
) => bindCell(startScheduleCellDeclaration, makeExecuteStartSchedule(deps));
