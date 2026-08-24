import { http } from '@pressly/cells';
import { principalContext, requestId } from '../../../auth/model/http.ts';
import { presentCustomerValue } from '../../../auth/model/presentation.ts';
import { type RecoveryCodes } from '../../../auth/model/schemas.ts';
import { customerRegenerateMfaRecoveryCodesContract } from './contract.ts';

export const customerRegenerateMfaRecoveryCodesHttpSurface = http.post<
  RecoveryCodes,
  never
>({
  path: '/auth/mfa/recovery-codes/regenerate',
  bodyLimit: '64kb',
  contextRequirements: ['authenticated-principal', 'request-metadata'],
  toSerializedInput: (request) => ({
    identityId: principalContext(request).identityId,
    ...(requestId(request) === undefined
      ? {}
      : { requestId: requestId(request) }),
  }),
  present: (outcome) =>
    presentCustomerValue(
      outcome,
      customerRegenerateMfaRecoveryCodesContract.output.encode,
    ),
});
