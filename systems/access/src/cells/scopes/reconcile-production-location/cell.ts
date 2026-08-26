import { defineOperation } from '@pressly/cells';
import { reconcileProductionLocationContract } from './contract.ts';
import {
  makeExecuteReconcileProductionLocation,
  type ReconcileProductionLocationDependencies,
} from './execute.ts';
import type {
  ReconcileProductionLocationCommand,
  ReconcileProductionLocationResult,
} from './types.ts';
import { reconcileProductionLocationOperationId } from './types.ts';

export const reconcileProductionLocationCellDeclaration = defineOperation<
  ReconcileProductionLocationCommand,
  ReconcileProductionLocationResult,
  never
>({
  kind: 'command',
  id: reconcileProductionLocationOperationId,
  authentication: 'none',
  contract: reconcileProductionLocationContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.location.id,
  },
  idempotency: { required: false },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: {
    operation: 'access.reconcile_production_location',
  },
});

export const makeReconcileProductionLocationCell = (
  dependencies: ReconcileProductionLocationDependencies,
) =>
  defineOperation(
    reconcileProductionLocationCellDeclaration,
    makeExecuteReconcileProductionLocation(dependencies),
  );
