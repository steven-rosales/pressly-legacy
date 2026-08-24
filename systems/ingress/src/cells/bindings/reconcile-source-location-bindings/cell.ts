import { bindCell, declareCommandCell } from '@pressly/cells';
import type { ReconcileSourceLocationBindingsResult } from './model.ts';
import { reconcileSourceLocationBindingsContract } from './contract.ts';
import {
  makeExecuteReconcileSourceLocationBindings,
  type ReconcileSourceLocationBindingsDependencies,
} from './execute.ts';
import {
  reconcileSourceLocationBindingsOperationId,
  type ReconcileSourceLocationBindingsCommand,
  type ReconcileSourceLocationBindingsExpectedFailure,
} from './types.ts';

export const reconcileSourceLocationBindingsCellDeclaration =
  declareCommandCell<
    ReconcileSourceLocationBindingsCommand,
    ReconcileSourceLocationBindingsResult,
    ReconcileSourceLocationBindingsExpectedFailure
  >({
    id: reconcileSourceLocationBindingsOperationId,
    authentication: 'none',
    contract: reconcileSourceLocationBindingsContract,
    consistency: { transaction: 'required', concurrency: 'none' },
    idempotency: { required: false },
    surfaces: [],
    emits: [],
    consumes: [],
    observability: { operation: 'ingress.reconcile_source_location_bindings' },
  });

export const makeReconcileSourceLocationBindingsCell = (
  deps: ReconcileSourceLocationBindingsDependencies,
) =>
  bindCell(
    reconcileSourceLocationBindingsCellDeclaration,
    makeExecuteReconcileSourceLocationBindings(deps),
  );
