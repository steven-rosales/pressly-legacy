import { http } from '@pressly/cells';
import { parsedParams, validateParams } from '../../../auth/model/http.ts';
import { presentCustomerValue } from '../../../auth/model/presentation.ts';
import {
  identityInputSchema,
  type SessionInventory,
} from '../../../auth/model/schemas.ts';
import { customerListIdentitySessionsContract } from './contract.ts';

const decodeScope = http.validatedPathScope({
  schema: identityInputSchema,
  input: (params) => params,
  scope: (input) => `auth.identity:${input.identityId}`,
});

export const customerListIdentitySessionsHttpSurface = http.get<
  SessionInventory,
  never
>({
  path: '/auth/identities/:identityId/sessions',
  bodyLimit: '64kb',
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
  toSerializedInput: (request) => parsedParams(request, identityInputSchema),
  present: (outcome) =>
    presentCustomerValue(
      outcome,
      customerListIdentitySessionsContract.output.encode,
    ),
});
