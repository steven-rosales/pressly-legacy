import { defineOperation } from '@pressly/cells';
import { grantWorkforceAccessContract } from './contract.ts';
import type { GrantWorkforceAccess } from './grant-workforce-access.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const grantWorkforceAccessCellDeclaration = defineOperation<
  OperationInput<GrantWorkforceAccess>,
  OperationOutput<GrantWorkforceAccess>,
  OperationFailure<GrantWorkforceAccess>
>({
  kind: 'command',
  id: 'access.grant-workforce-access.v1',
  authentication: 'required',
  contract: grantWorkforceAccessContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.businessId,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [],
  observability: { operation: 'identity.grant_workforce_access' },
});

export const makeGrantWorkforceAccessCell = (operation: GrantWorkforceAccess) =>
  defineOperation(
    grantWorkforceAccessCellDeclaration,
    resultOperation(operation),
  );
