import { http } from '@pressly/cells';
import {
  parsedBody,
  requestMetadata,
  validateBody,
} from '../../../auth/model/http.ts';
import { presentCustomerAuth } from '../../../auth/model/presentation.ts';
import {
  loginBodySchema,
  type LoginOutput,
  type LoginFailure,
} from '../../../auth/model/schemas.ts';
import { customerLoginContract } from './contract.ts';

export const customerLoginHttpSurface = http.post<LoginOutput, LoginFailure>({
  path: '/auth/login',
  bodyLimit: '8kb',
  contextRequirements: ['request-metadata'],
  invalidRequest: {
    input: {
      code: 'invalid_body_type',
      message: 'Validation body failed.',
      location: 'body',
    },
  },
  validateRequest: validateBody(loginBodySchema),
  toSerializedInput: (request) => ({
    ...parsedBody(request, loginBodySchema),
    ...requestMetadata(request),
  }),
  present: (outcome) =>
    presentCustomerAuth(outcome, customerLoginContract.output.encode),
});
