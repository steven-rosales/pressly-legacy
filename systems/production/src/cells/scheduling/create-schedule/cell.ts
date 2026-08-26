import { defineOperation } from '@pressly/cells';
import { createScheduleContract } from './contract.ts';
import { createScheduleOperationId } from './decide.ts';
import {
  makeExecuteCreateSchedule,
  type CreateScheduleDependencies,
} from './execute.ts';
import { createScheduleHttpSurfaces } from './http.ts';
import type { ScheduleProposal } from '../../../model/production-schedule/model.ts';
import type {
  CreateScheduleCommand,
  CreateScheduleExpectedFailure,
} from './types.ts';
export const createScheduleCellDeclaration = defineOperation<
  CreateScheduleCommand,
  ScheduleProposal,
  CreateScheduleExpectedFailure
>({
  kind: 'command',
  id: createScheduleOperationId,
  contract: createScheduleContract,
  authorization: {
    capability: 'production:schedule',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.locationId,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: createScheduleHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.create_schedule' },
});
export const makeCreateScheduleCell = <Stored>(
  deps: CreateScheduleDependencies<Stored>,
) =>
  defineOperation(
    createScheduleCellDeclaration,
    makeExecuteCreateSchedule(deps),
  );
