import { http } from '@pressly/cells';
import { principalContext, requestId } from '../../../auth/model/http.ts';
import { presentCustomerAuth } from '../../../auth/model/presentation.ts';
import {
  type Enrollment,
  type MfaFailure,
} from '../../../auth/model/schemas.ts';
import { customerBeginMfaEnrollmentContract } from './contract.ts';

export const customerBeginMfaEnrollmentHttpSurface = http.post<
  Enrollment,
  MfaFailure
>({
  path: '/auth/mfa/enrollment',
  bodyLimit: '64kb',
  contextRequirements: ['authenticated-principal', 'request-metadata'],
  toSerializedInput: (request) => {
    const principal = principalContext(request);
    return {
      identityId: principal.identityId,
      label: principal.label,
      ...(requestId(request) === undefined
        ? {}
        : { requestId: requestId(request) }),
    };
  },
  present: (outcome) =>
    presentCustomerAuth(
      outcome,
      customerBeginMfaEnrollmentContract.output.encode,
    ),
});
