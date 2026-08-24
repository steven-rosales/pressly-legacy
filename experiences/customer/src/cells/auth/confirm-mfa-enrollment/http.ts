import { http } from '@pressly/cells';
import {
  parsedBody,
  principalContext,
  requestId,
  validateBody,
} from '../../../auth/model/http.ts';
import { presentCustomerAuth } from '../../../auth/model/presentation.ts';
import {
  confirmMfaBodySchema,
  type MfaFailure,
  type RecoveryCodes,
} from '../../../auth/model/schemas.ts';
import { customerConfirmMfaEnrollmentContract } from './contract.ts';

export const customerConfirmMfaEnrollmentHttpSurface = http.post<
  RecoveryCodes,
  MfaFailure
>({
  path: '/auth/mfa/enrollment/confirm',
  bodyLimit: '4kb',
  contextRequirements: ['authenticated-principal', 'request-metadata'],
  invalidRequest: {
    input: {
      code: 'invalid_body_type',
      message: 'Validation body failed.',
      location: 'body',
    },
  },
  validateRequest: validateBody(confirmMfaBodySchema),
  toSerializedInput: (request) => {
    const body = parsedBody(request, confirmMfaBodySchema);
    const principal = principalContext(request);
    return {
      identityId: principal.identityId,
      sessionId: principal.sessionId,
      code: body.code,
      ...(requestId(request) === undefined
        ? {}
        : { requestId: requestId(request) }),
    };
  },
  present: (outcome) =>
    presentCustomerAuth(
      outcome,
      customerConfirmMfaEnrollmentContract.output.encode,
    ),
});
