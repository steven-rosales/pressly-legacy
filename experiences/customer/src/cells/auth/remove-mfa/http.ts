import { http } from '@pressly/cells';
import { principalContext, requestId } from '../../../auth/model/http.ts';
import { presentCustomerValue } from '../../../auth/model/presentation.ts';
import { type MfaMutation } from '../../../auth/model/schemas.ts';
import { customerRemoveMfaContract } from './contract.ts';

export const customerRemoveMfaHttpSurface = http.post<MfaMutation, never>({
  path: '/auth/mfa/remove',
  bodyLimit: '64kb',
  contextRequirements: ['authenticated-principal', 'request-metadata'],
  toSerializedInput: (request) => {
    const principal = principalContext(request);
    return {
      identityId: principal.identityId,
      sessionId: principal.sessionId,
      ...(requestId(request) === undefined
        ? {}
        : { requestId: requestId(request) }),
    };
  },
  present: (outcome) =>
    presentCustomerValue(outcome, customerRemoveMfaContract.output.encode),
});
