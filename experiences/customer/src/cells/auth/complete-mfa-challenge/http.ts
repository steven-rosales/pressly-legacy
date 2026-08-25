import { http } from '@pressly/cells';
import {
  parsedBody,
  requestId,
  validateBody,
} from '../../../auth/model/http.ts';
import { presentCustomerAuth } from '../../../auth/model/presentation.ts';
import {
  completeMfaBodySchema,
  type AuthenticatedSessionOutput,
  type MfaFailure,
} from '../../../auth/model/schemas.ts';
import { customerCompleteMfaChallengeContract } from './contract.ts';

export const customerCompleteMfaChallengeHttpSurface = http.post<
  AuthenticatedSessionOutput,
  MfaFailure
>({
  path: '/auth/mfa/challenge',
  bodyLimit: '4kb',
  contextRequirements: ['request-metadata'],
  invalidRequest: {
    input: {
      code: 'invalid_body_type',
      message: 'Validation body failed.',
      location: 'body',
    },
  },
  validateRequest: validateBody(completeMfaBodySchema),
  toSerializedInput: (request) => ({
    ...parsedBody(request, completeMfaBodySchema),
    ...(requestId(request) === undefined
      ? {}
      : { requestId: requestId(request) }),
  }),
  present: (outcome) =>
    presentCustomerAuth(
      outcome,
      customerCompleteMfaChallengeContract.output.encode,
    ),
});
