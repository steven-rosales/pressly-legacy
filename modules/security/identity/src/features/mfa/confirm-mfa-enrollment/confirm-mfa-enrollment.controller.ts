import {
  defineValidatedController,
  sendValidatedApiResult,
} from '@pressly/http/express';
import { mfaFailureToAppError } from '../../../foundations/adapters/http/mfa-request/mfa-failure.adapter.ts';
import {
  readMfaPrincipal,
  readMfaRequestId,
} from '../../../foundations/adapters/http/mfa-request/mfa-principal.adapter.ts';
import {
  confirmMfaEnrollmentContract,
  toMfaRecoveryCodesResult,
} from './confirm-mfa-enrollment.contract.mapper.ts';
import type { ConfirmMfaEnrollment } from './confirm-mfa-enrollment.usecase.ts';

export const makeConfirmMfaEnrollmentController = (
  confirm: ConfirmMfaEnrollment,
) =>
  defineValidatedController({
    request: { body: confirmMfaEnrollmentContract.request },
    handle: async ({ body }, { response }) => {
      const principal = readMfaPrincipal(response);
      const requestId = readMfaRequestId(response);
      const recoveryCodes = await confirm({
        identityId: principal.identityId,
        sessionId: principal.sessionId,
        code: body.code,
        ...(requestId === undefined ? {} : { requestId }),
      });

      sendValidatedApiResult(response, recoveryCodes, {
        schema: confirmMfaEnrollmentContract.response,
        present: toMfaRecoveryCodesResult,
        mapFailure: mfaFailureToAppError,
      });
    },
  });
