import { http } from '@pressly/cells';
import { z } from 'zod';
import {
  parsedParams,
  principalContext,
  requestId,
  validateParams,
} from '../../../auth/model/http.ts';
import { presentCustomerValue } from '../../../auth/model/presentation.ts';
import { type RevokedCount } from '../../../auth/model/schemas.ts';
import { customerRevokeIdentitySessionContract } from './contract.ts';

const paramsSchema = z
  .object({ identityId: z.uuid(), sessionId: z.uuid() })
  .strict();

const decodeScope = http.validatedPathScope({
  schema: paramsSchema,
  input: (params) => params,
  scope: (input) => `auth.identity:${input.identityId}`,
});

export const customerRevokeIdentitySessionHttpSurface = http.post<
  RevokedCount,
  never
>({
  path: '/auth/identities/:identityId/sessions/:sessionId/revoke',
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
  validateRequest: validateParams(paramsSchema),
  decodeAuthorizationScope: decodeScope,
  toSerializedInput: (request) => {
    const params = parsedParams(request, paramsSchema);
    const principal = principalContext(request);
    return {
      principalIdentityId: principal.identityId,
      identityId: params.identityId,
      sessionId: params.sessionId,
      ...(requestId(request) === undefined
        ? {}
        : { requestId: requestId(request) }),
    };
  },
  present: (outcome) =>
    presentCustomerValue(
      outcome,
      customerRevokeIdentitySessionContract.output.encode,
    ),
});
