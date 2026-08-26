import { defineOperation } from '@pressly/cells';
import { beginMfaEnrollmentContract } from './contract.ts';
import type { BeginMfaEnrollment } from './begin-mfa-enrollment.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const beginMfaEnrollmentCellDeclaration = defineOperation<
  OperationInput<BeginMfaEnrollment>,
  OperationOutput<BeginMfaEnrollment>,
  OperationFailure<BeginMfaEnrollment>
>({
  kind: 'command',
  id: 'access.begin-mfa-enrollment.v1',
  authentication: 'required',
  contract: beginMfaEnrollmentContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [],
  observability: { operation: 'identity.begin_mfa_enrollment' },
});

export const makeBeginMfaEnrollmentCell = (operation: BeginMfaEnrollment) =>
  defineOperation(
    beginMfaEnrollmentCellDeclaration,
    resultOperation(operation),
  );
