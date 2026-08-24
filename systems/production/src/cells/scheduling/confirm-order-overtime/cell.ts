import { bindCell, declareCommandCell } from '@pressly/cells';
import { confirmOrderOvertimeContract } from './contract.ts';
import { confirmOrderOvertimeOperationId } from './decide.ts';
import {
  makeExecuteConfirmOrderOvertime,
  type ConfirmOrderOvertimeDependencies,
} from './execute.ts';
import { confirmOrderOvertimeHttpSurfaces } from './http.ts';
import type {
  ConfirmOrderOvertimeExpectedFailure,
  ConfirmProductionOrderOvertimeCommand,
  ConfirmProductionOrderOvertimeResult,
} from './types.ts';

export const confirmOrderOvertimeCellDeclaration = declareCommandCell<
  ConfirmProductionOrderOvertimeCommand,
  ConfirmProductionOrderOvertimeResult,
  ConfirmOrderOvertimeExpectedFailure
>({
  id: confirmOrderOvertimeOperationId,
  contract: confirmOrderOvertimeContract,
  authorization: {
    capability: 'production:override',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedQueueVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: confirmOrderOvertimeHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.confirm_order_overtime' },
});

export const makeConfirmOrderOvertimeCell = <StoredWorkEvent>(
  deps: ConfirmOrderOvertimeDependencies<StoredWorkEvent>,
) =>
  bindCell(
    confirmOrderOvertimeCellDeclaration,
    makeExecuteConfirmOrderOvertime(deps),
  );
