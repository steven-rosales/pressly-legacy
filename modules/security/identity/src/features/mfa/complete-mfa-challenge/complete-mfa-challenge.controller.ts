import {
  defineValidatedController,
  sendValidatedApiResult,
} from '@pressly/http/express';
import { mfaFailureToAppError } from '../../../foundations/adapters/http/mfa-request/mfa-failure.adapter.ts';
import { readMfaRequestId } from '../../../foundations/adapters/http/mfa-request/mfa-principal.adapter.ts';
import {
  completeMfaChallengeContract,
  toCompletedMfaChallengeResult,
} from './complete-mfa-challenge.contract.mapper.ts';
import type { CompleteMfaChallenge } from './complete-mfa-challenge.usecase.ts';

export const makeCompleteMfaChallengeController = (
  complete: CompleteMfaChallenge,
) =>
  defineValidatedController({
    request: { body: completeMfaChallengeContract.request },
    handle: async ({ body }, { response }) => {
      const requestId = readMfaRequestId(response);
      const completed = await complete({
        ...body,
        ...(requestId === undefined ? {} : { requestId }),
      });

      sendValidatedApiResult(response, completed, {
        schema: completeMfaChallengeContract.response,
        present: toCompletedMfaChallengeResult,
        mapFailure: mfaFailureToAppError,
      });
    },
  });
