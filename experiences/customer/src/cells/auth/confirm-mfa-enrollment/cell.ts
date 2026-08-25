import { bindCell, declareCommandCell } from '@pressly/cells';
import type { AccessExecute } from '../../../auth/model/access.ts';
import { customerConfirmMfaEnrollmentContract } from './contract.ts';
import { makeExecuteCustomerConfirmMfaEnrollment } from './execute.ts';
import { customerConfirmMfaEnrollmentHttpSurface } from './http.ts';

export const customerConfirmMfaEnrollmentCellDeclaration = declareCommandCell({
  id: 'customer.confirm-mfa-enrollment.v1',
  contract: customerConfirmMfaEnrollmentContract,
  authorization: {
    capability: 'auth:mfa:enroll',
    timing: 'after-input',
    scope: (input) => `auth.identity:${input.identityId}`,
  },
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [customerConfirmMfaEnrollmentHttpSurface],
  observability: {
    operation: 'customer.authentication.confirm_mfa_enrollment',
  },
});

export const makeCustomerConfirmMfaEnrollmentCell = (
  access: AccessExecute<'confirmMfaEnrollment'>,
) =>
  bindCell(
    customerConfirmMfaEnrollmentCellDeclaration,
    makeExecuteCustomerConfirmMfaEnrollment(access),
  );
