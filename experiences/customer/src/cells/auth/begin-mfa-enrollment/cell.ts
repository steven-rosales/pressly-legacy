import { bindCell, declareCommandCell } from '@pressly/cells';
import type { AccessExecute } from '../../../auth/model/access.ts';
import { customerBeginMfaEnrollmentContract } from './contract.ts';
import { makeExecuteCustomerBeginMfaEnrollment } from './execute.ts';
import { customerBeginMfaEnrollmentHttpSurface } from './http.ts';

export const customerBeginMfaEnrollmentCellDeclaration = declareCommandCell({
  id: 'customer.begin-mfa-enrollment.v1',
  contract: customerBeginMfaEnrollmentContract,
  authorization: {
    capability: 'auth:mfa:enroll',
    timing: 'after-input',
    scope: (input) => `auth.identity:${input.identityId}`,
  },
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [customerBeginMfaEnrollmentHttpSurface],
  observability: { operation: 'customer.authentication.begin_mfa_enrollment' },
});

export const makeCustomerBeginMfaEnrollmentCell = (
  access: AccessExecute<'beginMfaEnrollment'>,
) =>
  bindCell(
    customerBeginMfaEnrollmentCellDeclaration,
    makeExecuteCustomerBeginMfaEnrollment(access),
  );
