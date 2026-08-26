import { defineOperation } from '@pressly/cells';
import { recordOrderIntakeContract } from './contract.ts';
import { recordOrderIntakeOperationId } from './decide.ts';
import {
  makeExecuteRecordOrderIntake,
  type RecordOrderIntakeDependencies,
} from './execute.ts';
import { recordOrderIntakeHttpSurfaces } from './http.ts';
import type {
  RecordOrderIntakeCommand,
  RecordOrderIntakeExpectedFailure,
  RecordOrderIntakeResult,
} from './types.ts';

export const recordOrderIntakeCellDeclaration = defineOperation<
  RecordOrderIntakeCommand,
  RecordOrderIntakeResult,
  RecordOrderIntakeExpectedFailure
>({
  kind: 'command',
  id: recordOrderIntakeOperationId,
  contract: recordOrderIntakeContract,
  authorization: {
    capability: 'production:intake',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: recordOrderIntakeHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.record_order_intake' },
});

export const makeRecordOrderIntakeCell = <StoredWorkEvent>(
  deps: RecordOrderIntakeDependencies<StoredWorkEvent>,
) =>
  defineOperation(
    recordOrderIntakeCellDeclaration,
    makeExecuteRecordOrderIntake(deps),
  );
