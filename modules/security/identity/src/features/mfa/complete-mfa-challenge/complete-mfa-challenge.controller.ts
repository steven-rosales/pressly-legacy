import {
  defineRequestBoundary,
  sendValidatedApiResult,
} from '@pressly/http/express';
import type { RequestHandler } from 'express';
import { mfaFailureToAppError } from '../../../foundations/adapters/http/mfa-request/mfa-failure.adapter.ts';
import { readMfaRequestId } from '../../../foundations/adapters/http/mfa-request/mfa-principal.adapter.ts';
import {
  completeMfaChallengeContract,
  toCompletedMfaChallengeResult,
} from './complete-mfa-challenge.contract.mapper.ts';
import type { CompleteMfaChallenge } from './complete-mfa-challenge.usecase.ts';

export const completeMfaChallengeBoundary = defineRequestBoundary({
  body: completeMfaChallengeContract.request,
});

export const makeCompleteMfaChallengeController = (
  complete: CompleteMfaChallenge,
): RequestHandler =>
  completeMfaChallengeBoundary.handler(async ({ body }, { response }) => {
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
  });
