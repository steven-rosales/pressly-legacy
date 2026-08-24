import { http } from '@pressly/cells';
import { bearerToken } from '../../../auth/model/http.ts';
import { presentCustomerAuth } from '../../../auth/model/presentation.ts';
import {
  type SessionOutput,
  type LoadSessionFailure,
} from '../../../auth/model/schemas.ts';
import { customerLoadSessionContract } from './contract.ts';

export const customerLoadSessionHttpSurface = http.get<
  SessionOutput,
  LoadSessionFailure
>({
  path: '/auth/session',
  bodyLimit: '64kb',
  toSerializedInput: (request) => ({ bearerToken: bearerToken(request) }),
  present: (outcome) =>
    presentCustomerAuth(outcome, customerLoadSessionContract.output.encode),
});
