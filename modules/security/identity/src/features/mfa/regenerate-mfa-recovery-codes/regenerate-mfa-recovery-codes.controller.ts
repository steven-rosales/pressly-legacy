import { catchAsync, sendValidatedApiValue } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import {
  readMfaPrincipal,
  readMfaRequestId,
} from '../../../foundations/adapters/http/mfa-request/mfa-principal.adapter.ts';
import {
  regenerateMfaRecoveryCodesContract,
  toRegeneratedMfaRecoveryCodesResult,
} from './regenerate-mfa-recovery-codes.contract.mapper.ts';
import type { RegenerateMfaRecoveryCodes } from './regenerate-mfa-recovery-codes.usecase.ts';

export const makeRegenerateMfaRecoveryCodesController = (
  regenerate: RegenerateMfaRecoveryCodes,
): RequestHandler =>
  catchAsync(async (_request, response) => {
    const requestId = readMfaRequestId(response);
    const recoveryCodes = await regenerate({
      identityId: readMfaPrincipal(response).identityId,
      ...(requestId === undefined ? {} : { requestId }),
    });

    sendValidatedApiValue(response, recoveryCodes, {
      schema: regenerateMfaRecoveryCodesContract.response,
      present: toRegeneratedMfaRecoveryCodesResult,
    });
  });
