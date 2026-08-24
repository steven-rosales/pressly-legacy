import { http } from '@pressly/cells';
import {
  parsedParams,
  principalContext,
  requestId,
  validateParams,
} from '../../../auth/model/http.ts';
import { presentCustomerValue } from '../../../auth/model/presentation.ts';
import {
  identityInputSchema,
  type RevokedCount,
} from '../../../auth/model/schemas.ts';
import { customerRevokeAllIdentitySessionsContract } from './contract.ts';

const decodeScope = http.validatedPathScope({
  schema: identityInputSchema,
  input: (params) => params,
  scope: (input) => `auth.identity:${input.identityId}`,
});

export const customerRevokeAllIdentitySessionsHttpSurface = http.post<
  RevokedCount,
  never
>({
  path: '/auth/identities/:identityId/sessions/revoke-all',
  bodyLimit: '64kb',
  contextRequirements: ['authenticated-principal', 'request-metadata'],
  invalidRequest: {
    authorizationScope: {
      code: 'invalid_params_type',
      message: 'Validation params failed.',
      location: 'params',
    },
    input: {
      code: 'invalid_params_type',
      message: 'Validation params failed.',
      location: 'params',
    },
  },
  validateRequest: validateParams(identityInputSchema),
  decodeAuthorizationScope: decodeScope,
  toSerializedInput: (request) => {
    const params = parsedParams(request, identityInputSchema);
    const principal = principalContext(request);
    return {
      principalIdentityId: principal.identityId,
      identityId: params.identityId,
      ...(requestId(request) === undefined
        ? {}
        : { requestId: requestId(request) }),
    };
  },
  present: (outcome) =>
    presentCustomerValue(
      outcome,
      customerRevokeAllIdentitySessionsContract.output.encode,
    ),
});
