import { http } from '@pressly/cells';
import { bearerToken, requestId } from '../../../auth/model/http.ts';
import { presentCustomerValue } from '../../../auth/model/presentation.ts';
import { type LogoutOutput } from '../../../auth/model/schemas.ts';
import { customerLogoutContract } from './contract.ts';

export const customerLogoutHttpSurface = http.post<LogoutOutput, never>({
  path: '/auth/logout',
  bodyLimit: '64kb',
  contextRequirements: ['request-metadata'],
  toSerializedInput: (request) => ({
    bearerToken: bearerToken(request),
    ...(requestId(request) === undefined
      ? {}
      : { requestId: requestId(request) }),
  }),
  present: (outcome) =>
    presentCustomerValue(outcome, customerLogoutContract.output.encode),
});
