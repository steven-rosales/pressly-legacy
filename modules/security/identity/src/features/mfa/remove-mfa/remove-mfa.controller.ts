import { sendValidatedApiValue } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import {
  readMfaPrincipal,
  readMfaRequestId,
} from '../../../foundations/adapters/http/mfa-request/mfa-principal.adapter.ts';
import {
  removeMfaContract,
  toMfaMutationResult,
} from './remove-mfa.contract.mapper.ts';
import type { RemoveMfa } from './remove-mfa.usecase.ts';

export const makeRemoveMfaController =
  (remove: RemoveMfa): RequestHandler =>
  async (_request, response) => {
    const principal = readMfaPrincipal(response);
    const requestId = readMfaRequestId(response);
    const removed = await remove({
      identityId: principal.identityId,
      sessionId: principal.sessionId,
      ...(requestId === undefined ? {} : { requestId }),
    });

    sendValidatedApiValue(response, removed, {
      schema: removeMfaContract.response,
      present: toMfaMutationResult,
    });
  };
