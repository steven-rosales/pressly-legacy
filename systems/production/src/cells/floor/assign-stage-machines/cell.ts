import { defineOperation } from '@pressly/cells';
import { assignStageMachinesContract } from './contract.ts';
import { assignStageMachinesOperationId } from './decide.ts';
import {
  makeExecuteAssignStageMachines,
  type AssignStageMachinesDependencies,
} from './execute.ts';
import { assignStageMachinesHttpSurfaces } from './http.ts';
import type {
  AssignStageMachinesCommand,
  AssignStageMachinesExpectedFailure,
  AssignStageMachinesResult,
} from './types.ts';

export const assignStageMachinesCellDeclaration = defineOperation<
  AssignStageMachinesCommand,
  AssignStageMachinesResult,
  AssignStageMachinesExpectedFailure
>({
  kind: 'command',
  id: assignStageMachinesOperationId,
  contract: assignStageMachinesContract,
  authorization: {
    capability: 'production:stage',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: assignStageMachinesHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.assign_stage_machines' },
});

export const makeAssignStageMachinesCell = <StoredWorkEvent>(
  deps: AssignStageMachinesDependencies<StoredWorkEvent>,
) =>
  defineOperation(
    assignStageMachinesCellDeclaration,
    makeExecuteAssignStageMachines(deps),
  );
