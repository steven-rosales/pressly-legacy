import { bindCell, declareCommandCell } from '@pressly/cells';
import { bootstrapOwnerContract } from './contract.ts';
import { bootstrapOwnerCliSurface } from './cli.ts';
import type { BootstrapOwner } from './bootstrap-owner.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const bootstrapOwnerCellDeclaration = declareCommandCell<
  OperationInput<BootstrapOwner>,
  OperationOutput<BootstrapOwner>,
  OperationFailure<BootstrapOwner>
>({
  id: 'access.bootstrap-owner.v2',
  authentication: 'none',
  contract: bootstrapOwnerContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: () => 'access.bootstrap-owner',
  },
  idempotency: { required: false },
  surfaces: [bootstrapOwnerCliSurface],
  observability: { operation: 'identity.bootstrap_owner' },
});

export const makeBootstrapOwnerCell = (operation: BootstrapOwner) =>
  bindCell(bootstrapOwnerCellDeclaration, resultOperation(operation));
