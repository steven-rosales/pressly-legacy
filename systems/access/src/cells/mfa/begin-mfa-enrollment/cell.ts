import { bindCell, declareCommandCell } from '@pressly/cells';
import { beginMfaEnrollmentContract } from './contract.ts';
import type { BeginMfaEnrollment } from './begin-mfa-enrollment.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const beginMfaEnrollmentCellDeclaration = declareCommandCell<
  OperationInput<BeginMfaEnrollment>,
  OperationOutput<BeginMfaEnrollment>,
  OperationFailure<BeginMfaEnrollment>
>({
  id: 'access.begin-mfa-enrollment.v1',
  authentication: 'required',
  contract: beginMfaEnrollmentContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [],
  observability: { operation: 'identity.begin_mfa_enrollment' },
});

export const makeBeginMfaEnrollmentCell = (operation: BeginMfaEnrollment) =>
  bindCell(beginMfaEnrollmentCellDeclaration, resultOperation(operation));
