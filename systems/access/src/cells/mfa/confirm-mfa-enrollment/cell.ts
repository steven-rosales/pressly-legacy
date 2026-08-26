import { defineOperation } from '@pressly/cells';
import { confirmMfaEnrollmentContract } from './contract.ts';
import type { ConfirmMfaEnrollment } from './confirm-mfa-enrollment.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const confirmMfaEnrollmentCellDeclaration = defineOperation<
  OperationInput<ConfirmMfaEnrollment>,
  OperationOutput<ConfirmMfaEnrollment>,
  OperationFailure<ConfirmMfaEnrollment>
>({
  kind: 'command',
  id: 'access.confirm-mfa-enrollment.v1',
  authentication: 'required',
  contract: confirmMfaEnrollmentContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.identityId,
  },
  idempotency: { required: false },
  surfaces: [],
  observability: { operation: 'identity.confirm_mfa_enrollment' },
});

export const makeConfirmMfaEnrollmentCell = (operation: ConfirmMfaEnrollment) =>
  defineOperation(
    confirmMfaEnrollmentCellDeclaration,
    resultOperation(operation),
  );
